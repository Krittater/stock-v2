// หน้าเบิกของ: KPI · แถบหมวด · ตารางสินค้า · ตะกร้า (state.cart) · ผลการเบิก
(function () {
  const { ref, reactive, computed, watch, nextTick, onBeforeUnmount } = Vue;
  const { state, user, act, route, go, services } = AppState;

  const OUTCOME = {
    full: { icon: 'pi-check-circle', tone: 'green', title: 'จ่ายของแล้ว' },
    partial: { icon: 'pi-exclamation-circle', tone: 'orange', title: 'จ่ายแล้วบางส่วน' },
    waiting: { icon: 'pi-clock', tone: 'orange', title: 'บันทึกใบเบิกแล้ว ยังไม่มีของ รอของเข้า' },
    pending: { icon: 'pi-send', tone: 'blue', title: 'ส่งให้หัวหน้าแล้ว รออนุมัติ' },
  };
  const WH_BADGE = {
    full: () => ['ครบ ✓', 'tone-green'],
    partial: (o) => [`ขาด ${o.missing}/${o.total}`, 'tone-orange'],
    none: () => ['ไม่มีของ', 'tone-red'],
    counting: () => ['กำลังตรวจนับ', 'tone-yellow'],
  };
  const fmt = (n, unit) => Domain.formatQty(n ?? 0, unit);
  const toast = (detail, life = 3000) => services.toast?.add({ severity: 'success', summary: 'สำเร็จ', detail, life });

  window.Pages.issue = {
    components: { ProductDialog: window.ProductDialog },
    setup() {
      const cart = computed(() => state.cart); // อ่านสดเสมอ — reset() แทน state.cart ด้วยออบเจกต์ใหม่
      const byId = computed(() => new Map(state.products.map((p) => [p.id, p])));
      const whName = (id) => state.warehouses.find((w) => w.id === id)?.name || '-';

      // ---------- ค้นหา / กรอง ----------
      const qInput = ref(route.query.q || '');
      const text = ref(qInput.value);
      let timer;
      watch(qInput, (v) => { clearTimeout(timer); timer = setTimeout(() => { text.value = v.trim(); }, 150); });
      watch(() => route.query.q, (q) => { qInput.value = q || ''; });
      onBeforeUnmount(() => clearTimeout(timer));

      const categoryId = ref(null);
      const tab = ref('all');
      const brands = ref([]);
      const hideAdded = ref(false);
      const first = ref(0);
      watch([text, categoryId, tab, brands, hideAdded], () => { first.value = 0; });

      const inCart = computed(() => new Set(cart.value.lines.map((l) => l.productId)));
      const base = computed(() => {
        let list = Domain.searchProducts(state, { text: text.value, categoryId: categoryId.value, whId: cart.value.whId });
        if (brands.value.length) list = list.filter((p) => brands.value.includes(p.brand));
        if (hideAdded.value) list = list.filter((p) => !inCart.value.has(p.id));
        return list.map((p) => [p, Domain.stockStatus(state, p, cart.value.whId)]);
      });
      const counts = computed(() => {
        const c = { all: base.value.length, in: 0, low: 0, out: 0 };
        for (const [, s] of base.value) c[s]++;
        return c;
      });
      const rows = computed(() => base.value.filter(([, s]) => tab.value === 'all' || s === tab.value).map(([p]) => p));
      const perPage = ref(20);
      const pageRows = computed(() => rows.value.slice(first.value, first.value + perPage.value));
      const TABS = [['all', 'ทั้งหมด'], ['in', 'มีของ'], ['low', 'ใกล้หมด'], ['out', 'ไม่มีของ']];
      const brandOptions = computed(() => [...new Set(state.products.map((p) => p.brand))].filter((b) => b && b !== '-').sort());
      const filterPop = ref();
      const filterCount = computed(() => brands.value.length + (hideAdded.value ? 1 : 0));

      const kpiTab = (t) => { tab.value = t; };

      // ---------- หมวดหมู่ ----------
      const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
      const tops = computed(() => state.categories.filter((c) => !c.parentId).sort(byOrder));
      const selectedCat = computed(() => state.categories.find((c) => c.id === categoryId.value));
      const stripActive = (c) => categoryId.value === c.id || selectedCat.value?.parentId === c.id;
      const pickTop = (c) => { categoryId.value = stripActive(c) ? null : c.id; };
      const catsOpen = ref(false);
      const catQuery = ref('');
      const catCounts = computed(() => Domain.productCounts(state));
      const catGroups = computed(() => {
        const q = catQuery.value.trim().toLowerCase();
        return tops.value.map((p) => {
          const subs = state.categories.filter((c) => c.parentId === p.id).sort(byOrder);
          const hit = !q || p.name.toLowerCase().includes(q);
          return { p, subs: hit ? subs : subs.filter((s) => s.name.toLowerCase().includes(q)), hit };
        }).filter((g) => g.hit || g.subs.length);
      });
      const pickCat = (id) => { categoryId.value = id; catsOpen.value = false; };
      const manageCats = () => { catsOpen.value = false; go('products', { tab: 'categories' }); };

      // ---------- แถวในตาราง ----------
      const rowWh = reactive({}); // คลังที่ดูต่อแถว (ไม่ persist) — ไม่ได้เลือก = คลังของใบเบิก
      const whOf = (p) => rowWh[p.id] || cart.value.whId;
      const rowQty = (p) => Domain.available(state, p.id, whOf(p));
      const rowStatus = (p) => (state.warehouses.find((w) => w.id === whOf(p))?.countId ? 'counting' : Domain.stockStatus(state, p, whOf(p), { byAvailable: true }));
      const setRowWh = (p, id) => { rowWh[p.id] = id === cart.value.whId ? undefined : id; };
      const whOptions = (p) => state.warehouses.map((w) => ({ id: w.id, label: `${w.name} · ${fmt(Domain.available(state, p.id, w.id), p.unit)}${Domain.pendingOpening(state, p.id, w.id) > 0 ? ` · รอยืนยัน ${fmt(Domain.pendingOpening(state, p.id, w.id), p.unit)}` : ''}` }));
      const cartStatus = (p) => Domain.stockStatus(state, p, cart.value.whId, { byAvailable: true });

      const flashId = ref(null);
      let flashTimer;
      const lineEl = (id) => document.querySelector(`[data-cart-line="${id}"]`);
      const flash = (id) => { flashId.value = id; clearTimeout(flashTimer); flashTimer = setTimeout(() => { flashId.value = null; }, 2000); };
      onBeforeUnmount(() => clearTimeout(flashTimer));
      const add = (p) => { if (!inCart.value.has(p.id)) cart.value.lines.push({ productId: p.id, qty: 1 }); flash(p.id); };
      const showInCart = async (p) => {
        await nextTick();
        lineEl(p.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        flash(p.id);
      };

      const detail = ref(null);
      const detailWh = computed(() => detail.value && state.warehouses.map((w) => ({
        w, qty: Domain.available(state, detail.value.id, w.id), pending: Domain.pendingOpening(state, detail.value.id, w.id), status: w.countId ? 'counting' : Domain.stockStatus(state, detail.value, w.id),
      })));
      const detailPRs = computed(() => detail.value && state.prs.filter((r) => r.productId === detail.value.id && r.status === 'open'));
      const addFromDetail = () => { add(detail.value); detail.value = null; };

      const createOpen = ref(false);
      const onCreated = async (p, { existing, opening }) => {
        if (!inCart.value.has(p.id)) cart.value.lines.push({ productId: p.id, qty: 1 });
        if (existing) toast(`เลือก ${p.name} (${p.id}) แล้ว`); // สร้างใหม่: dialog โชว์ toast เอง
        await nextTick();
        lineEl(p.id)?.querySelector('input')?.focus({ preventScroll: true });
        flash(p.id);
      };

      // ---------- ตะกร้า ----------
      const cartRows = computed(() => cart.value.lines.map((l) => {
        const p = byId.value.get(l.productId);
        const have = Domain.available(state, l.productId, cart.value.whId);
        return { l, p, have, short: l.qty > have ? +(l.qty - have).toFixed(2) : 0 };
      }).filter((r) => r.p));
      const totalQty = computed(() => cart.value.lines.reduce((s, l) => s + (l.qty || 0), 0));
      const remove = (id) => { const i = cart.value.lines.findIndex((l) => l.productId === id); if (i >= 0) cart.value.lines.splice(i, 1); };
      const clearAll = () => services.confirm.require({
        header: 'ล้างรายการเบิก',
        message: `ลบของทั้ง ${cart.value.lines.length} รายการออกจากใบเบิกนี้หรือไม่?`,
        icon: 'pi pi-trash',
        rejectProps: { label: 'ยกเลิก', severity: 'secondary', outlined: true },
        acceptProps: { label: 'ล้างทั้งหมด', severity: 'danger' },
        accept: () => { cart.value.lines.splice(0); },
      });

      const whOpts = computed(() => Domain.warehouseOptions(state, cart.value.lines.filter((l) => l.qty > 0))
        .map((o) => ({ id: o.wh.id, name: o.wh.name, disabled: o.short === 'counting', badge: cart.value.lines.length || o.short === 'counting' ? WH_BADGE[o.short](o) : null })));
      const jobOpts = computed(() => state.jobs.filter((j) => j.open).map((j) => ({ id: j.id, label: `${j.id} – ${j.name}` })));
      const jobLabel = (id) => jobOpts.value.find((j) => j.id === id)?.label;

      const jobOpen = ref(false);
      const jobSelect = ref();
      const jobForm = reactive({ name: '', customer: '' });
      const similarJobs = computed(() => Domain.similarJobs(state, jobForm.name));
      const openJob = () => { jobSelect.value?.hide(); Object.assign(jobForm, { name: '', customer: '' }); jobOpen.value = true; };
      const useJob = (j) => { cart.value.jobId = j.id; jobOpen.value = false; };
      const saveJob = () => {
        const j = act((s, u) => Domain.addJob(s, { ...jobForm }, u), (x) => `สร้างงาน ${x.id} ${x.name} แล้ว`);
        if (j) useJob(j);
      };

      const needsApproval = computed(() => Domain.needsApproval(state, user.value));
      const blockers = computed(() => {
        const b = [];
        if (!cart.value.lines.length) b.push('เพิ่มของอย่างน้อย 1 รายการ');
        else if (cart.value.lines.some((l) => !(l.qty > 0))) b.push('ใส่จำนวนให้ครบทุกรายการ');
        for (const r of cartRows.value) if (r.p.active === false) b.push(r.p.name + ' เลิกใช้แล้ว เอาออกจากรายการก่อน');
        if (!cart.value.whId) b.push('เลือกคลังที่เบิกของ');
        else if (state.warehouses.find((w) => w.id === cart.value.whId)?.countId) b.push('คลังนี้กำลังตรวจนับ เลือกคลังอื่น');
        if (!jobLabel(cart.value.jobId)) b.push('เลือกงาน / โครงการ');
        return b;
      });

      const busy = ref(false);
      const result = ref(null);
      const submit = () => {
        if (busy.value || blockers.value.length) return;
        busy.value = true;
        setTimeout(() => { // กันกดซ้ำ + ให้เห็นว่ากำลังส่ง
          const input = { whId: cart.value.whId, jobId: cart.value.jobId, note: (cart.value.note || '').trim(), lines: cart.value.lines.map((l) => ({ productId: l.productId, qty: l.qty })) };
          let r;
          try { r = act((s, u) => Domain.issue(s, input, u)); } finally { busy.value = false; } // act() โยนต่อเมื่อ error ไม่ใช่ของ Domain
          if (r) { result.value = r; cart.value.lines.splice(0); cart.value.note = ''; } // "เบิกต่อ" = ล้างบรรทัด+หมายเหตุ เก็บคลังและงาน
        }, 600);
      };
      const resultView = computed(() => {
        const r = result.value;
        if (!r) return null;
        const job = state.jobs.find((j) => j.id === r.doc.jobId);
        return {
          ...OUTCOME[r.outcome], outcome: r.outcome, doc: r.doc, prs: r.prs, job: job ? `${job.id} ${job.name}` : r.doc.jobId,
          lines: r.doc.lines.map((l) => ({ l, p: byId.value.get(l.productId), pr: r.prs.find((x) => x.productId === l.productId) })),
        };
      });
      const viewHistory = () => { result.value = null; go('home'); };

      return {
        state, cart, Domain, fmt, whName, qInput, text, categoryId, tab, TABS, brands, hideAdded, first, perPage, pageRows, rows, counts,
        brandOptions, filterPop, filterCount, kpiTab, go, tops, selectedCat, stripActive, pickTop, catsOpen, catQuery,
        catCounts, catGroups, pickCat, manageCats, rowWh, whOf, rowQty, rowStatus, setRowWh, whOptions, cartStatus, inCart,
        flashId, add, showInCart, detail, detailWh, detailPRs, addFromDetail, createOpen, onCreated, cartRows, totalQty, remove,
        clearAll, whOpts, jobOpts, jobOpen, jobSelect, jobForm, similarJobs, openJob, useJob, saveJob, needsApproval,
        blockers, busy, submit, result, resultView, viewHistory,
      };
    },
    template: `<div class="issue-page">
      <page-header icon="pi-shopping-cart" title="เบิกของ" subtitle="เลือกวัสดุจากคลังเพื่อเบิกไปใช้ในหน้างาน พร้อมตรวจสอบจำนวนคงเหลือแบบเรียลไทม์" />

      <kpi-row :wh-id="cart.whId" @tab="kpiTab" />

      <div class="issue-layout">
        <div class="issue-main">
          <section class="card cat-card" aria-labelledby="cat-h">
            <div class="card-head">
              <h2 id="cat-h">เลือกตามหมวดหมู่</h2>
              <button type="button" class="link-btn" @click="catsOpen = true">ดูหมวดหมู่ทั้งหมด <i class="pi pi-chevron-right" aria-hidden="true"></i></button>
            </div>
            <div class="cat-strip">
              <button v-for="c in tops" :key="c.id" type="button" class="cat-item" :class="{ active: stripActive(c) }"
                :aria-pressed="stripActive(c)" @click="pickTop(c)">
                <cat-thumb :category-id="c.id" :size="60" round />
                <span>{{ c.name }}</span>
              </button>
            </div>
          </section>

          <section class="card table-card" aria-label="รายการสินค้า">
            <div class="table-toolbar">
              <div class="pills" role="group" aria-label="สถานะคลัง">
                <button v-for="t in TABS" :key="t[0]" type="button" class="pill" :class="{ active: tab === t[0] }"
                  :aria-pressed="tab === t[0]" @click="tab = t[0]">{{ t[1] }} <span class="pill-count num">{{ counts[t[0]].toLocaleString('en-US') }}</span></button>
              </div>
              <div class="toolbar-right">
                <p-iconfield class="table-search">
                  <p-inputicon class="pi pi-search" />
                  <p-inputtext v-model="qInput" type="search" placeholder="ค้นหาในรายการนี้..." aria-label="ค้นหาในรายการนี้" />
                </p-iconfield>
                <p-button :label="filterCount ? 'ตัวกรอง (' + filterCount + ')' : 'ตัวกรอง'" icon="pi pi-filter" severity="secondary" outlined class="btn-filter"
                  aria-haspopup="dialog" @click="filterPop.toggle($event)" />
              </div>
            </div>
            <div v-if="selectedCat && selectedCat.parentId" class="cat-chip-row">
              <span class="cat-chip">หมวด: {{ Domain.categoryPath(state, selectedCat.id) }}
                <button type="button" aria-label="ล้างหมวด" @click="categoryId = null"><i class="pi pi-times" aria-hidden="true"></i></button></span>
            </div>
            <p-popover ref="filterPop">
              <div class="filter-pop">
                <label class="menu-label" for="f-brand">ยี่ห้อ</label>
                <p-multiselect inputId="f-brand" v-model="brands" :options="brandOptions" filter placeholder="ทุกยี่ห้อ" display="chip" class="w-full" />
                <label class="switch-row"><span>ซ่อนสินค้าที่เพิ่มแล้ว</span><p-checkbox v-model="hideAdded" binary /></label>
                <p-button v-if="filterCount" label="ล้างตัวกรอง" severity="secondary" text @click="brands = []; hideAdded = false" />
              </div>
            </p-popover>

            <!-- ตารางธรรมดา + p-paginator: DataTable ช้าเกิน 500ms ต่อหน้าที่ 100 แถว -->
            <div class="issue-table">
              <div class="it-scroll">
                <table class="it">
                  <thead><tr>
                    <th>รายการสินค้า</th><th class="col-num">เบิกได้</th><th>สถานะคลัง</th><th><span class="sr-only">คลัง</span></th>
                    <th>หน่วย</th><th><span class="sr-only">เพิ่มเข้าใบเบิก</span></th>
                  </tr></thead>
                  <tbody>
                    <tr v-for="p in pageRows" :key="p.id">
                      <td class="col-prod">
                        <div class="prod-cell">
                          <product-thumb :product="p" :size="56" />
                          <div class="min-w-0">
                            <div class="prod-name">{{ p.name }}</div>
                            <div class="prod-sub">รหัส: {{ p.code }}</div>
                            <div class="prod-sub">{{ Domain.categoryPath(state, p.categoryId) }}</div>
                          </div>
                        </div>
                      </td>
                      <td class="col-qty"><span class="num">{{ fmt(rowQty(p), p.unit) }}</span></td>
                      <td class="col-status"><status-tag :status="rowStatus(p)" /></td>
                      <td class="col-wh">
                        <span v-if="rowStatus(p) === 'out' && !rowWh[p.id]" class="muted wh-none">-</span>
                        <span v-else class="row-wh">
                          <span class="row-wh-val">{{ whName(whOf(p)) }}</span><i class="pi pi-chevron-down" aria-hidden="true"></i>
                          <select :value="whOf(p)" @change="setRowWh(p, $event.target.value)" :aria-label="'ดูยอดคงเหลือของ ' + p.name + ' ในคลังอื่น'">
                            <option v-for="o in whOptions(p)" :key="o.id" :value="o.id">{{ o.label }}</option>
                          </select>
                        </span>
                      </td>
                      <td class="col-unit">{{ p.unit }}</td>
                      <td class="col-act">
                        <!-- ปุ่ม HTML + คลาส p-button: หน้าตาเดียวกับ p-button แต่ไม่ต้องสร้างคอมโพเนนต์ 100 ตัวต่อหน้า -->
                        <button v-if="inCart.has(p.id)" type="button" class="p-button p-component btn-added" @click="showInCart(p)"
                          :aria-label="'เพิ่มแล้ว: ' + p.name + ' (ไปที่รายการเบิก)'"><span class="p-button-icon pi pi-check" aria-hidden="true"></span><span class="p-button-label">เพิ่มแล้ว</span></button>
                        <button v-else-if="cartStatus(p) === 'out'" type="button" class="p-button p-component p-button-secondary p-button-outlined btn-detail"
                          @click="detail = p"><span class="p-button-label">ดูรายละเอียด</span></button>
                        <button v-else type="button" class="p-button p-component btn-add" @click="add(p)" :aria-label="'เพิ่ม ' + p.name"><span
                          class="p-button-icon pi pi-shopping-cart" aria-hidden="true"></span><span class="p-button-label">เพิ่ม</span></button>
                      </td>
                    </tr>
                    <tr v-if="!rows.length" class="it-empty"><td colspan="6">
                      <div class="table-empty">
                        <p>ไม่พบสินค้า{{ text ? ' "' + text + '"' : '' }}</p>
                        <button v-if="text" type="button" class="dashed-btn" @click="createOpen = true">
                          <i class="pi pi-plus" aria-hidden="true"></i> สร้างสินค้าใหม่ "{{ text }}"</button>
                      </div>
                    </td></tr>
                  </tbody>
                </table>
              </div>
              <p-paginator v-model:first="first" v-model:rows="perPage" :totalRecords="rows.length" :rowsPerPageOptions="[20, 50, 100]" />
            </div>
          </section>
        </div>

        <aside class="card cart" aria-labelledby="cart-h">
          <div class="cart-head">
            <h2 id="cart-h"><i class="pi pi-shopping-cart" aria-hidden="true"></i> รายการเบิก ({{ cart.lines.length }})</h2>
            <button v-if="cart.lines.length" type="button" class="link-btn danger" @click="clearAll"><i class="pi pi-trash" aria-hidden="true"></i> ล้างทั้งหมด</button>
          </div>
          <p v-if="!cart.lines.length" class="cart-empty muted">ยังไม่มีรายการ กด "เพิ่ม" จากตารางเพื่อเลือกของ</p>
          <div v-for="r in cartRows" :key="r.l.productId" class="cart-line" :class="{ flash: flashId === r.l.productId }" :data-cart-line="r.l.productId">
            <product-thumb :product="r.p" :size="48" />
            <div class="cart-line-body">
              <div class="cart-line-name">{{ r.p.name }}</div>
              <div v-if="r.p.active === false" class="cart-short"><i class="pi pi-ban" aria-hidden="true"></i> เลิกใช้แล้ว เบิกไม่ได้ เอาออกจากรายการ</div>
              <div v-else-if="r.short" class="cart-short"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
                มีในคลังนี้ {{ fmt(r.have, r.p.unit) }} · ขาด {{ fmt(r.short, r.p.unit) }}</div>
              <div class="cart-line-row">
                <span class="muted">{{ Domain.unitAbbr(r.p.unit) }}</span>
                <p-inputnumber v-model="r.l.qty" @input="r.l.qty = $event.value" showButtons buttonLayout="horizontal" :min="0" :minFractionDigits="0"
                  :maxFractionDigits="r.p.unit === 'เมตร' ? 2 : 0" incrementButtonIcon="pi pi-plus" decrementButtonIcon="pi pi-minus"
                  :ariaLabel="'จำนวน ' + r.p.name" class="qty-input" />
              </div>
            </div>
            <button type="button" class="line-remove" :aria-label="'ลบ ' + r.p.name" @click="remove(r.l.productId)"><i class="pi pi-times" aria-hidden="true"></i></button>
          </div>
          <div class="cart-sum">
            <span>รวม {{ cart.lines.length }} รายการ</span>
            <strong class="num">{{ fmt(totalQty) }} หน่วย</strong>
          </div>

          <div class="field">
            <label id="wh-l">คลังที่เบิกของ <span class="req">*</span></label>
            <p-select v-model="cart.whId" :options="whOpts" optionLabel="name" optionValue="id" optionDisabled="disabled"
              placeholder="เลือกคลัง" ariaLabelledby="wh-l" fluid>
              <template #value="{ value }">
                <span class="sel-value"><i class="pi pi-building" aria-hidden="true"></i>{{ value ? whName(value) : 'เลือกคลัง' }}</span>
              </template>
              <template #option="{ option }">
                <span class="opt-row"><span>{{ option.name }}</span>
                  <span v-if="option.badge" class="status-tag" :class="option.badge[1]">{{ option.badge[0] }}</span></span>
              </template>
            </p-select>
          </div>
          <div class="field">
            <label id="job-l">งาน / โครงการ <span class="req">*</span></label>
            <p-select ref="jobSelect" v-model="cart.jobId" :options="jobOpts" optionLabel="label" optionValue="id" filter
              placeholder="เลือกงาน" ariaLabelledby="job-l" fluid>
              <template #value="{ value, placeholder }">
                <span class="sel-value"><i class="pi pi-briefcase" aria-hidden="true"></i>{{ jobOpts.find((j) => j.id === value)?.label || placeholder }}</span>
              </template>
              <template #footer>
                <button type="button" class="select-footer-btn" @click="openJob"><i class="pi pi-plus" aria-hidden="true"></i> งานใหม่</button>
              </template>
            </p-select>
          </div>
          <div class="field">
            <label for="cart-note">หมายเหตุ (ถ้ามี)</label>
            <p-textarea id="cart-note" v-model="cart.note" rows="3" placeholder="เช่น เบิกใช้ติดตั้งระบบไฟฟ้าชั้น 3" fluid autoResize />
          </div>

          <div class="cart-submit">
            <p v-if="needsApproval" class="submit-note"><i class="pi pi-info-circle" aria-hidden="true"></i> ใบเบิกนี้ต้องให้หัวหน้าอนุมัติก่อนจ่ายของ</p>
            <p v-if="blockers.length" class="submit-block" id="submit-why"><i class="pi pi-lock" aria-hidden="true"></i> {{ blockers.join(' · ') }}</p>
            <p-button :label="needsApproval ? 'ส่งเบิก' : 'เบิกเลย'" icon="pi pi-send" class="btn-issue" :loading="busy"
              :disabled="!!blockers.length" :aria-describedby="blockers.length ? 'submit-why' : null" @click="submit" />
          </div>
        </aside>
      </div>

      <!-- ดูหมวดหมู่ทั้งหมด -->
      <p-dialog v-model:visible="catsOpen" header="หมวดหมู่ทั้งหมด" modal dismissableMask class="cats-dialog" :draggable="false">
        <p-iconfield class="mb-3">
          <p-inputicon class="pi pi-search" />
          <p-inputtext v-model="catQuery" type="search" placeholder="ค้นหาหมวด..." aria-label="ค้นหาหมวด" fluid />
        </p-iconfield>
        <div class="cats-list">
          <div v-for="g in catGroups" :key="g.p.id" class="cats-group">
            <button type="button" class="cats-parent" :class="{ active: categoryId === g.p.id }" @click="pickCat(g.p.id)">
              <cat-thumb :category-id="g.p.id" :size="40" round />
              <span class="cats-name">{{ g.p.name }}</span>
              <span class="muted num">{{ (catCounts.get(g.p.id) || 0).toLocaleString('en-US') }} รายการ</span>
            </button>
            <div class="cats-subs">
              <button v-for="s in g.subs" :key="s.id" type="button" class="cats-sub" :class="{ active: categoryId === s.id }" @click="pickCat(s.id)">
                {{ s.name }} <span class="num">{{ (catCounts.get(s.id) || 0).toLocaleString('en-US') }}</span>
              </button>
            </div>
          </div>
          <p v-if="!catGroups.length" class="muted">ไม่พบหมวด "{{ catQuery }}"</p>
        </div>
        <template #footer>
          <button type="button" class="link-btn" @click="manageCats"><i class="pi pi-cog" aria-hidden="true"></i> จัดการหมวดหมู่</button>
        </template>
      </p-dialog>

      <!-- รายละเอียดของที่ไม่มีในคลัง -->
      <p-dialog :visible="!!detail" @update:visible="detail = null" :header="detail ? detail.name : ''" modal dismissableMask class="detail-dialog" :draggable="false">
        <template v-if="detail">
          <p class="muted detail-code">รหัส: {{ detail.code }} · {{ Domain.categoryPath(state, detail.categoryId) }}</p>
          <h3 class="dlg-h">ยอดแต่ละคลัง</h3>
          <div v-for="r in detailWh" :key="r.w.id" class="detail-row">
            <span>{{ r.w.name }}</span><span class="detail-qty"><qty :n="r.qty" :unit="detail.unit" /> <status-tag :status="r.status" />
              <span v-if="r.pending > 0" class="status-tag tone-blue">รอยืนยัน {{ Domain.formatQty(r.pending) }} {{ detail.unit }}</span></span>
          </div>
          <h3 class="dlg-h">รายการต้องซื้อที่ค้างอยู่</h3>
          <p v-if="!detailPRs.length" class="muted">ยังไม่มี</p>
          <div v-for="r in detailPRs" :key="r.id" class="detail-row">
            <doc-id :id="r.id" /><span>{{ whName(r.whId) }} · <qty :n="r.qty - r.received" :unit="detail.unit" /></span>
          </div>
        </template>
        <template #footer>
          <p-button label="ปิด" severity="secondary" outlined @click="detail = null" />
          <p-button v-if="detail" :label="inCart.has(detail.id) ? 'อยู่ในใบเบิกแล้ว' : 'เพิ่มเข้าใบเบิก (รอของเข้า)'" icon="pi pi-shopping-cart"
            :disabled="inCart.has(detail.id)" @click="addFromDetail" />
        </template>
      </p-dialog>

      <!-- งานใหม่ -->
      <p-dialog v-model:visible="jobOpen" header="งานใหม่" modal dismissableMask class="job-dialog" :draggable="false">
        <form class="pd-form" @submit.prevent="jobForm.name.trim() && saveJob()">
          <div class="field">
            <label for="job-name">ชื่องาน <span class="req">*</span></label>
            <p-inputtext id="job-name" v-model="jobForm.name" placeholder="เช่น ติดตั้งระบบไฟฟ้า อาคาร B" autocomplete="off" fluid autofocus />
            <p-message v-for="x in similarJobs" :key="x.job.id" severity="warn" class="pd-msg">
              <span class="pd-msg-row"><span>มีงานชื่อคล้าย: {{ x.job.id }} {{ x.job.name }}{{ x.job.open ? '' : ' (ปิดแล้ว)' }}</span>
                <p-button v-if="x.job.open" label="ใช้งานนี้" severity="warn" outlined @click="useJob(x.job)" /></span>
            </p-message>
          </div>
          <div class="field">
            <label for="job-cust">ลูกค้าหรือสถานที่</label>
            <p-inputtext id="job-cust" v-model="jobForm.customer" placeholder="เช่น บจก. ตัวอย่าง จำกัด" fluid />
          </div>
        </form>
        <template #footer>
          <p-button label="ยกเลิก" severity="secondary" outlined @click="jobOpen = false" />
          <p-button label="สร้างงาน" icon="pi pi-check" :disabled="!jobForm.name.trim()" @click="saveJob" />
        </template>
      </p-dialog>

      <!-- ผลการเบิก -->
      <p-dialog :visible="!!result" @update:visible="result = null" modal class="result-dialog" :draggable="false" :showHeader="false">
        <div v-if="resultView" class="result">
          <span class="result-icon" :class="'tone-' + resultView.tone"><i :class="['pi', resultView.icon]" aria-hidden="true"></i></span>
          <h2>{{ resultView.title }}</h2>
          <p class="result-meta"><doc-id :id="resultView.doc.id" /> · งาน {{ resultView.job }} · {{ whName(resultView.doc.whId) }}</p>
          <ul class="result-lines">
            <li v-for="x in resultView.lines" :key="x.l.productId">
              <span class="result-name">{{ x.p ? x.p.name : x.l.productId }}</span>
              <span v-if="resultView.outcome === 'partial' || resultView.outcome === 'waiting'" class="result-qty">
                จ่ายแล้ว <span class="num">{{ fmt(x.l.issued) }}</span> จาก <qty :n="x.l.qty" :unit="x.p && x.p.unit" />
                <span v-if="x.pr" class="result-pr">รอของเข้า <doc-id :id="x.pr.id" /></span>
              </span>
              <span v-else class="result-qty"><qty :n="x.l.qty" :unit="x.p && x.p.unit" /></span>
            </li>
          </ul>
          <div class="result-actions">
            <p-button label="ดูประวัติ" severity="secondary" outlined @click="viewHistory" />
            <p-button label="เบิกต่อ" icon="pi pi-arrow-right" @click="result = null" autofocus />
          </div>
        </div>
      </p-dialog>

      <product-dialog v-model:visible="createOpen" :default-wh="cart.whId" :initial-name="text" from-search created-note=" เลือกให้แล้ว" @created="onCreated" />
    </div>`,
  };
})();
