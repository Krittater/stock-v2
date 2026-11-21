// หน้ารับของเข้า: ตารางของที่รอรับ + แผงใบรับ (ของ → จำนวน → ที่ไหน → ยืนยัน) · รอยืนยันยอด (ใบรับของวิศวกร + ยอดตั้งต้น) · UI อย่างเดียว กติกาอยู่ใน domain/receiving.js
(function () {
  const { ref, reactive, computed, watch, nextTick } = Vue;
  const { state, user, act, route, services } = AppState;
  const fmt = (n, unit) => Domain.formatQty(n ?? 0, unit);
  const r2 = (n) => +Number(n).toFixed(2);
  const toast = (severity, detail) => services.toast?.add({ severity, summary: severity === 'warn' ? 'ทำไม่ได้' : 'ผลลัพธ์', detail, life: 4000 });
  const COND = [{ v: 'ok', label: 'ครบดี' }, { v: 'damaged', label: 'ชำรุด' }, { v: 'reject', label: 'ส่งคืนผู้ขาย' }];
  const condLabel = (v) => (COND.find((c) => c.v === v) || {}).label || v;
  const DEFAULT_SHELF = 'ทั่วไป';
  const isBlank = (v) => v === null || v === undefined || v === '' || Number(v) === 0;

  window.Pages.receive = {
    components: { ProductDialog: window.ProductDialog, ConfirmList: window.ConfirmList },
    setup() {
      const byId = computed(() => new Map(state.products.map((p) => [p.id, p])));
      const whOf = (id) => state.warehouses.find((w) => w.id === id);
      const whName = (id) => whOf(id)?.name || '-';
      const userName = (id) => state.users.find((u) => u.id === id)?.name || id || '-';
      const prById = (id) => state.prs.find((r) => r.id === id);
      const isEng = computed(() => user.value.role === 'engineer');
      const tab = ref('receive');
      const sheetOpen = ref(false);

      // ---------- ที่ไหน ----------
      const whOpts = computed(() => state.warehouses.filter((w) => w.active !== false).map((w) => ({ id: w.id, name: w.name, disabled: !!w.countId, counting: !!w.countId })));
      const whId = ref((whOpts.value.find((w) => !w.disabled) || whOpts.value[0])?.id || null);
      let whTouched = false;
      const pickWh = (v) => { whId.value = v; whTouched = true; };
      const wh = computed(() => whOf(whId.value));
      const shelfOpts = computed(() => (whId.value ? Domain.shelves(state, whId.value) : []));
      const shelf = ref(DEFAULT_SHELF);
      watch(shelfOpts, (o) => {
        if (o.length && !o.includes(shelf.value)) shelf.value = o.includes(DEFAULT_SHELF) ? DEFAULT_SHELF : o[0];
        for (const l of lines) if (l.shelf && !o.includes(l.shelf)) l.shelf = null;
      });
      const split = ref(false);
      const hasQc = computed(() => !!(whId.value && Domain.qcShelf(state, whId.value)));

      // ---------- ใบรับ ----------
      let seq = 0;
      const lines = reactive([]); // { key, productId, prId, qty, unit:'base'|'buy', rolls:[], batch, shelf, condition }
      const invoiceNo = ref('');
      const vendor = ref('');
      const receivedAt = ref(Domain.today());
      const note = ref('');
      const overReason = ref('');
      const result = ref(null);
      const busy = ref(false);

      const addLine = (productId, pr) => {
        const p = byId.value.get(productId);
        if (!p) return;
        if (lines.some((l) => l.productId === productId && (l.prId || null) === (pr ? pr.id : null))) return;
        const out = pr ? Domain.outstanding(pr) : 0;
        if (!lines.length && !whTouched && pr) {
          const w = whOf(pr.whId);
          if (w && w.active !== false && !w.countId) whId.value = w.id;
        }
        if (pr && pr.vendor && !vendor.value) vendor.value = pr.vendor;
        lines.push({
          key: ++seq, productId, prId: pr ? pr.id : null, unit: 'base', batch: '', shelf: null, condition: 'ok',
          qty: !p.isRoll && pr ? out : null,
          rolls: p.isRoll ? (pr ? Domain.defaultRollLengths(out, p.rollSize || 100) : [null]) : [],
        });
        if (p.isRoll && !lines[lines.length - 1].rolls.length) lines[lines.length - 1].rolls.push(null);
      };
      const removeLine = (l) => { lines.splice(lines.indexOf(l), 1); if (!lines.length) { whTouched = false; overReason.value = ''; } };
      const factor = (p) => Math.max(1, p.buyFactor || 1);
      // แปลงหน่วยจากยอดหน่วยหลักที่จำไว้ (anchor) ถ้าช่องยังไม่ถูกแก้ จะได้ไม่เพี้ยนเมื่อสลับไปมา
      const setUnit = (l, p, to) => {
        if (to === l.unit) return;
        if (l.qty != null && l.qty !== '') {
          const base = l.anchor && l.anchor.shown === l.qty ? l.anchor.base : r2(l.qty * (l.unit === 'buy' ? factor(p) : 1));
          l.qty = to === 'buy' ? r2(base / factor(p)) : base;
          l.anchor = { base, shown: l.qty };
        }
        l.unit = to;
      };
      const baseOf = (l, p) => (p.isRoll ? r2(l.rolls.reduce((a, v) => a + (Number(v) || 0), 0)) : r2((Number(l.qty) || 0) * (l.unit === 'buy' ? factor(p) : 1)));
      const rowErr = (l, p) => {
        if (p.active === false) return `${p.name} เลิกใช้แล้ว รับของเข้าไม่ได้`;
        const check = (n) => { try { Domain.validateQty(n, p.unit); return ''; } catch (e) { return e.message; } };
        if (p.isRoll) { for (const v of l.rolls) if (!isBlank(v)) { const m = check(Number(v)); if (m) return m; } return ''; }
        return isBlank(l.qty) ? '' : check(baseOf(l, p));
      };
      const rows = computed(() => lines.map((l) => {
        const p = byId.value.get(l.productId);
        const pr = l.prId ? prById(l.prId) : null;
        const err = p ? rowErr(l, p) : '';
        return { l, p, pr, err, base: p && !err ? baseOf(l, p) : 0, whBad: !!(pr && pr.whId !== whId.value) };
      }).filter((r) => r.p));

      // รับไม่ครบ / รับเกิน (ตามกติกาเดียวกับ domain)
      const coverage = computed(() => Domain.receiveCoverage(state, rows.value.filter((r) => r.l.prId).map((r) => ({ prId: r.l.prId, qty: r.base, condition: r.l.condition }))));
      const partial = computed(() => coverage.value.some((c) => c.left > 1e-9));
      const overs = computed(() => coverage.value.filter((c) => c.left < -1e-9).map((c) => Domain.overMessage(-c.left, byId.value.get(c.productId)?.unit)));

      const missing = computed(() => {
        const m = [];
        if (!rows.value.length) return ['ของที่จะรับ'];
        if (rows.value.some((r) => r.err)) m.push('แก้จำนวนที่ผิด');
        else if (!rows.value.some((r) => r.base > 0)) m.push('จำนวนที่รับ (ยังไม่ได้กรอกจำนวนที่รับ)');
        if (!wh.value) m.push('คลังที่รับของ');
        else if (wh.value.countId) m.push('คลังนี้ถูกล็อกเพื่อตรวจนับ รับของเข้าไม่ได้');
        else if (!shelfOpts.value.length) m.push('คลังที่มีชั้นวาง');
        if (rows.value.some((r) => r.whBad)) m.push('บรรทัดที่คลังไม่ตรงกับรายการต้องซื้อ');
        if (rows.value.some((r) => r.l.condition === 'damaged' && r.base > 0) && !hasQc.value) m.push('คลังที่มีชั้นรอตรวจ');
        if (overs.value.length && !overReason.value.trim()) m.push('เหตุผลที่รับเกิน');
        return m;
      });

      const submit = () => {
        if (missing.value.length || busy.value) return;
        busy.value = true;
        const doc = act((s, u) => Domain.receive(s, {
          whId: whId.value, shelf: shelf.value, invoiceNo: invoiceNo.value, vendor: vendor.value, receivedAt: receivedAt.value, note: note.value, overReason: overReason.value,
          lines: rows.value.map(({ l, p }) => ({
            productId: l.productId, prId: l.prId || undefined, condition: l.condition, batch: l.batch,
            ...(p.isRoll ? { rollLengths: l.rolls.filter((v) => !isBlank(v)).map(Number) } : { qty: Number(l.qty) || 0, unit: l.unit }),
            shelf: split.value && l.condition === 'ok' ? l.shelf || shelf.value : undefined,
          })),
        }, u));
        busy.value = false;
        if (!doc) return;
        result.value = doc;
        lines.splice(0); whTouched = false;
        invoiceNo.value = ''; vendor.value = ''; note.value = ''; overReason.value = ''; receivedAt.value = Domain.today(); sheetOpen.value = false;
      };

      // ---------- ตารางของที่รอรับ ----------
      const prRows = computed(() => Domain.openPRs(state).filter((r) => Domain.outstanding(r) > 0).reverse().map((r) => ({ ...r, p: byId.value.get(r.productId), left: Domain.outstanding(r) })).filter((r) => r.p));
      const inSheet = (id) => lines.some((l) => l.prId === id);
      const sel = ref([]);
      const first = ref(0);
      const addPR = (r) => { addLine(r.productId, prById(r.id)); };
      const addSelected = () => {
        for (const r of sel.value) if (prById(r.id)?.status === 'open') addPR(r);
        sel.value = [];
      };

      // ค้นหา / สร้างสินค้า / สแกน
      const acValue = ref('');
      const suggestions = ref([]);
      const search = (e) => { suggestions.value = Domain.searchProducts(state, { text: (e.query || '').trim() }).filter((p) => p.active !== false).slice(0, 20); };
      const addProduct = (id) => {
        const p = byId.value.get(id);
        const pr = Domain.openPRs(state).find((r) => r.productId === id && Domain.outstanding(r) > 0 && (!whTouched || r.whId === whId.value));
        addLine(id, pr || null);
        if (p && !pr) toast('info', `${p.name} ไม่มีใบขอซื้อ ใส่จำนวนที่รับแล้วบันทึกได้เลย`);
      };
      const pick = async (e) => { addProduct(e.value.id); await nextTick(); acValue.value = ''; };
      const createOpen = ref(false);
      const onCreated = (p) => addLine(p.id, null);
      const onScan = ({ id }) => addProduct(id);

      // ?pr= จากหน้าอื่น: ใส่บรรทัดนั้นให้เลย (ครั้งเดียวต่อค่าใน URL)
      const applyPr = (id) => { const r = id && prById(id); if (r && r.status === 'open' && Domain.outstanding(r) > 0) { addLine(r.productId, r); tab.value = 'receive'; } };
      applyPr(route.query.pr);
      watch(() => route.query.pr, applyPr);
      watch(() => user.value.id, () => { lines.splice(0); whTouched = false; overReason.value = ''; invoiceNo.value = ''; vendor.value = ''; note.value = ''; receivedAt.value = Domain.today(); if (tab.value === 'pending') tab.value = 'receive'; });

      // ---------- รอยืนยันยอด ----------
      const pend = computed(() => {
        if (!isEng.value) { const a = Domain.approvalItems(state, user.value); return { receipts: a.receipts.slice().reverse(), ccs: a.ccs.slice().reverse() }; }
        // วิศวกรเห็นเฉพาะที่ตัวเองส่ง (ดูสถานะอย่างเดียว) ไม่เห็นของคนอื่น
        const mine = (x) => x.by === user.value.id;
        return { receipts: state.docs.filter((d) => d.type === 'receive' && d.status === 'pending' && mine(d)).reverse(), ccs: (state.ccs || []).filter((c) => (c.stage === 'store' || c.stage === 'head') && mine(c)).reverse() };
      });
      const pendCount = computed(() => pend.value.receipts.length + pend.value.ccs.length);

      // ---------- ผลลัพธ์ ----------
      const rollOf = (id) => state.rolls.find((r) => r.id === id);
      const printLabels = (doc) => {
        const labels = doc.rollIds.map((id) => { const r = rollOf(id); const p = r && byId.value.get(r.productId); return { id, name: p ? p.name : '', qty: r ? fmt(r.length, p?.unit) : '' }; });
        if (!window.UI.printLabels(labels)) toast('warn', 'เบราว์เซอร์บล็อกหน้าต่างพิมพ์ อนุญาตป๊อปอัปแล้วลองใหม่');
      };
      const shelfLabel = (whid, code) => (Domain.qcCodes(state, whid).includes(code) ? 'ชั้นรอตรวจ' : code);

      return {
        state, Domain, COND, condLabel, fmt, whName, userName, byId, isEng, tab, sheetOpen, whOpts, whId, pickWh, wh, shelfOpts, shelf, split, hasQc,
        lines, rows, invoiceNo, vendor, receivedAt, note, overReason, result, busy, addLine, removeLine, setUnit, factor, baseOf, partial, overs, missing, submit,
        prRows, inSheet, sel, first, addPR, addSelected, acValue, suggestions, search, pick, createOpen, onCreated, onScan,
        pend, pendCount, rollOf, printLabels, shelfLabel,
      };
    },
    template: `<div class="receive-page">
      <page-header icon="pi-download" title="รับของเข้า" subtitle="เลือกของที่มาส่ง ใส่จำนวนที่รับจริง แล้วยืนยัน" />
      <p-tabs v-model:value="tab">
        <p-tablist>
          <p-tab value="receive"><i class="pi pi-download" aria-hidden="true"></i> รับของ</p-tab>
          <p-tab value="pending"><i class="pi pi-clock" aria-hidden="true"></i> รอยืนยันยอด ({{ pendCount }})</p-tab>
        </p-tablist>
        <p-tabpanels>
          <p-tabpanel value="receive">
            <div class="rt-layout">
              <section class="card rt-main" aria-labelledby="rc-wait-h">
                <div class="rt-tools">
                  <h2 id="rc-wait-h" class="rc-h2">ของที่รอรับ ({{ prRows.length }})</h2>
                  <p-button label="ใส่ที่เลือกในใบรับ" icon="pi pi-arrow-right" iconPos="right" :disabled="!sel.length" @click="addSelected" />
                </div>
                <div class="rt-tools">
                  <p-autocomplete v-model="acValue" :suggestions="suggestions" optionLabel="name" inputId="rc-ac" placeholder="ค้นหาสินค้า (กรณีไม่มีใบขอซื้อ)" fluid class="rt-search"
                    aria-label="ค้นหาสินค้าที่รับ" @complete="search" @item-select="pick">
                    <template #option="{ option: o }">
                      <div class="rc-opt"><span>{{ o.name }}</span><span class="muted">{{ o.code }} · มี {{ fmt(Domain.qtyOf(state, o.id, whId), o.unit) }}</span></div>
                    </template>
                  </p-autocomplete>
                  <scan-button :kinds="['product']" @found="onScan" />
                  <p-button label="สินค้าไม่มีรหัส" icon="pi pi-plus" severity="secondary" outlined @click="createOpen = true" />
                </div>
                <p-datatable :value="prRows" v-model:selection="sel" dataKey="id" paginator :rows="10" v-model:first="first" class="rt-table rc-table" rowHover>
                  <p-column selectionMode="multiple" headerStyle="width:3rem" bodyClass="c-sel" />
                  <p-column header="รูป" bodyClass="c-img d-only"><template #body="{ data }"><product-thumb :product="data.p" :size="44" /></template></p-column>
                  <p-column header="สินค้า" bodyClass="c-prod">
                    <template #body="{ data }"><product-thumb :product="data.p" :size="44" class="m-only" /><span class="rt-pname">{{ data.p.name }}</span></template>
                  </p-column>
                  <p-column header="เลข" bodyClass="c-doc"><template #body="{ data }"><doc-id :id="data.id" /><span class="rt-sub">{{ whName(data.whId) }}</span></template></p-column>
                  <p-column header="สั่ง" bodyClass="c-issued num"><template #body="{ data }"><span class="m-lbl">สั่ง</span><qty :n="data.qty" :unit="data.p.unit" /></template></p-column>
                  <p-column header="รับแล้ว" bodyClass="c-ret num"><template #body="{ data }"><span class="m-lbl">รับแล้ว</span><qty :n="data.received" :unit="data.p.unit" /></template></p-column>
                  <p-column header="ค้างรับ" bodyClass="c-left num"><template #body="{ data }"><span class="m-lbl">ค้างรับ</span><strong><qty :n="data.left" :unit="data.p.unit" /></strong></template></p-column>
                  <p-column header="ใบเบิกที่รอ" bodyClass="c-by"><template #body="{ data }"><doc-id v-if="data.reqId" :id="data.reqId" /><span v-else class="muted">-</span></template></p-column>
                  <p-column header="" bodyClass="c-act">
                    <template #body="{ data }">
                      <p-button :label="inSheet(data.id) ? 'อยู่ในใบรับแล้ว' : 'ใส่ในใบรับ'" :icon="inSheet(data.id) ? 'pi pi-check' : 'pi pi-plus'" size="small"
                        :severity="inSheet(data.id) ? 'secondary' : null" :outlined="inSheet(data.id)" :disabled="inSheet(data.id)" @click.stop="addPR(data)" />
                    </template>
                  </p-column>
                  <template #empty><div class="table-empty"><p>ไม่มีรายการที่รอรับ</p><p class="muted">ของที่ไม่มีใบขอซื้อ ค้นหาสินค้าด้านบนแล้วรับเข้าได้เลย</p></div></template>
                </p-datatable>
              </section>

              <aside class="card rt-panel" :class="{ open: sheetOpen }" aria-labelledby="rc-h">
                <button type="button" class="rt-sheet-head" :aria-expanded="sheetOpen" @click="sheetOpen = !sheetOpen">
                  <span id="rc-h"><i class="pi pi-download" aria-hidden="true"></i> ใบรับ ({{ rows.length }})</span>
                  <i :class="['pi', sheetOpen ? 'pi-chevron-down' : 'pi-chevron-up']" aria-hidden="true"></i>
                </button>
                <h2 class="rt-head-lg"><i class="pi pi-download" aria-hidden="true"></i> ใบรับ ({{ rows.length }})</h2>
                <div class="rt-body">
                  <h3 class="rt-h3">ของที่จะรับ</h3>
                  <p v-if="!rows.length" class="muted rt-empty">ยังไม่มีของ กด "ใส่ในใบรับ" ที่แถวในตาราง หรือค้นหาสินค้า</p>
                  <div v-for="r in rows" :key="'i' + r.l.key" class="rt-item">
                    <product-thumb :product="r.p" :size="40" />
                    <div class="rt-item-body">
                      <div class="rt-item-name">{{ r.p.name }}</div>
                      <div class="rt-item-qty">
                        <template v-if="r.pr"><doc-id :id="r.pr.id" /> · ค้างรับ {{ fmt(Domain.outstanding(r.pr), r.p.unit) }}</template>
                        <template v-else>ไม่มีใบขอซื้อ</template>
                      </div>
                      <div v-if="r.whBad" class="rt-err" role="alert"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> รายการต้องซื้อนี้เป็นของ {{ whName(r.pr.whId) }} ไม่ตรงกับคลังที่เลือก เลือกคลังให้ตรงหรือเอาออก</div>
                    </div>
                    <button type="button" class="line-remove" :aria-label="'เอา ' + r.p.name + ' ออกจากใบรับ'" @click="removeLine(r.l)"><i class="pi pi-times" aria-hidden="true"></i></button>
                  </div>

                  <template v-if="rows.length">
                    <h3 class="rt-h3">จำนวนที่รับ</h3>
                    <div v-for="r in rows" :key="'q' + r.l.key" class="rt-roll" :class="{ bad: r.err }">
                      <div class="rt-item-name">{{ r.p.name }}</div>
                      <template v-if="r.p.isRoll">
                        <div v-for="(v, i) in r.l.rolls" :key="i" class="rc-roll-row">
                          <span class="rc-roll-n">ม้วน {{ i + 1 }}</span>
                          <p-inputnumber v-model="r.l.rolls[i]" :min="0" :minFractionDigits="0" :maxFractionDigits="2" :useGrouping="false" suffix=" ม."
                            :ariaLabel="'ความยาวม้วนที่ ' + (i + 1) + ' ' + r.p.name" class="rc-roll-in" />
                          <button type="button" class="line-remove" :aria-label="'ลบม้วนที่ ' + (i + 1)" :disabled="r.l.rolls.length < 2" @click="r.l.rolls.splice(i, 1)"><i class="pi pi-trash" aria-hidden="true"></i></button>
                        </div>
                        <p-button label="เพิ่มม้วน" icon="pi pi-plus" size="small" severity="secondary" outlined @click="r.l.rolls.push(null)" />
                        <div class="field rc-mt"><label :for="'bt' + r.l.key">ล็อตผู้ผลิต (ถ้ามี)</label><p-inputtext :id="'bt' + r.l.key" v-model="r.l.batch" placeholder="เช่น TH-2408" fluid /></div>
                        <p class="rt-msg">รวม {{ fmt(r.base, r.p.unit) }} · ระบบจะออกเลขม้วนให้อัตโนมัติ</p>
                      </template>
                      <template v-else>
                        <div class="rc-qty-row">
                          <p-inputnumber v-model="r.l.qty" :min="0" :minFractionDigits="0" :maxFractionDigits="r.l.unit === 'buy' ? 2 : (r.p.unit === 'เมตร' ? 2 : 3)" :useGrouping="false"
                            :placeholder="Domain.unitAbbr(r.p.unit)" :invalid="!!r.err" :ariaLabel="'จำนวนที่รับ ' + r.p.name" class="rc-qty" />
                          <span v-if="r.l.unit === 'base' || factor(r.p) === 1">{{ r.p.unit }}</span>
                        </div>
                        <p-selectbutton v-if="factor(r.p) > 1" :modelValue="r.l.unit" @update:modelValue="v => v && setUnit(r.l, r.p, v)" :options="[{ v: 'base', label: 'หน่วยหลัก (' + r.p.unit + ')' }, { v: 'buy', label: r.p.buyUnit }]"
                          optionLabel="label" optionValue="v" :allowEmpty="false" :ariaLabel="'หน่วยของ ' + r.p.name" class="rc-unit" />
                        <p v-if="factor(r.p) > 1 && r.l.unit === 'buy'" class="rt-msg">= {{ fmt(r.base, r.p.unit) }}</p>
                      </template>
                      <small v-if="r.err" class="rt-err" role="alert">{{ r.err }}</small>
                      <div class="field rc-mt"><label :id="'cd' + r.l.key">สภาพ</label>
                        <p-select v-model="r.l.condition" :options="COND" optionLabel="label" optionValue="v" :ariaLabelledby="'cd' + r.l.key" fluid /></div>
                      <p v-if="r.l.condition === 'damaged'" class="rt-msg"><i class="pi pi-info-circle" aria-hidden="true"></i> ของที่ชำรุดจะแยกไว้ที่ชั้นรอตรวจของคลังนี้</p>
                      <p v-else-if="r.l.condition === 'reject'" class="rt-msg"><i class="pi pi-info-circle" aria-hidden="true"></i> ไม่นับเข้าคลัง และใบขอซื้อยังค้างรับเท่าเดิม</p>
                    </div>
                  </template>

                  <h3 class="rt-h3">รับเข้าที่ไหน</h3>
                  <div class="field">
                    <label id="rc-wh-l">คลัง <span class="req">*</span></label>
                    <p-select :modelValue="whId" @update:modelValue="pickWh" :options="whOpts" optionLabel="name" optionValue="id" optionDisabled="disabled" placeholder="เลือกคลัง" ariaLabelledby="rc-wh-l" fluid>
                      <template #option="{ option }"><span class="opt-row"><span>{{ option.name }}</span><span v-if="option.counting" class="status-tag tone-yellow">กำลังตรวจนับ</span></span></template>
                    </p-select>
                    <small v-if="wh && wh.countId" class="rt-err" role="alert">คลังนี้ถูกล็อกเพื่อตรวจนับ รับของเข้าไม่ได้</small>
                  </div>
                  <div class="field">
                    <label id="rc-sh-l">ชั้นวาง</label>
                    <p-select v-model="shelf" :options="shelfOpts" :disabled="!shelfOpts.length" ariaLabelledby="rc-sh-l" fluid />
                    <small v-if="whId && !shelfOpts.length" class="rt-err">คลังนี้ไม่มีชั้นวาง เลือกคลังอื่น</small>
                  </div>
                  <label class="rt-check"><p-checkbox v-model="split" binary inputId="rc-split" /><span>แยกชั้นรายการ</span></label>
                  <template v-if="split">
                    <div v-for="r in rows.filter((x) => x.l.condition === 'ok')" :key="'s' + r.l.key" class="field">
                      <label :id="'sh' + r.l.key">ชั้นของ {{ r.p.name }}</label>
                      <p-select :modelValue="r.l.shelf || shelf" @update:modelValue="r.l.shelf = $event" :options="shelfOpts" :ariaLabelledby="'sh' + r.l.key" fluid />
                    </div>
                  </template>

                  <h3 class="rt-h3">ข้อมูลใบส่งของ</h3>
                  <div class="field"><label for="rc-inv">เลขใบส่งของ/ใบกำกับ</label><p-inputtext id="rc-inv" v-model="invoiceNo" fluid /></div>
                  <div class="field"><label for="rc-ven">ผู้ขาย</label><p-inputtext id="rc-ven" v-model="vendor" fluid /></div>
                  <div class="field"><label for="rc-dt">วันที่รับ</label><input id="rc-dt" type="date" v-model="receivedAt" class="p-inputtext rc-date"></div>
                  <div class="field"><label for="rc-note">หมายเหตุ</label><p-textarea id="rc-note" v-model="note" rows="2" autoResize fluid /></div>

                  <div v-if="partial" class="rt-warn" role="status"><span><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> รับไม่ครบ — รายการต้องซื้อจะคงสถานะ "รับบางส่วน"</span></div>
                  <div v-if="overs.length" class="rt-warn" role="alert">
                    <span v-for="o in overs" :key="o"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> {{ o }}</span>
                    <label for="rc-over" class="rt-lbl">เหตุผลที่รับเกิน <span class="req">*</span></label>
                    <p-inputtext id="rc-over" v-model="overReason" placeholder="เช่น ผู้ขายส่งเกิน แถมให้" fluid />
                  </div>
                </div>
                <div class="rt-foot">
                  <p class="rt-sum"><strong>จะรับ {{ rows.length }} รายการ</strong></p>
                  <p v-if="missing.length" class="submit-block" id="rc-why"><i class="pi pi-lock" aria-hidden="true"></i> ยังขาด: {{ missing.join(' · ') }}</p>
                  <p-button :label="isEng ? 'ส่งให้ Store ยืนยัน' : 'ยืนยันรับของเข้า'" :icon="isEng ? 'pi pi-send' : 'pi pi-check'" class="btn-issue rt-save" :loading="busy"
                    :disabled="!!missing.length" :aria-describedby="missing.length ? 'rc-why' : null" @click="submit" />
                </div>
              </aside>
            </div>
          </p-tabpanel>

          <p-tabpanel value="pending">
            <section class="card rt-main">
              <p class="muted rt-note-top">ใบรับที่วิศวกรส่งมา และยอดตั้งต้นที่รอยืนยัน ยังไม่นับเป็นของในคลังจนกว่าจะยืนยัน</p>
              <p v-if="!pendCount" class="muted rc-empty">ไม่มีรายการที่รอยืนยัน</p>

              <confirm-list :receipts="pend.receipts" :ccs="pend.ccs" />
            </section>
          </p-tabpanel>
        </p-tabpanels>
      </p-tabs>

      <p-dialog :visible="!!result" @update:visible="result = null" modal :header="result && result.status === 'pending' ? 'ส่งให้ Store ยืนยันแล้ว' : 'รับของเข้าเรียบร้อย'" class="result-dialog" :draggable="false">
        <div v-if="result" class="result">
          <p class="result-meta"><doc-id :id="result.id" /> · {{ whName(result.whId) }}</p>
          <p v-if="result.status === 'pending'" class="rt-msg">ใบรับนี้รอ Store ตรวจยืนยันยอด ของยังไม่เข้าคลังจนกว่าจะยืนยัน</p>
          <ul class="result-lines">
            <li v-for="(l, i) in result.lines" :key="i">
              <span class="result-name">{{ byId.get(l.productId)?.name }}</span>
              <span class="result-qty">รับ {{ fmt(l.qty, byId.get(l.productId)?.unit) }} · {{ condLabel(l.condition) }}<template v-if="l.shelf"> · เก็บที่ {{ shelfLabel(result.whId, l.shelf) }}</template></span>
            </li>
          </ul>
          <template v-if="result.rollIds && result.rollIds.length">
            <h3 class="rt-h3">ม้วนที่สร้าง</h3>
            <ul class="result-lines"><li v-for="id in result.rollIds" :key="id"><doc-id :id="id" /><span class="result-qty">{{ rollOf(id) ? fmt(rollOf(id).length, byId.get(rollOf(id).productId)?.unit) : '' }}</span></li></ul>
          </template>
          <template v-if="result.filledDocs && result.filledDocs.length">
            <h3 class="rt-h3">ใบเบิกที่ได้ของ</h3>
            <p class="rt-msg"><i class="pi pi-check-circle" aria-hidden="true"></i> ใบเบิกที่รอของนี้ได้ของแล้ว (แจ้งผู้เบิกแล้ว)</p>
            <p><doc-id v-for="id in result.filledDocs" :key="id" :id="id" class="rc-fill" /></p>
          </template>
        </div>
        <template #footer>
          <p-button v-if="result && result.status === 'posted' && !isEng && result.rollIds.length" label="พิมพ์ป้ายเลขม้วน" icon="pi pi-print" severity="secondary" outlined @click="printLabels(result)" />
          <p-button label="ปิด" @click="result = null" autofocus />
        </template>
      </p-dialog>

      <product-dialog v-model:visible="createOpen" from-search created-note=" เพิ่มในใบรับให้แล้ว" @created="onCreated" />
    </div>`,
  };
})();
