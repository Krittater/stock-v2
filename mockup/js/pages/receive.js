// หน้ารับของเข้า: รายการต้องซื้อที่รอของ · รอยืนยันยอด · ใบรับของ
(function () {
  const { ref, reactive, computed, watch, nextTick } = Vue;
  const { state, user, act, services } = AppState;
  const fmt = (n, unit) => Domain.formatQty(n ?? 0, unit);
  const warn = (detail) => services.toast?.add({ severity: 'warn', summary: 'เลือกไม่ได้', detail, life: 4000 });

  window.Pages.receive = {
    components: { ProductDialog: window.ProductDialog },
    setup() {
      const byId = computed(() => new Map(state.products.map((p) => [p.id, p])));
      const whOf = (id) => state.warehouses.find((w) => w.id === id);
      const whName = (id) => whOf(id)?.name || '-';
      const isEng = computed(() => user.value.role === 'engineer');

      // ---------- ใบรับ ----------
      const whId = ref((state.warehouses.find((w) => !w.countId) || state.warehouses[0])?.id);
      const lines = reactive([]);
      const note = ref('');
      const whOpts = computed(() => state.warehouses.map((w) => ({ id: w.id, name: w.name, counting: !!w.countId })));

      const prById = (id) => state.prs.find((r) => r.id === id);
      // เปลี่ยนคลัง: บรรทัดที่อ้าง PR ของคลังอื่นใช้ไม่ได้ ตัดออก
      watch(whId, (w) => {
        for (let i = lines.length - 1; i >= 0; i--) if (lines[i].prId && prById(lines[i].prId)?.whId !== w) lines.splice(i, 1);
      });

      const addLine = (productId, qty = 1, prId) => {
        const hit = lines.find((l) => l.productId === productId && l.prId === prId);
        if (hit) hit.qty = +((hit.qty || 0) + qty).toFixed(2);
        else lines.push(prId ? { productId, qty, prId } : { productId, qty });
      };

      const lineRows = computed(() => lines.map((l) => {
        const p = byId.value.get(l.productId);
        const have = Domain.qtyOf(state, l.productId, whId.value);
        return { l, p, have, after: +(have + (l.qty || 0)).toFixed(2) };
      }).filter((r) => r.p));

      // ---------- ค้นหา ----------
      const acValue = ref('');
      const suggestions = ref([]);
      const search = (e) => {
        const q = (e.query || '').trim();
        const found = Domain.searchProducts(state, { text: q, whId: whId.value }).slice(0, 20);
        suggestions.value = q ? [...found, { create: true, name: 'สร้างวัสดุใหม่ "' + q + '"', q }] : found;
      };
      const createOpen = ref(false);
      const createName = ref('');
      const pick = async (e) => {
        const o = e.value;
        if (o.create) { createName.value = o.q; createOpen.value = true; } else addLine(o.id);
        await nextTick();
        acValue.value = '';
      };
      const onCreated = (p) => addLine(p.id);

      // ---------- PR ----------
      const prs = computed(() => Domain.openPRs(state).reverse().map((r) => ({ ...r, p: byId.value.get(r.productId) }))); // ใหม่สุดก่อน
      const sel = ref([]);
      const prFirst = ref(0);
      const addPRs = () => {
        const list = sel.value.filter((r) => state.prs.some((x) => x.id === r.id && x.status === 'open'));
        if (!list.length) { sel.value = []; return; }
        if (new Set(list.map((r) => r.whId)).size > 1) return warn('เลือกรายการต้องซื้อจากคลังเดียวกัน');
        const w = list[0].whId;
        if (whOf(w)?.countId) return warn('คลังนี้กำลังตรวจนับ รอให้นับเสร็จก่อน');
        whId.value = w;
        for (const r of list) if (!lines.some((l) => l.prId === r.id)) addLine(r.productId, +(r.qty - r.received).toFixed(2), r.id);
        sel.value = [];
      };

      // ---------- รอยืนยัน ----------
      const pending = computed(() => state.docs.filter((d) => d.type === 'receive' && d.status === 'pending').slice().reverse());
      const userName = (id) => state.users.find((u) => u.id === id)?.name || id;
      const confirm = (d, ok) => act((s, u) => Domain.confirmReceipt(s, d.id, u, ok),
        ok ? 'ยืนยันยอด ' + d.id + ' แล้ว เพิ่มสต็อกเรียบร้อย' : 'บันทึก ' + d.id + ' ว่าไม่มีของแล้ว');

      // ---------- บันทึก ----------
      const blockers = computed(() => {
        if (!whId.value) return 'เลือกคลังที่รับของ';
        if (whOf(whId.value)?.countId) return 'คลังนี้กำลังตรวจนับ เลือกคลังอื่น';
        if (!lines.length) return 'เพิ่มของอย่างน้อย 1 รายการ';
        if (lines.some((l) => !(l.qty > 0))) return 'ใส่จำนวนที่รับให้ครบทุกรายการ';
        return '';
      });
      const save = () => {
        if (blockers.value) return;
        const n = lines.length;
        const d = act((s, u) => Domain.receive(s, { whId: whId.value, note: note.value.trim(), lines: lines.map((l) => ({ ...l })) }, u),
          (x) => (x.status === 'pending' ? 'ส่งให้ Store ยืนยันยอดแล้ว (' + x.id + ')' : 'รับของเข้าแล้ว ' + x.id + ' · ' + n + ' รายการ'));
        if (d) { lines.splice(0); note.value = ''; }
      };

      return { state, Domain, fmt, whName, isEng, whId, whOpts, lines, lineRows, note, acValue, suggestions, search, pick, createOpen, createName,
        onCreated, prs, sel, prFirst, addPRs, pending, userName, confirm, blockers, save, byId };
    },
    template: `<div class="receive-page">
      <page-header icon="pi-download" title="รับของเข้า" subtitle="บันทึกของเข้าคลัง เติมสต็อกและปิดรายการต้องซื้อ" />
      <div class="rc-layout">
        <div class="rc-left">
          <section class="card rc-card" aria-labelledby="pr-h">
            <div class="card-head">
              <h2 id="pr-h">รายการต้องซื้อที่รอของ ({{ prs.length }})</h2>
              <p-button label="ใส่ในใบรับ" icon="pi pi-arrow-right" iconPos="right" :disabled="!sel.length" @click="addPRs" />
            </div>
            <p-datatable :value="prs" v-model:selection="sel" selectionMode="multiple" :metaKeySelection="false" dataKey="id" paginator :rows="10" v-model:first="prFirst" class="rc-table">
              <p-column selectionMode="multiple" headerStyle="width:3rem" />
              <p-column header="PR"><template #body="{ data: r }"><doc-id :id="r.id" /></template></p-column>
              <p-column header="สินค้า"><template #body="{ data: r }"><div class="rc-prod">{{ r.p?.name }}</div></template></p-column>
              <p-column header="คลัง"><template #body="{ data: r }">{{ whName(r.whId) }}</template></p-column>
              <p-column header="ต้องการ"><template #body="{ data: r }"><qty :n="r.qty" :unit="r.p?.unit" /></template></p-column>
              <p-column header="รับแล้ว"><template #body="{ data: r }"><qty :n="r.received" :unit="r.p?.unit" /></template></p-column>
              <p-column header="จากใบเบิก"><template #body="{ data: r }"><doc-id :id="r.reqId" /></template></p-column>
              <template #empty><p class="muted rc-empty">ไม่มีรายการต้องซื้อที่รอของ</p></template>
            </p-datatable>
          </section>

          <section class="card rc-card" aria-labelledby="pd-h">
            <div class="card-head"><h2 id="pd-h">รอยืนยันยอด ({{ pending.length }})</h2></div>
            <p v-if="!pending.length" class="muted rc-empty">ไม่มีใบรับที่รอยืนยัน</p>
            <div v-for="d in pending" :key="d.id" class="rc-pending">
              <div class="rc-pending-top">
                <doc-id :id="d.id" /> <span class="muted">· {{ whName(d.whId) }} · โดย {{ userName(d.by) }}</span>
              </div>
              <ul class="rc-pending-lines">
                <li v-for="l in d.lines" :key="l.productId + (l.prId || '')">{{ byId.get(l.productId)?.name }} <strong><qty :n="l.qty" :unit="byId.get(l.productId)?.unit" /></strong></li>
              </ul>
              <div v-if="!isEng" class="rc-pending-act">
                <p-button label="ยืนยันยอด" icon="pi pi-check" @click="confirm(d, true)" />
                <p-button label="ไม่มีของ" icon="pi pi-times" severity="secondary" outlined @click="confirm(d, false)" />
              </div>
              <p v-else class="muted rc-wait"><i class="pi pi-clock" aria-hidden="true"></i> รอ Store ตรวจยืนยัน</p>
            </div>
          </section>
        </div>

        <section class="card rc-card rc-form" aria-labelledby="rc-h">
          <div class="card-head"><h2 id="rc-h">ใบรับของ</h2></div>
          <div class="field">
            <label id="rc-wh-l">คลังที่รับของ <span class="req">*</span></label>
            <p-select v-model="whId" :options="whOpts" optionLabel="name" optionValue="id" optionDisabled="counting" aria-labelledby="rc-wh-l" class="w-full">
              <template #option="{ option: o }">
                <span class="opt-row"><span>{{ o.name }}</span><span v-if="o.counting" class="status-tag tone-yellow"><span class="dot" aria-hidden="true"></span>กำลังตรวจนับ</span></span>
              </template>
            </p-select>
          </div>
          <div class="field">
            <label for="rc-ac">ค้นหาวัสดุที่จะรับ</label>
            <p-autocomplete v-model="acValue" :suggestions="suggestions" optionLabel="name" inputId="rc-ac" placeholder="พิมพ์ชื่อหรือรหัสวัสดุ..." fluid
              @complete="search" @item-select="pick">
              <template #option="{ option: o }">
                <div v-if="o.create" class="rc-create"><i class="pi pi-plus" aria-hidden="true"></i> {{ o.name }}</div>
                <div v-else class="rc-opt"><span>{{ o.name }}</span><span class="muted">{{ o.code }} · มี {{ fmt(Domain.qtyOf(state, o.id, whId), o.unit) }}</span></div>
              </template>
            </p-autocomplete>
          </div>

          <div v-if="!lineRows.length" class="rc-empty muted">ยังไม่มีรายการ ค้นหาวัสดุหรือเลือกจากรายการต้องซื้อ</div>
          <div v-else class="rc-lines-wrap">
            <table class="rc-lines">
              <thead><tr><th>วัสดุ</th><th>มีอยู่ตอนนี้</th><th>รับเข้า</th><th>หน่วย</th><th>ยอดหลังรับ</th><th>อ้างอิง PR</th><th><span class="sr-only">ลบ</span></th></tr></thead>
              <tbody>
                <tr v-for="r in lineRows" :key="r.l.productId + (r.l.prId || '')">
                  <td class="rc-prod">{{ r.p.name }}</td>
                  <td><qty :n="r.have" :unit="r.p.unit" /></td>
                  <td><p-inputnumber v-model="r.l.qty" @input="r.l.qty = $event.value" :min="0" :minFractionDigits="0" :maxFractionDigits="r.p.unit === 'เมตร' ? 2 : 0"
                    :ariaLabel="'จำนวนที่รับ ' + r.p.name" class="rc-qty" /></td>
                  <td>{{ r.p.unit }}</td>
                  <td><strong><qty :n="r.after" :unit="r.p.unit" /></strong></td>
                  <td><doc-id v-if="r.l.prId" :id="r.l.prId" /><span v-else class="muted">-</span></td>
                  <td><button type="button" class="line-remove" :aria-label="'ลบ ' + r.p.name" @click="lines.splice(lines.indexOf(r.l), 1)"><i class="pi pi-times" aria-hidden="true"></i></button></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="field">
            <label for="rc-note">หมายเหตุ</label>
            <p-textarea id="rc-note" v-model="note" rows="2" autoResize fluid placeholder="เช่น เลขที่ใบส่งของ ผู้ขาย" />
          </div>
          <p v-if="blockers" class="muted rc-block"><i class="pi pi-info-circle" aria-hidden="true"></i> {{ blockers }}</p>
          <p-button :label="isEng ? 'ส่งให้ Store ยืนยัน' : 'บันทึกรับของ'" :icon="isEng ? 'pi pi-send' : 'pi pi-check'" class="rc-save" :disabled="!!blockers" @click="save" />
        </section>
      </div>
      <product-dialog v-model:visible="createOpen" :initial-name="createName" created-note=" เลือกให้แล้ว" @created="onCreated" />
    </div>`,
  };
})();
