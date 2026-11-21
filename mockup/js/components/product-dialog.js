// กล่อง "สร้าง/แก้สินค้า" ใช้ร่วมกันหน้าเบิกและหน้าคลังสินค้า
// <product-dialog v-model:visible="x" :initial-name="q" from-search @created="(product, { opening, existing }) => ..." />
//   existing = true เมื่อผู้ใช้กด "ใช้รายการนี้" (เฉพาะเมื่อเปิดจากช่องค้นหา = from-search)
//   :product = โหมดแก้ไข/ดู (emit 'saved') · สิทธิ์ตาม Q7: วิศวกรดูอย่างเดียว (เพิ่มรูปแรกได้) · Store แก้ ชื่อ ยี่ห้อ รุ่น บาร์โค้ด หมายเหตุ · หัวหน้าแก้ได้หมด
(function () {
  const { reactive, ref, computed, watch } = Vue;
  const { state, user, act, services } = AppState;
  const UNITS = ['เมตร', 'ตัว', 'ชิ้น', 'ใบ', 'ม้วน', 'ถุง', 'กล่อง'];
  const OTHER = 'อื่น ๆ';
  const STORE_FIELDS = ['name', 'brand', 'model', 'vendorCode', 'note'];
  const MSG_HEAD = 'แก้ได้เฉพาะหัวหน้า';
  const MSG_UNIT = 'เปลี่ยนหน่วยไม่ได้ เพราะมีของหรือมีประวัติแล้ว';
  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

  const blank = (name, vendor) => ({
    name: name || '', brand: '', model: '', code: '', categoryId: null, unitPick: null, unitOther: '', isRoll: false,
    reorderPoint: null, hasStock: false,
    vendorCode: vendor || '', note: '', buyUnit: '', buyFactor: null, rollSize: null, scrapMin: null, needsApproval: false,
  });

  window.ProductDialog = {
    components: { OpeningFields: window.OpeningFields },
    props: { defaultWh: String, visible: Boolean, initialName: String, initialVendor: String, product: Object, createdNote: String, fromSearch: Boolean },
    emits: ['update:visible', 'created', 'saved'],
    setup(props, { emit }) {
      const f = reactive(blank());
      const op = reactive(window.openingBlank()); // ยอดที่มีอยู่ตอนสร้าง
      const found = reactive(window.openingBlank());
      const foundOpen = ref(false);
      const photos = ref([]); // โหมดสร้าง: เก็บในกล่องจนกดสร้าง ปิดกล่อง = ทิ้ง (PD-AC7)
      const photoBusy = ref(0);
      const more = ref(false);
      const dtab = ref('info');
      const newCat = ref(null); // null = ปิด, string = กำลังพิมพ์ชื่อหมวดใหม่
      const catSelect = ref();
      const edit = computed(() => !!props.product);
      const role = computed(() => user.value.role);
      const isHead = computed(() => role.value === 'head');
      const isEng = computed(() => role.value === 'engineer');
      const isStaff = computed(() => !isEng.value);
      const viewOnly = computed(() => edit.value && isEng.value);
      const active = computed(() => props.product?.active !== false);

      const fromProduct = (p) => {
        const known = UNITS.includes(p.unit);
        return { ...blank(p.name), brand: p.brand === '-' ? '' : (p.brand || ''), model: p.model || '', code: p.code, categoryId: p.categoryId,
          unitPick: known ? p.unit : OTHER, unitOther: known ? '' : p.unit, isRoll: !!p.isRoll, reorderPoint: p.reorderPoint,
          vendorCode: p.vendorCode || '', note: p.note || '', buyUnit: p.buyUnit && p.buyUnit !== p.unit ? p.buyUnit : '', buyFactor: p.buyFactor > 1 ? p.buyFactor : null,
          rollSize: p.isRoll ? p.rollSize : null, scrapMin: p.isRoll ? p.scrapMin : null, needsApproval: !!p.needsApproval };
      };
      watch(() => props.visible, (v) => {
        if (!v) return;
        Object.assign(f, props.product ? fromProduct(props.product) : blank(props.initialName, props.initialVendor));
        Object.assign(op, window.openingBlank(props.defaultWh)); foundOpen.value = false;
        photos.value = []; newCat.value = null; dtab.value = 'info'; more.value = !!props.initialVendor;
      });

      // ---- ล็อกต่อช่อง (แก้ไข): คืนเหตุผลเป็นข้อความ หรือ '' = แก้ได้ ----
      const stockLocked = computed(() => edit.value && (Domain.totalQty(state, props.product.id) > 0 || Domain.hasHistory(state, props.product.id)));
      const lock = (field) => {
        if (!edit.value) return '';
        if (isEng.value) return 'ดูอย่างเดียว';
        if (isStore(field)) return MSG_HEAD;
        if ((field === 'unit' || field === 'isRoll') && stockLocked.value) return MSG_UNIT;
        return '';
      };
      const isStore = (field) => role.value === 'store' && !STORE_FIELDS.includes(field);
      const dis = (field) => !!lock(field);
      const note = (field) => (viewOnly.value ? '' : lock(field));

      const unit = computed(() => (f.isRoll ? 'เมตร' : f.unitPick === OTHER ? f.unitOther.trim() : f.unitPick) || '');
      // หมวดแม่เป็นกลุ่ม ตัวเลือกคือหมวดย่อย (หมวดแม่ที่ยังไม่มีหมวดย่อยเลือกตัวเองได้)
      const catGroups = computed(() => {
        const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
        return state.categories.filter((c) => !c.parentId).sort(byOrder).map((p) => {
          const subs = state.categories.filter((c) => c.parentId === p.id).sort(byOrder);
          return { label: p.name, items: subs.length ? subs : [p] };
        });
      });
      // ชื่อซ้ำตรงตัว: ตรวจรวมที่เลิกใช้ (domain ก็ตรวจรวม) แต่ "ใช้รายการนี้" ใช้ได้เฉพาะที่ยังใช้งาน
      const dup = computed(() => norm(f.name) && state.products.find((p) => p.id !== props.product?.id && norm(p.name) === norm(f.name)));
      const similar = computed(() => (dup.value || edit.value ? [] : Domain.findSimilar(state, f.name).filter((x) => !x.exact)));
      const missing = computed(() => {
        const m = [];
        if (!norm(f.name)) m.push('ชื่อสินค้า');
        if (!f.categoryId) m.push('หมวดหมู่');
        if (!unit.value) m.push('หน่วย');
        return m;
      });
      // ข้อความตรวจของส่วนยอดที่มีอยู่ แสดงในช่องเอง (ไม่รวมใน "ยังขาด")
      const stockProblems = computed(() => (!edit.value && f.hasStock ? Domain.openingProblems(window.openingInput(op, f.isRoll, unit.value)) : []));
      const needsApr = computed(() => !!f.needsApproval || Domain.catApproval(state, f.categoryId)); // รวมหมวด (Q4)
      const foundProblems = computed(() => Domain.openingProblems(window.openingInput(found, !!props.product?.isRoll, props.product?.unit)));
      const openFound = () => { Object.assign(found, window.openingBlank(props.defaultWh)); foundOpen.value = true; };
      const submitFound = () => {
        const p0 = props.product;
        const r = act((s, u) => Domain.submitOpening(s, { productId: p0.id, whId: found.whId, shelf: found.shelf, qty: p0.isRoll ? undefined : found.qty, rollLengths: p0.isRoll ? found.rolls.slice() : undefined, kind: 'found' }, u), (x) => x.message);
        if (r) foundOpen.value = false;
      };
      const nextId = computed(() => 'P-' + String(state.counters.P + 1).padStart(4, '0'));

      // ---- รูป ----
      const curPhotos = computed(() => (edit.value ? (props.product.photos || []) : photos.value));
      const slots = computed(() => {
        const have = curPhotos.value.length;
        const max = edit.value ? (isStaff.value ? 3 : Math.max(have, 1)) : (isEng.value ? 1 : 3);
        return Array.from({ length: max }, (_, i) => i);
      });
      const canAddPhoto = computed(() => curPhotos.value.length < slots.value.length);
      const canRemovePhoto = computed(() => isStaff.value);
      async function pick(ev) {
        const file = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        photoBusy.value++;
        try {
          const d = await UI.shrink(file);
          if (edit.value) act((s, u) => Domain.addPhoto(s, props.product.id, d, u), 'เพิ่มรูปแล้ว');
          else if (photos.value.length < slots.value.length) photos.value.push(d);
        } catch (e) { services.toast?.add({ severity: 'error', summary: 'ทำรายการไม่สำเร็จ', detail: 'อ่านรูปไม่ได้ ลองรูปอื่น', life: 5000 }); } finally { photoBusy.value--; }
      }
      const removePhoto = (i) => {
        if (edit.value) act((s, u) => Domain.removePhoto(s, props.product.id, i, u), 'เอารูปออกแล้ว');
        else photos.value.splice(i, 1);
      };

      // ---- ประวัติ ----
      const history = computed(() => (edit.value ? Domain.auditFor(state, props.product.id).slice().reverse() : []));
      const who = (id) => state.users.find((u) => u.id === id)?.name || id || '-';
      const when = (at) => new Date(at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

      const close = () => emit('update:visible', false);
      const use = (p) => { emit('created', p, { existing: true, opening: null }); close(); };
      const startNewCat = () => { catSelect.value?.hide(); newCat.value = ''; };
      const saveNewCat = () => {
        const cat = act((s, u) => Domain.addCategory(s, { name: newCat.value }, u), (c) => `สร้างหมวด "${c.name}" แล้ว`);
        if (cat) { f.categoryId = cat.id; newCat.value = null; }
      };
      const onScan = ({ code }) => { f.vendorCode = code; };

      const save = () => {
        const p0 = props.product;
        const patch = { name: f.name, brand: f.brand.trim() || (p0.brand === '-' ? '-' : ''), model: f.model.trim(), vendorCode: f.vendorCode, note: f.note };
        if (isHead.value) {
          Object.assign(patch, {
            code: f.code, categoryId: f.categoryId, unit: unit.value, isRoll: f.isRoll, needsApproval: f.needsApproval,
            buyUnit: f.buyUnit, buyFactor: f.buyFactor ?? 1, reorderPoint: f.reorderPoint ?? 0,
          });
          if (f.isRoll) Object.assign(patch, { rollSize: f.rollSize ?? p0.rollSize, scrapMin: f.scrapMin ?? p0.scrapMin });
        }
        const p = act((s, u) => Domain.updateProduct(s, p0.id, patch, u), (x) => `บันทึกแล้ว: ${x.name}`);
        if (p) { emit('saved', p); close(); }
      };
      const create = () => {
        const input = {
          name: f.name, brand: f.brand.trim(), model: f.model.trim(), code: f.code, categoryId: f.categoryId, unit: unit.value, isRoll: f.isRoll,
          reorderPoint: f.reorderPoint ?? 0, vendorCode: f.vendorCode, note: f.note, buyUnit: f.buyUnit || undefined, buyFactor: f.buyFactor ?? undefined,
          rollSize: f.isRoll ? f.rollSize ?? undefined : undefined, scrapMin: f.isRoll ? f.scrapMin ?? undefined : undefined,
          needsApproval: isHead.value ? f.needsApproval : undefined, photos: photos.value.slice(),
          initial: f.hasStock ? (f.isRoll ? { whId: op.whId, shelf: op.shelf, rollLengths: op.rolls.slice() } : { whId: op.whId, shelf: op.shelf, qty: op.qty }) : null,
        };
        const r = act((s, u) => Domain.addProduct(s, input, u), (x) => {
          const o = x.opening;
          return o ? o.message + (props.createdNote || '') : `สร้างแล้ว: ${x.product.name} (${x.product.id})${props.createdNote || ''}`;
        });
        if (r) { emit('created', r.product, { existing: false, opening: r.opening }); close(); }
      };
      const submit = () => { if (!missing.value.length && !stockProblems.value.length && !dup.value && !photoBusy.value) (edit.value ? save() : create()); };

      const toggleActive = () => {
        const p = props.product;
        if (!active.value) {
          if (act((s, u) => Domain.setProductActive(s, p.id, true, u), `เปิดใช้ ${p.name} อีกครั้งแล้ว`)) close();
          return;
        }
        services.confirm.require({
          header: 'เลิกใช้สินค้า', icon: 'pi pi-exclamation-triangle',
          message: `เลิกใช้ "${p.name}" หรือไม่? สินค้าจะถูกซ่อนจากตัวเลือก ประวัติยังอยู่ และเปิดใช้อีกครั้งได้`,
          rejectProps: { label: 'ยกเลิก', severity: 'secondary', outlined: true }, acceptProps: { label: 'เลิกใช้', severity: 'danger' },
          accept: () => { if (act((s, u) => Domain.setProductActive(s, p.id, false, u), `เลิกใช้ ${p.name} แล้ว`)) close(); },
        });
      };

      const header = computed(() => (!edit.value ? 'สร้างสินค้าใหม่' : viewOnly.value ? 'ดูสินค้า' : 'แก้ไขสินค้า'));
      return { f, UNITS, OTHER, unit, catGroups, catSelect, newCat, op, found, foundOpen, openFound, submitFound, foundProblems, needsApr, stockProblems, dup, similar, missing, nextId, edit, viewOnly, isHead, isEng, active,
        lock, dis, note, slots, curPhotos, canAddPhoto, canRemovePhoto, pick, removePhoto, photoBusy, more, dtab, history, who, when,
        close, use, startNewCat, saveNewCat, onScan, submit, save, create, toggleActive, header, Domain };
    },
    template: `<p-dialog :visible="visible" @update:visible="$emit('update:visible', $event)" :header="header" modal
      dismissableMask class="product-dialog" :draggable="false">
      <p-tabs v-if="edit" v-model:value="dtab" class="pd-tabs">
        <p-tablist><p-tab value="info">ข้อมูล</p-tab><p-tab value="history">ประวัติ</p-tab></p-tablist>
      </p-tabs>
      <form v-show="dtab === 'info'" class="pd-form" @submit.prevent="submit">
        <p v-if="viewOnly" class="pd-note pd-viewonly"><i class="pi pi-lock" aria-hidden="true"></i> ดูอย่างเดียว แก้ข้อมูลได้เฉพาะ Store และหัวหน้า</p>
        <p v-if="edit && !active" class="pd-note"><span class="status-tag tone-gray"><span class="dot" aria-hidden="true"></span>เลิกใช้</span> สินค้านี้ถูกซ่อนจากตัวเลือกแล้ว</p>
        <div class="field">
          <label for="pd-name">ชื่อสินค้า <span class="req">*</span></label>
          <p-inputtext id="pd-name" v-model="f.name" placeholder="เช่น น็อตสแตนเลส M8" autocomplete="off" :invalid="!!dup" :disabled="dis('name')" fluid />
          <p-message v-if="dup" severity="error" class="pd-msg">
            <span class="pd-msg-row"><span>มีสินค้านี้แล้ว: <doc-id :id="dup.code" /> {{ dup.name }}</span>
              <p-button v-if="fromSearch && !edit && dup.active !== false" label="ใช้รายการนี้" severity="danger" outlined @click="use(dup)" /></span>
          </p-message>
          <p-message v-if="similar.length" severity="warn" class="pd-msg">
            <div class="pd-sim">
              <b>มีสินค้าชื่อคล้ายกันอยู่แล้ว ดูก่อนสร้าง</b>
              <div v-for="m in similar" :key="m.product.id" class="pd-sim-row">
                <product-thumb :product="m.product" :size="40" />
                <span class="pd-sim-txt"><span class="pd-sim-name">{{ m.product.name }}</span>
                  <span class="muted"><doc-id :id="m.product.code" /> · คล้าย {{ m.pct }}%</span></span>
                <p-button v-if="fromSearch" label="ใช้รายการนี้" severity="warn" outlined @click="use(m.product)" />
              </div>
            </div>
          </p-message>
        </div>
        <div class="field">
          <span class="field-label" id="pd-photo-l">รูปของ</span>
          <div class="pd-photos" role="group" aria-labelledby="pd-photo-l">
            <template v-for="i in slots" :key="i">
              <div v-if="curPhotos[i]" class="pd-slot filled">
                <img :src="curPhotos[i]" :alt="'รูปที่ ' + (i + 1)">
                <button v-if="canRemovePhoto" type="button" class="pd-slot-x" :aria-label="'เอารูปที่ ' + (i + 1) + ' ออก'" @click="removePhoto(i)"><i class="pi pi-times" aria-hidden="true"></i></button>
              </div>
              <label v-else-if="i === curPhotos.length && canAddPhoto" class="pd-slot add">
                <input type="file" accept="image/*" class="sr-only" @change="pick">
                <i class="pi pi-camera" aria-hidden="true"></i><span>เพิ่มรูป</span>
              </label>
              <div v-else class="pd-slot empty" aria-hidden="true"></div>
            </template>
          </div>
          <small v-if="photoBusy" class="muted pd-hint">กำลังบันทึกรูป</small>
          <small v-else-if="!edit && isEng" class="muted pd-hint">วิศวกรใส่รูปได้ 1 รูป</small>
          <small v-else-if="edit && !isEng" class="muted pd-hint">รูปที่เพิ่ม/เอาออกบันทึกทันที</small>
        </div>
        <div class="pd-grid">
          <div class="field">
            <label for="pd-brand">ยี่ห้อ</label>
            <p-inputtext id="pd-brand" v-model="f.brand" placeholder="เช่น Yazaki, 3M" :disabled="dis('brand')" fluid />
          </div>
          <div class="field">
            <label for="pd-model">รุ่น / ขนาด</label>
            <p-inputtext id="pd-model" v-model="f.model" placeholder="เช่น THW 1x2.5 sq.mm" :disabled="dis('model')" fluid />
          </div>
        </div>
        <div class="field">
          <label id="pd-cat-l">หมวดหมู่ <span class="req">*</span></label>
          <p-select ref="catSelect" v-model="f.categoryId" :options="catGroups" optionGroupLabel="label" optionGroupChildren="items"
            optionLabel="name" optionValue="id" filter placeholder="เลือกหมวดหมู่" ariaLabelledby="pd-cat-l" :disabled="dis('categoryId')" fluid>
            <template #footer>
              <button type="button" class="select-footer-btn" @click="startNewCat"><i class="pi pi-plus" aria-hidden="true"></i> สร้างหมวดใหม่</button>
            </template>
          </p-select>
          <small v-if="note('categoryId')" class="muted pd-hint">{{ note('categoryId') }}</small>
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
              :class="{ checked: f.isRoll ? u === 'เมตร' : f.unitPick === u }" :aria-checked="f.isRoll ? u === 'เมตร' : f.unitPick === u"
              :disabled="f.isRoll || dis('unit')" @click="f.unitPick = u">{{ u }}</button>
          </div>
          <p-inputtext v-if="f.unitPick === OTHER && !f.isRoll" v-model="f.unitOther" placeholder="พิมพ์หน่วย เช่น เส้น, ชุด, คู่" aria-label="หน่วยอื่น" :disabled="dis('unit')" fluid />
          <small v-if="note('unit')" class="muted pd-hint">{{ note('unit') }}</small>
        </div>
        <div class="field">
          <label class="switch-row pd-roll">
            <span>เป็นสายม้วน ตัดขายเป็นเมตร</span>
            <p-toggleswitch v-model="f.isRoll" :disabled="dis('isRoll')" />
          </label>
          <small v-if="note('isRoll')" class="muted pd-hint">{{ note('isRoll') }}</small>
          <p v-if="f.isRoll" class="pd-note"><i class="pi pi-info-circle" aria-hidden="true"></i> <span><b>สายม้วนใช้หน่วยเมตร</b> ระบบจะนับเป็นความยาว (เมตร) และตัดจากม้วนให้</span></p>
        </div>
        <div class="field">
          <label for="pd-rp">เตือนให้สั่งซื้อเมื่อเหลือน้อยกว่า</label>
          <p-inputnumber inputId="pd-rp" v-model="f.reorderPoint" :min="0" :maxFractionDigits="unit === 'เมตร' ? 2 : 0" placeholder="0" :disabled="dis('reorderPoint')" fluid />
          <small v-if="note('reorderPoint')" class="muted pd-hint">{{ note('reorderPoint') }}</small>
        </div>
        <label v-if="!edit" class="switch-row pd-switch">
          <span>มีของนี้อยู่ในคลังแล้ว</span>
          <p-toggleswitch v-model="f.hasStock" />
        </label>
        <opening-fields v-if="f.hasStock && !edit" :model="op" :is-roll="f.isRoll" :unit="unit" :needs-approval="needsApr" />
        <p-button v-if="edit" label="ลงยอดที่เจอเพิ่ม" icon="pi pi-plus-circle" severity="secondary" outlined class="pd-found-btn" @click="openFound" />

        <button type="button" class="pd-more" :aria-expanded="more" aria-controls="pd-extra" @click="more = !more">
          <i :class="['pi', more ? 'pi-chevron-down' : 'pi-chevron-right']" aria-hidden="true"></i> ข้อมูลเพิ่มเติม (ไม่บังคับ)</button>
        <div v-show="more" id="pd-extra" class="pd-extra">
          <div class="field">
            <label for="pd-vendor">รหัสจากผู้ขาย / บาร์โค้ด</label>
            <div class="pd-scanrow">
              <p-inputtext id="pd-vendor" v-model="f.vendorCode" placeholder="เช่น 8851234567890" autocomplete="off" :disabled="dis('vendorCode')" fluid />
              <scan-button v-if="!viewOnly" :kinds="['product']" close-on-miss @found="onScan" @notfound="(c) => f.vendorCode = c" />
            </div>
          </div>
          <div class="field">
            <label for="pd-note">หมายเหตุ</label>
            <p-inputtext id="pd-note" v-model="f.note" :disabled="dis('note')" fluid />
          </div>
          <div class="field">
            <label for="pd-code">รหัสสินค้า</label>
            <p-inputtext id="pd-code" v-model="f.code" :placeholder="'ว่างไว้ = ใช้ ' + nextId" :disabled="dis('code')" fluid />
            <small v-if="note('code')" class="muted pd-hint">{{ note('code') }}</small>
          </div>
          <div class="pd-grid">
            <div class="field">
              <label for="pd-buyunit">หน่วยตอนสั่งซื้อ</label>
              <p-inputtext id="pd-buyunit" v-model="f.buyUnit" placeholder="เหมือนหน่วยหลัก" :disabled="dis('buyUnit')" fluid />
            </div>
            <div class="field">
              <label for="pd-buyf">1 หน่วยสั่งซื้อ เท่ากับกี่ {{ unit || 'หน่วย' }}</label>
              <p-inputnumber inputId="pd-buyf" v-model="f.buyFactor" :min="1" :maxFractionDigits="2" placeholder="1" :disabled="dis('buyFactor')" fluid />
            </div>
          </div>
          <small v-if="note('buyUnit')" class="muted pd-hint">{{ note('buyUnit') }}</small>
          <template v-if="f.isRoll">
            <div class="pd-grid">
              <div class="field">
                <label for="pd-rollsize">ความยาวม้วน (เมตร)</label>
                <p-inputnumber inputId="pd-rollsize" v-model="f.rollSize" :min="1" :maxFractionDigits="2" placeholder="100" :disabled="dis('rollSize')" fluid />
              </div>
              <div class="field">
                <label for="pd-scrap">เศษม้วนที่สั้นกว่านี้ถือเป็นของเสีย (เมตร)</label>
                <p-inputnumber inputId="pd-scrap" v-model="f.scrapMin" :min="0" :maxFractionDigits="2" placeholder="3" :disabled="dis('scrapMin')" fluid />
              </div>
            </div>
            <small v-if="note('rollSize')" class="muted pd-hint">{{ note('rollSize') }}</small>
          </template>
          <label v-if="isHead" class="switch-row">
            <span>ต้องให้หัวหน้าอนุมัติเมื่อยอดเปลี่ยน<small>รับยอดตั้งต้น / ปรับยอดจากการนับ</small></span>
            <p-toggleswitch v-model="f.needsApproval" />
          </label>
          <p class="muted pd-hint">หัวหน้าเติมทีหลังที่ ตั้งค่า → สินค้า ก็ได้</p>
        </div>
      </form>

      <div v-if="edit && dtab === 'history'" class="pd-history">
        <p v-if="!history.length" class="muted">ยังไม่มีประวัติ</p>
        <ul v-else class="pd-hist-list">
          <li v-for="(h, i) in history" :key="i"><span class="muted pd-hist-meta">{{ when(h.at) }} · {{ who(h.by) }}</span><span>{{ h.text }}</span></li>
        </ul>
      </div>
      <template #footer>
        <div class="pd-footer">
          <p v-if="!viewOnly && dtab === 'info' && missing.length" class="pd-missing">ยังขาด: {{ missing.join(' · ') }}</p>
          <div class="pd-actions">
            <p-button v-if="edit && isHead" :label="active ? 'เลิกใช้สินค้า' : 'เปิดใช้อีกครั้ง'" :icon="active ? 'pi pi-ban' : 'pi pi-replay'"
              :severity="active ? 'danger' : 'secondary'" text class="pd-deact" @click="toggleActive" />
            <p-button :label="viewOnly ? 'ปิด' : 'ยกเลิก'" severity="secondary" outlined @click="close" />
            <p-button v-if="!viewOnly" :label="edit ? 'บันทึก' : 'สร้าง'" icon="pi pi-check" :disabled="!!missing.length || !!stockProblems.length || !!dup || !!photoBusy" @click="submit" />
          </div>
        </div>
      </template>
      <p-dialog v-model:visible="foundOpen" header="ลงยอดที่เจอเพิ่ม" modal dismissableMask class="found-dialog" :draggable="false">
        <p class="muted pd-hint">{{ product && product.name }} — ของที่เจอบนชั้นแต่ยังไม่อยู่ในระบบ</p>
        <opening-fields v-if="product" :model="found" :is-roll="!!product.isRoll" :unit="product.unit" :needs-approval="!!product.needsApproval" />
        <template #footer>
          <p-button label="ยกเลิก" severity="secondary" outlined @click="foundOpen = false" />
          <p-button label="ลงยอด" icon="pi pi-check" :disabled="!!foundProblems.length" @click="submitFound" />
        </template>
      </p-dialog>
    </p-dialog>`,
  };
})();
