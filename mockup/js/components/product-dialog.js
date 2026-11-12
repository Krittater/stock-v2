// กล่อง "สร้างสินค้าใหม่" ใช้ร่วมกันหน้าเบิก (Task 10) และหน้าคลังสินค้า (Task 11)
// <product-dialog v-model:visible="x" :initial-name="q" @created="(product, { receipt, existing }) => ..." />
//   existing = true เมื่อผู้ใช้กด "ใช้รายการนี้" (เลือกสินค้าที่มีอยู่แล้วแทนการสร้าง)
(function () {
  const { reactive, ref, computed, watch } = Vue;
  const { state, user, act } = AppState;
  const UNITS = ['เมตร', 'ตัว', 'ชิ้น', 'ใบ', 'ม้วน', 'ถุง', 'กล่อง'];
  const OTHER = 'อื่น ๆ';
  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

  const blank = (name) => ({
    name: name || '', brand: '', model: '', code: '', categoryId: null, unitPick: null, unitOther: '',
    reorderPoint: null, hasStock: false, whId: null, qty: null,
  });

  window.ProductDialog = {
    props: { visible: Boolean, initialName: String },
    emits: ['update:visible', 'created'],
    setup(props, { emit }) {
      const f = reactive(blank());
      const newCat = ref(null); // null = ปิด, string = กำลังพิมพ์ชื่อหมวดใหม่
      const catSelect = ref();
      watch(() => props.visible, (v) => { if (v) { Object.assign(f, blank(props.initialName)); newCat.value = null; } });

      const unit = computed(() => (f.unitPick === OTHER ? f.unitOther.trim() : f.unitPick) || '');
      // หมวดแม่เป็นกลุ่ม ตัวเลือกคือหมวดย่อย (หมวดแม่ที่ยังไม่มีหมวดย่อยเลือกตัวเองได้)
      const catGroups = computed(() => {
        const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
        return state.categories.filter((c) => !c.parentId).sort(byOrder).map((p) => {
          const subs = state.categories.filter((c) => c.parentId === p.id).sort(byOrder);
          return { label: p.name, items: subs.length ? subs : [p] };
        });
      });
      const openWarehouses = computed(() => state.warehouses.filter((w) => !w.countId));
      const dup = computed(() => norm(f.name) && state.products.find((p) => norm(p.name) === norm(f.name)));
      const similar = computed(() => (dup.value ? [] : Domain.findSimilar(state, f.name)));
      const missing = computed(() => {
        const m = [];
        if (!norm(f.name)) m.push('ชื่อสินค้า');
        if (!f.categoryId) m.push('หมวดหมู่');
        if (!unit.value) m.push('หน่วย');
        if (f.hasStock && !f.whId) m.push('คลังที่มีของ');
        if (f.hasStock && !(f.qty > 0)) m.push('จำนวนที่มีอยู่ (มากกว่า 0)');
        return m;
      });
      const stockNote = computed(() => (user.value.role === 'engineer'
        ? 'Store จะตรวจยืนยันยอดก่อนเข้าคลัง ระหว่างนี้เบิกได้ แต่ใบเบิกจะรอของจนกว่า Store ยืนยัน'
        : 'ยอดเข้าคลังทันที'));
      const nextId = computed(() => 'P-' + String(state.counters.P + 1).padStart(4, '0'));

      const close = () => emit('update:visible', false);
      const use = (p) => { emit('created', p, { existing: true, receipt: null }); close(); };
      const startNewCat = () => { catSelect.value?.hide(); newCat.value = ''; };
      const saveNewCat = () => {
        const cat = act((s) => Domain.addCategory(s, { name: newCat.value }), (c) => `สร้างหมวด "${c.name}" แล้ว`);
        if (cat) { f.categoryId = cat.id; newCat.value = null; }
      };
      const create = () => {
        const input = {
          name: f.name, brand: f.brand.trim(), model: f.model.trim(), code: f.code, categoryId: f.categoryId,
          unit: unit.value, reorderPoint: f.reorderPoint ?? 0,
          initial: f.hasStock ? { whId: f.whId, qty: f.qty } : null,
        };
        const r = act((s, u) => Domain.addProduct(s, input, u));
        if (r) { emit('created', r.product, { existing: false, receipt: r.receipt }); close(); }
      };
      return { f, UNITS, OTHER, unit, catGroups, catSelect, newCat, openWarehouses, dup, similar, missing, stockNote, nextId,
        close, use, startNewCat, saveNewCat, create };
    },
    template: `<p-dialog :visible="visible" @update:visible="$emit('update:visible', $event)" header="สร้างสินค้าใหม่" modal
      dismissableMask class="product-dialog" :draggable="false">
      <form class="pd-form" @submit.prevent="missing.length || dup || create()">
        <div class="field">
          <label for="pd-name">ชื่อสินค้า <span class="req">*</span></label>
          <p-inputtext id="pd-name" v-model="f.name" placeholder="เช่น น็อตสแตนเลส M8" autocomplete="off" :invalid="!!dup" fluid autofocus />
          <p-message v-if="dup" severity="error" class="pd-msg">
            <span class="pd-msg-row"><span>มีสินค้านี้แล้ว: <doc-id :id="dup.id" /> {{ dup.name }}</span>
              <p-button label="ใช้รายการนี้" severity="danger" outlined @click="use(dup)" /></span>
          </p-message>
          <p-message v-for="p in similar" :key="p.id" severity="warn" class="pd-msg">
            <span class="pd-msg-row"><span>มีสินค้าชื่อคล้ายกันอยู่แล้ว ดูก่อนสร้าง · <doc-id :id="p.id" /> {{ p.name }}</span>
              <p-button label="ใช้รายการนี้" severity="warn" outlined @click="use(p)" /></span>
          </p-message>
        </div>
        <div class="pd-grid">
          <div class="field">
            <label for="pd-brand">ยี่ห้อ</label>
            <p-inputtext id="pd-brand" v-model="f.brand" placeholder="เช่น Yazaki, 3M" fluid />
          </div>
          <div class="field">
            <label for="pd-model">รุ่น / ขนาด</label>
            <p-inputtext id="pd-model" v-model="f.model" placeholder="เช่น THW 1x2.5 sq.mm" fluid />
          </div>
        </div>
        <div class="field">
          <label for="pd-code">รหัสสินค้า</label>
          <p-inputtext id="pd-code" v-model="f.code" :placeholder="'ว่างไว้ = ใช้ ' + nextId" fluid />
        </div>
        <div class="field">
          <label id="pd-cat-l">หมวดหมู่ <span class="req">*</span></label>
          <p-select ref="catSelect" v-model="f.categoryId" :options="catGroups" optionGroupLabel="label" optionGroupChildren="items"
            optionLabel="name" optionValue="id" filter placeholder="เลือกหมวดหมู่" ariaLabelledby="pd-cat-l" fluid>
            <template #footer>
              <button type="button" class="select-footer-btn" @click="startNewCat"><i class="pi pi-plus" aria-hidden="true"></i> สร้างหมวดใหม่</button>
            </template>
          </p-select>
          <div v-if="newCat !== null" class="pd-newcat">
            <p-inputtext v-model="newCat" placeholder="ชื่อหมวดใหม่" aria-label="ชื่อหมวดใหม่" autofocus @keydown.enter.prevent="saveNewCat" />
            <p-button label="เพิ่มหมวด" :disabled="!newCat.trim()" @click="saveNewCat" />
            <p-button label="ยกเลิก" severity="secondary" text @click="newCat = null" />
          </div>
        </div>
        <div class="field">
          <span class="field-label" id="pd-unit">หน่วย <span class="req">*</span></span>
          <div class="unit-opts" role="radiogroup" aria-labelledby="pd-unit">
            <button v-for="u in [...UNITS, OTHER]" :key="u" type="button" role="radio" class="unit-opt"
              :class="{ checked: f.unitPick === u }" :aria-checked="f.unitPick === u" @click="f.unitPick = u">{{ u }}</button>
          </div>
          <p-inputtext v-if="f.unitPick === OTHER" v-model="f.unitOther" placeholder="พิมพ์หน่วย เช่น เส้น, ชุด, คู่" aria-label="หน่วยอื่น" fluid />
        </div>
        <div class="field">
          <label for="pd-rp">จุดสั่งซื้อ</label>
          <p-inputnumber inputId="pd-rp" v-model="f.reorderPoint" :min="0" :maxFractionDigits="unit === 'เมตร' ? 2 : 0" placeholder="0" fluid />
          <small class="muted">เตือนเมื่อเหลือน้อยกว่า</small>
        </div>
        <label class="switch-row pd-switch">
          <span>มีของนี้อยู่ในคลังแล้ว</span>
          <p-toggleswitch v-model="f.hasStock" />
        </label>
        <div v-if="f.hasStock" class="pd-stock">
          <div class="pd-grid">
            <div class="field">
              <label id="pd-wh-l">คลัง <span class="req">*</span></label>
              <p-select v-model="f.whId" :options="openWarehouses" optionLabel="name" optionValue="id" placeholder="เลือกคลัง" ariaLabelledby="pd-wh-l" fluid />
            </div>
            <div class="field">
              <label for="pd-qty">จำนวน <span class="req">*</span></label>
              <p-inputnumber inputId="pd-qty" v-model="f.qty" :min="0" :maxFractionDigits="unit === 'เมตร' ? 2 : 0" :suffix="unit ? ' ' + unit : ''" fluid />
            </div>
          </div>
          <p class="pd-note"><i class="pi pi-info-circle" aria-hidden="true"></i> {{ stockNote }}</p>
        </div>
      </form>
      <template #footer>
        <div class="pd-footer">
          <p v-if="missing.length" class="pd-missing">ยังขาด: {{ missing.join(' · ') }}</p>
          <div class="pd-actions">
            <p-button label="ยกเลิก" severity="secondary" outlined @click="close" />
            <p-button label="สร้าง" icon="pi pi-check" :disabled="!!missing.length || !!dup" @click="create" />
          </div>
        </div>
      </template>
    </p-dialog>`,
  };
})();
