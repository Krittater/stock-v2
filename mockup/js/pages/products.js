// ข้อมูลวัสดุ: แท็บรายการวัสดุ (?tab=items) + แท็บหมวดหมู่กำหนดเอง (?tab=categories)
(function () {
  const { ref, reactive, computed, watch, onBeforeUnmount } = Vue;
  const { state, user, act, route, go, services } = AppState;

  const ICONS = ['pi-bolt', 'pi-cog', 'pi-wrench', 'pi-box', 'pi-tag', 'pi-home', 'pi-lightbulb', 'pi-shield', 'pi-wifi', 'pi-server', 'pi-key', 'pi-link',
    'pi-filter', 'pi-th-large', 'pi-sun', 'pi-moon', 'pi-tablet', 'pi-mobile', 'pi-print', 'pi-truck', 'pi-briefcase', 'pi-flag', 'pi-cloud', 'pi-sliders-h'];
  // พื้นอ่อน — ไอคอนบน thumb ใช้สีเข้ม (.thumb-icon) อ่านได้ทุกสี
  const COLORS = [['#82d2b3', 'เขียวมิ้นต์'], ['#7dd3fc', 'ฟ้า'], ['#fcd34d', 'เหลือง'], ['#fda4af', 'ชมพู'],
    ['#c4b5fd', 'ม่วง'], ['#fdba74', 'ส้ม'], ['#bef264', 'เขียวอ่อน'], ['#f0abfc', 'ม่วงชมพู']];
  const IMAGES = Object.entries(window.ImageCredits || {}).map(([path, c]) => ({ path, title: c.title }));
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
  const fmt = (n, unit) => Domain.formatQty(n ?? 0, unit);

  window.Pages.products = {
    components: { ProductDialog: window.ProductDialog },
    setup() {
      const tab = computed(() => (route.query.tab === 'categories' ? 'categories' : 'items'));
      const setTab = (t) => go('products', t === 'categories' ? { tab: 'categories' } : {});

      // ---------- รายการวัสดุ ----------
      const qInput = ref('');
      const text = ref('');
      let timer;
      watch(qInput, (v) => { clearTimeout(timer); timer = setTimeout(() => { text.value = v.trim(); }, 150); });
      onBeforeUnmount(() => clearTimeout(timer));
      const catFilter = ref(null);
      const chip = ref(null); // null | 'nophoto' | 'approval' | 'inactive'
      const first = ref(0);
      const isHead = computed(() => user.value.role === 'head');
      const isEng = computed(() => user.value.role === 'engineer');
      const canEdit = computed(() => !isEng.value);
      watch([text, catFilter, chip], () => { first.value = 0; });
      watch(isHead, (h) => { if (!h && chip.value === 'inactive') chip.value = null; });
      const noPhoto = (p) => !(p.photos && p.photos.length);
      const noPhotoCount = computed(() => state.products.filter((p) => p.active !== false && noPhoto(p)).length);
      const toggleChip = (c) => { chip.value = chip.value === c ? null : c; };
      const CHIPS = computed(() => [
        { v: 'nophoto', label: `ยังไม่มีรูป (${noPhotoCount.value})` }, { v: 'approval', label: 'ต้องอนุมัติ' },
        ...(isHead.value ? [{ v: 'inactive', label: 'เลิกใช้แล้ว' }] : []),
      ]);

      const tops = computed(() => state.categories.filter((c) => !c.parentId).sort(byOrder));
      const subsOf = (id) => state.categories.filter((c) => c.parentId === id).sort(byOrder);
      const catGroups = computed(() => tops.value.map((p) => ({ label: p.name, items: [p, ...subsOf(p.id)] })));
      const rows = computed(() => Domain.searchProducts(state, { text: text.value, categoryId: catFilter.value, includeInactive: chip.value === 'inactive' && isHead.value })
        .filter((p) => (chip.value === 'nophoto' ? noPhoto(p) : chip.value === 'approval' ? p.needsApproval : chip.value === 'inactive' ? p.active === false : true))
        .map((p) => ({
        p, id: p.id, name: p.name, code: p.code, total: Domain.totalQty(state, p.id),
        wh: state.warehouses.map((w) => Domain.qtyOf(state, p.id, w.id)),
      })));
      const perPage = ref(20);
      // เรียงแบบ DataTable เดิม: กดหัวคอลัมน์ = น้อยไปมาก กดซ้ำ = สลับ
      const sort = reactive({ field: null, order: 1 });
      const collator = new Intl.Collator('th', { numeric: true });
      const sorted = computed(() => {
        const { field, order } = sort;
        if (!field) return rows.value;
        return rows.value.slice().sort((a, b) => order * (field === 'total' ? a.total - b.total : collator.compare(a[field], b[field])));
      });
      const pageRows = computed(() => sorted.value.slice(first.value, first.value + perPage.value));
      const sortBy = (f) => { sort.order = sort.field === f ? -sort.order : 1; sort.field = f; first.value = 0; };
      const ariaSort = (f) => (sort.field !== f ? 'none' : sort.order > 0 ? 'ascending' : 'descending');
      const sortIcon = (f) => (sort.field !== f ? 'pi-sort-alt' : sort.order > 0 ? 'pi-sort-amount-up-alt' : 'pi-sort-amount-down');

      const dlg = ref(false);
      const editing = ref(null);
      const vendor = ref('');
      const openCreate = (v = '') => { editing.value = null; vendor.value = typeof v === 'string' ? v : ''; dlg.value = true; };
      const onMiss = (code) => services.confirm.require({
        header: 'ไม่พบบาร์โค้ด', icon: 'pi pi-question-circle', message: `ไม่พบบาร์โค้ด ${code} สร้างสินค้าใหม่ไหม`,
        rejectProps: { label: 'ไม่สร้าง', severity: 'secondary', outlined: true }, acceptProps: { label: 'สร้างสินค้าใหม่' },
        accept: () => openCreate(code),
      });
      const reopen = (p) => act((s, u) => Domain.setProductActive(s, p.id, true, u), `เปิดใช้ ${p.name} อีกครั้งแล้ว`);
      const setApproval = (c, v) => act((s, u) => Domain.updateCategory(s, c.id, { needsApproval: v }, u), (x) => `${x.needsApproval ? 'ตั้ง' : 'เอาออก'} "ต้องอนุมัติ" ที่หมวด "${x.name}" แล้ว`);
      const openEdit = (p) => { editing.value = p; dlg.value = true; };
      // ทางลัด "เพิ่มวัสดุ" (?new=1) — watch เพราะมาจากแท็บหมวดหมู่หน้าไม่เมานต์ใหม่; เปิดแล้วล้าง query กันเปิดซ้ำตอน reload
      watch(() => route.query.new, (v) => { if (v) { openCreate(); go('products', tab.value === 'categories' ? { tab: 'categories' } : {}); } }, { immediate: true });

      // ---------- หมวดหมู่ ----------
      const counts = computed(() => Domain.productCounts(state));
      const open = reactive({}); // id หมวดแม่ที่กางอยู่
      const tree = computed(() => {
        const out = [];
        tops.value.forEach((c, i) => {
          const subs = subsOf(c.id);
          out.push({ c, depth: 0, first: i === 0, last: i === tops.value.length - 1, subCount: subs.length });
          if (open[c.id]) subs.forEach((s, j) => out.push({ c: s, depth: 1, first: j === 0, last: j === subs.length - 1, subCount: 0 }));
        });
        return out;
      });
      const n = (id) => counts.value.get(id) || 0;

      const move = (cat, dir) => act((s) => {
        const sibs = s.categories.filter((c) => (c.parentId || null) === (cat.parentId || null)).sort(byOrder);
        sibs.forEach((c, i) => Domain.updateCategory(s, c.id, { order: i + 1 })); // ทำให้ลำดับไม่ซ้ำก่อนสลับ
        const i = sibs.indexOf(cat), o = sibs[i + dir];
        if (!o) return;
        const [x, y] = [cat.order, o.order];
        Domain.updateCategory(s, cat.id, { order: y });
        Domain.updateCategory(s, o.id, { order: x });
      });

      // dialog สร้าง/แก้หมวด
      const cd = reactive({ open: false, id: null, parentId: null, name: '', image: null, icon: 'pi-tag', color: '#82d2b3' });
      const openCat = (cat, parentId = null) => {
        const par = state.categories.find((c) => c.id === parentId);
        Object.assign(cd, cat
          ? { open: true, id: cat.id, parentId: cat.parentId, name: cat.name, image: cat.image, icon: cat.icon, color: cat.color }
          : { open: true, id: null, parentId, name: '', image: null, icon: par?.icon || 'pi-tag', color: par?.color || '#82d2b3' });
      };
      const saveCat = () => {
        const patch = { name: cd.name, image: cd.image, icon: cd.icon, color: cd.color };
        const c = cd.id
          ? act((s, u) => Domain.updateCategory(s, cd.id, patch, u), (x) => `บันทึกหมวด "${x.name}" แล้ว`)
          : act((s, u) => Domain.addCategory(s, { ...patch, parentId: cd.parentId }, u), (x) => `สร้างหมวด "${x.name}" แล้ว`);
        if (c) { cd.open = false; if (c.parentId) open[c.parentId] = true; }
      };

      // ลบ
      const del = reactive({ open: false, cat: null, to: null });
      const moveTargets = computed(() => {
        if (!del.cat) return [];
        const bad = Domain.descendantIds(state, del.cat.id);
        return state.categories.filter((c) => !bad.has(c.id))
          .map((c) => ({ id: c.id, label: Domain.categoryPath(state, c.id) }))
          .sort((a, b) => a.label.localeCompare(b.label, 'th'));
      });
      const delSubs = computed(() => (del.cat ? subsOf(del.cat.id).length : 0));
      const askDelete = (cat) => {
        if (!n(cat.id) && !subsOf(cat.id).length) {
          services.confirm.require({
            header: 'ลบหมวดหมู่', message: `ลบหมวด "${cat.name}" หรือไม่?`, icon: 'pi pi-trash',
            rejectProps: { label: 'ยกเลิก', severity: 'secondary', outlined: true }, acceptProps: { label: 'ลบ', severity: 'danger' },
            accept: () => act((s, u) => Domain.deleteCategory(s, cat.id, {}, u), `ลบหมวด "${cat.name}" แล้ว`),
          });
          return;
        }
        Object.assign(del, { open: true, cat, to: null });
      };
      const moveDelete = () => {
        const name = del.cat.name;
        const r = act((s, u) => Domain.deleteCategory(s, del.cat.id, { moveTo: del.to }, u), (x) => `ย้ายสินค้า ${x.movedProducts} รายการ แล้วลบหมวด "${name}"`);
        if (r) del.open = false;
      };

      return {
        state, Domain, fmt, tab, setTab, qInput, text, catFilter, first, perPage, pageRows, sortBy, ariaSort, sortIcon, catGroups, rows, dlg, editing, openCreate, openEdit,
        tree, n, open, move, cd, openCat, saveCat, del, moveTargets, delSubs, askDelete, moveDelete,
        tops, ICONS, COLORS, IMAGES, chip, CHIPS, toggleChip, isHead, isEng, canEdit, vendor, onMiss, reopen, setApproval,
      };
    },
    template: `<div class="products-page">
      <page-header icon="pi-database" title="ข้อมูลวัสดุ" subtitle="จัดการรายการวัสดุและหมวดหมู่ของบริษัท" />
      <p-tabs :value="tab" @update:value="setTab">
        <p-tablist>
          <p-tab value="items"><i class="pi pi-list" aria-hidden="true"></i> รายการวัสดุ</p-tab>
          <p-tab value="categories"><i class="pi pi-sitemap" aria-hidden="true"></i> หมวดหมู่</p-tab>
        </p-tablist>
        <p-tabpanels>
          <p-tabpanel value="items">
            <section class="card pp-card" aria-label="รายการวัสดุ">
              <div class="pp-toolbar">
                <p-iconfield class="pp-search">
                  <p-inputicon class="pi pi-search" />
                  <p-inputtext v-model="qInput" type="search" placeholder="ค้นหาชื่อ รหัส ยี่ห้อ..." aria-label="ค้นหาวัสดุ" fluid />
                </p-iconfield>
                <p-select v-model="catFilter" :options="catGroups" optionGroupLabel="label" optionGroupChildren="items" optionLabel="name" optionValue="id"
                  showClear filter placeholder="ทุกหมวดหมู่" aria-label="กรองตามหมวด" class="pp-cat" />
                <scan-button :kinds="['product']" close-on-miss @found="({ id }) => { qInput = text = state.products.find((p) => p.id === id).code; }" @notfound="onMiss" />
                <p-button label="เพิ่มวัสดุ" icon="pi pi-plus" @click="openCreate()" />
              </div>
              <div class="pp-chips" role="group" aria-label="ตัวกรอง">
                <button v-for="c in CHIPS" :key="c.v" type="button" class="pp-chip" :aria-pressed="chip === c.v" @click="toggleChip(c.v)">{{ c.label }}</button>
              </div>
              <!-- ตารางธรรมดา + p-paginator: DataTable ช้าเกิน 500ms ต่อหน้าที่ 100 แถว -->
              <div class="pp-table">
                <div class="pp-scroll">
                  <table class="pp">
                    <thead><tr>
                      <th :aria-sort="ariaSort('name')">
                        <button type="button" class="pp-sort" @click="sortBy('name')">วัสดุ <i :class="['pi', sortIcon('name')]" aria-hidden="true"></i></button></th>
                      <th :aria-sort="ariaSort('code')">
                        <button type="button" class="pp-sort" @click="sortBy('code')">รหัส <i :class="['pi', sortIcon('code')]" aria-hidden="true"></i></button></th>
                      <th>สถานะ</th><th>หมวด</th><th>หน่วย</th><th class="pp-r">จุดสั่งซื้อ</th>
                      <th class="pp-r" :aria-sort="ariaSort('total')">
                        <button type="button" class="pp-sort" @click="sortBy('total')">ยอดรวมทุกคลัง <i :class="['pi', sortIcon('total')]" aria-hidden="true"></i></button></th>
                      <th v-for="w in state.warehouses" :key="w.id" class="pp-r pp-wh">{{ w.name }}</th>
                      <th><span class="sr-only">แก้ไข</span></th>
                    </tr></thead>
                    <tbody>
                      <tr v-for="r in pageRows" :key="r.id" :class="{ 'row-inactive': r.p.active === false }">
                        <td class="pp-c-name">
                          <div class="prod-cell">
                            <product-thumb :product="r.p" :size="48" />
                            <div class="min-w-0">
                              <div class="prod-name">{{ r.p.name }}</div>
                              <div class="prod-sub">{{ [r.p.brand !== '-' && r.p.brand, r.p.model].filter(Boolean).join(' · ') || '-' }}</div>
                            </div>
                          </div>
                        </td>
                        <td><span class="doc-id">{{ r.p.code }}</span></td>
                        <td><span class="pp-tags">
                          <span v-if="r.p.needsApproval" class="status-tag tone-yellow"><span class="dot" aria-hidden="true"></span>ต้องอนุมัติ</span>
                          <span v-if="r.p.active === false" class="status-tag tone-gray"><span class="dot" aria-hidden="true"></span>เลิกใช้</span>
                        </span></td>
                        <td>{{ Domain.categoryPath(state, r.p.categoryId) }}</td>
                        <td>{{ r.p.unit }}</td>
                        <td class="pp-r"><span class="num">{{ fmt(r.p.reorderPoint, r.p.unit) }}</span></td>
                        <td class="pp-r"><b class="num">{{ fmt(r.total, r.p.unit) }}</b></td>
                        <td v-for="(w, i) in state.warehouses" :key="w.id" class="pp-r pp-wh"><span class="num">{{ fmt(r.wh[i], r.p.unit) }}</span></td>
                        <td class="pp-act">
                          <p-button v-if="isHead && r.p.active === false" label="เปิดใช้อีกครั้ง" severity="secondary" outlined @click="reopen(r.p)" />
                          <button v-if="canEdit" type="button" class="icon-btn" :aria-label="'แก้ไข ' + r.p.name" @click="openEdit(r.p)"><i class="pi pi-pencil" aria-hidden="true"></i></button>
                          <button v-else type="button" class="icon-btn" :aria-label="'ดู ' + r.p.name" @click="openEdit(r.p)"><i class="pi pi-eye" aria-hidden="true"></i></button>
                        </td>
                      </tr>
                      <tr v-if="!rows.length"><td :colspan="8 + state.warehouses.length"><div class="table-empty"><p>ไม่พบวัสดุ{{ text ? ' "' + text + '"' : '' }}</p></div></td></tr>
                    </tbody>
                  </table>
                </div>
                <p-paginator v-model:first="first" v-model:rows="perPage" :totalRecords="rows.length" :rowsPerPageOptions="[20, 50, 100]" />
              </div>
            </section>
          </p-tabpanel>

          <p-tabpanel value="categories">
            <section class="card pp-card" aria-label="หมวดหมู่">
              <div class="pp-toolbar">
                <p class="muted pp-hint">ลำดับหมวดแม่ที่นี่คือลำดับในแถบหมวดหน้าเบิกของ</p>
                <p-button label="เพิ่มหมวด" icon="pi pi-plus" @click="openCat(null)" />
              </div>
              <ul class="cat-list">
                <li v-for="r in tree" :key="r.c.id" class="cat-row" :class="{ sub: r.depth }">
                  <button v-if="r.subCount" type="button" class="icon-btn" :aria-expanded="!!open[r.c.id]" :aria-label="(open[r.c.id] ? 'ซ่อน' : 'ดู') + 'หมวดย่อยของ ' + r.c.name"
                    @click="open[r.c.id] = !open[r.c.id]"><i :class="['pi', open[r.c.id] ? 'pi-chevron-down' : 'pi-chevron-right']" aria-hidden="true"></i></button>
                  <span v-else class="icon-spacer" aria-hidden="true"></span>
                  <cat-thumb :category-id="r.c.id" :size="r.depth ? 40 : 48" :round="!r.depth" />
                  <div class="cat-name"><b>{{ r.c.name }}</b><span class="muted">{{ n(r.c.id).toLocaleString('en-US') }} รายการ<template v-if="r.subCount"> · {{ r.subCount }} หมวดย่อย</template></span></div>
                  <button v-if="!r.depth" type="button" class="add-sub" @click="openCat(null, r.c.id)"><i class="pi pi-plus" aria-hidden="true"></i> <span>หมวดย่อย</span></button>
                  <label v-if="isHead" class="cat-appr"><p-toggleswitch :modelValue="!!r.c.needsApproval" :aria-label="'ต้องอนุมัติ ' + r.c.name" @update:modelValue="setApproval(r.c, $event)" /><span>ต้องอนุมัติ</span></label>
                  <span v-else-if="r.c.needsApproval" class="status-tag tone-yellow"><span class="dot" aria-hidden="true"></span>ต้องอนุมัติ</span>
                  <div class="cat-acts">
                    <button type="button" class="icon-btn" :disabled="r.first" :aria-label="'เลื่อน ' + r.c.name + ' ขึ้น'" @click="move(r.c, -1)"><i class="pi pi-arrow-up" aria-hidden="true"></i></button>
                    <button type="button" class="icon-btn" :disabled="r.last" :aria-label="'เลื่อน ' + r.c.name + ' ลง'" @click="move(r.c, 1)"><i class="pi pi-arrow-down" aria-hidden="true"></i></button>
                    <button type="button" class="icon-btn" :aria-label="'แก้ไข ' + r.c.name" @click="openCat(r.c)"><i class="pi pi-pencil" aria-hidden="true"></i></button>
                    <button type="button" class="icon-btn danger" :aria-label="'ลบ ' + r.c.name" @click="askDelete(r.c)"><i class="pi pi-trash" aria-hidden="true"></i></button>
                  </div>
                </li>
              </ul>
            </section>
          </p-tabpanel>
        </p-tabpanels>
      </p-tabs>

      <product-dialog v-model:visible="dlg" :product="editing" :initial-vendor="vendor" />

      <p-dialog v-model:visible="cd.open" :header="cd.id ? 'แก้ไขหมวดหมู่' : (cd.parentId ? 'เพิ่มหมวดย่อย' : 'เพิ่มหมวดหมู่')" modal dismissableMask :draggable="false" class="cat-dialog">
        <form @submit.prevent="cd.name.trim() && saveCat()">
          <div class="field">
            <label for="cd-name">ชื่อหมวด <span class="req">*</span></label>
            <p-inputtext id="cd-name" v-model="cd.name" placeholder="เช่น งานประปา" autocomplete="off" fluid autofocus />
          </div>
          <div v-if="!cd.id" class="field">
            <label id="cd-par-l">หมวดแม่</label>
            <p-select v-model="cd.parentId" :options="tops" optionLabel="name" optionValue="id" showClear placeholder="ไม่มี (เป็นหมวดหลัก)" ariaLabelledby="cd-par-l" fluid />
          </div>
          <div class="field">
            <span class="field-label" id="cd-img-l">รูปหมวด</span>
            <div class="img-grid" role="radiogroup" aria-labelledby="cd-img-l">
              <button type="button" role="radio" class="img-opt use-icon" :class="{ checked: !cd.image }" :aria-checked="!cd.image" @click="cd.image = null">
                <i class="pi pi-objects-column" aria-hidden="true"></i><span>ใช้ไอคอน</span></button>
              <button v-for="im in IMAGES" :key="im.path" type="button" role="radio" class="img-opt" :class="{ checked: cd.image === im.path }"
                :aria-checked="cd.image === im.path" :aria-label="im.title" :title="im.title" @click="cd.image = im.path">
                <img :src="im.path" alt="" loading="lazy"></button>
            </div>
          </div>
          <template v-if="!cd.image">
            <div class="field">
              <span class="field-label" id="cd-ic-l">ไอคอน</span>
              <div class="opt-grid" role="radiogroup" aria-labelledby="cd-ic-l">
                <button v-for="ic in ICONS" :key="ic" type="button" role="radio" class="opt" :class="{ checked: cd.icon === ic }" :aria-checked="cd.icon === ic"
                  :aria-label="ic.slice(3)" @click="cd.icon = ic"><i :class="['pi', ic]" aria-hidden="true"></i></button>
              </div>
            </div>
            <div class="field">
              <span class="field-label" id="cd-co-l">สี</span>
              <div class="opt-grid" role="radiogroup" aria-labelledby="cd-co-l">
                <button v-for="c in COLORS" :key="c[0]" type="button" role="radio" class="opt swatch" :class="{ checked: cd.color === c[0] }" :aria-checked="cd.color === c[0]"
                  :aria-label="c[1]" :title="c[1]" :style="{ background: c[0] }" @click="cd.color = c[0]"><i v-if="cd.color === c[0]" class="pi pi-check" aria-hidden="true"></i></button>
              </div>
            </div>
          </template>
        </form>
        <template #footer>
          <p-button label="ยกเลิก" severity="secondary" outlined @click="cd.open = false" />
          <p-button label="บันทึก" icon="pi pi-check" :disabled="!cd.name.trim()" @click="saveCat" />
        </template>
      </p-dialog>

      <p-dialog v-model:visible="del.open" header="ลบหมวดหมู่" modal dismissableMask :draggable="false" class="cat-dialog">
        <template v-if="del.cat">
          <p class="del-msg"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
            <span>หมวดนี้มีสินค้า {{ n(del.cat.id) }} รายการ<template v-if="delSubs"> และหมวดย่อย {{ delSubs }} หมวด</template> เลือกหมวดที่จะย้ายไปก่อนจึงลบได้</span></p>
          <div class="field">
            <label id="del-to-l">ย้ายไปหมวด</label>
            <p-select v-model="del.to" :options="moveTargets" optionLabel="label" optionValue="id" filter placeholder="เลือกหมวดปลายทาง" ariaLabelledby="del-to-l" fluid />
          </div>
        </template>
        <template #footer>
          <p-button label="ยกเลิก" severity="secondary" outlined @click="del.open = false" />
          <p-button label="ย้ายแล้วลบ" icon="pi pi-trash" severity="danger" :disabled="!del.to" @click="moveDelete" />
        </template>
      </p-dialog>
    </div>`,
  };
})();
