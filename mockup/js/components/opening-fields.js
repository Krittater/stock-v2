// ช่องกรอกยอดที่มีอยู่: จำนวน (หรือม้วนละกี่เมตร) → คลัง → ชั้น (OS-G3) + ข้อความบอกล่วงหน้า (OS-G5)
// <opening-fields :model="o" :is-roll :unit :needs-approval /> · o = { whId, shelf, qty, rolls: [] } (แก้ในที่เดิม)
// ใช้ร่วมกันที่กล่องสร้างสินค้า และกล่อง "ลงยอดที่เจอเพิ่ม"
(function () {
  const { computed, watch, ref } = Vue;
  const { state, user } = AppState;
  const SHELF = 'ทั่วไป';
  const r2 = (n) => +Number(n).toFixed(2);

  // คลังเริ่มต้น: คลังที่เลือกไว้ (ถ้าใช้ได้) ไม่งั้นคลังแรกที่เปิดใช้และไม่ถูกนับ
  const openWhs = () => state.warehouses.filter((w) => w.active !== false && !w.countId);
  window.openingBlank = (preferWh) => ({ whId: (openWhs().find((w) => w.id === preferWh) || openWhs()[0] || {}).id || null, shelf: SHELF, qty: null, rolls: [null] });
  window.openingInput = (o, isRoll, unit) => ({ whId: o.whId, qty: o.qty, rolls: o.rolls, isRoll, unit });

  window.OpeningFields = {
    props: { model: Object, isRoll: Boolean, unit: String, needsApproval: Boolean },
    setup(props) {
      const wh = computed(() => openWhs());
      const shelves = computed(() => (props.model.whId ? Domain.shelves(state, props.model.whId) : []));
      watch(shelves, (o) => { if (o.length && !o.includes(props.model.shelf)) props.model.shelf = o.includes(SHELF) ? SHELF : o[0]; });
      const total = computed(() => r2(props.model.rolls.reduce((a, b) => a + (b > 0 ? b : 0), 0)));
      const lead = computed(() => Domain.openingLead(user.value.role, props.needsApproval));
      // แสดงข้อความตรวจหลังแตะช่องแล้วเท่านั้น (ปุ่มยังกดไม่ได้ตลอด เพราะ parent ตรวจเอง)
      const touched = ref(false);
      watch(() => [props.model.whId, props.model.qty, JSON.stringify(props.model.rolls)], () => { touched.value = true; });
      const problems = computed(() => !touched.value ? [] : Domain.openingProblems(window.openingInput(props.model, props.isRoll, props.unit)));
      return { Domain, wh, shelves, total, lead, problems, SHELF };
    },
    template: `<div class="pd-stock">
      <template v-if="isRoll">
        <div class="field">
          <span class="field-label" id="of-roll-l">ม้วนละกี่เมตร <span class="req">*</span></span>
          <div v-for="(r, i) in model.rolls" :key="i" class="of-roll">
            <p-inputnumber v-model="model.rolls[i]" :min="0" :maxFractionDigits="2" suffix=" เมตร" :aria-label="'ม้วนที่ ' + (i + 1) + ' ยาวกี่เมตร'" fluid />
            <p-button v-if="model.rolls.length > 1" icon="pi pi-trash" severity="secondary" text rounded :aria-label="'ลบม้วนที่ ' + (i + 1)" @click="model.rolls.splice(i, 1)" />
          </div>
          <p-button label="เพิ่มม้วน" icon="pi pi-plus" severity="secondary" text @click="model.rolls.push(null)" />
          <p v-if="total > 0" class="of-total num">รวม {{ model.rolls.length }} ม้วน {{ Domain.formatQty(total, 'เมตร') }}</p>
        </div>
      </template>
      <div v-else class="field">
        <label for="of-qty">จำนวนที่มีอยู่ <span class="req">*</span></label>
        <p-inputnumber inputId="of-qty" v-model="model.qty" :min="0" :maxFractionDigits="2" :suffix="unit ? ' ' + unit : ''" fluid />
      </div>
      <div class="pd-grid">
        <div class="field">
          <label id="of-wh-l">คลัง <span class="req">*</span></label>
          <p-select v-model="model.whId" :options="wh" optionLabel="name" optionValue="id" placeholder="เลือกคลัง" ariaLabelledby="of-wh-l" fluid />
        </div>
        <div class="field">
          <label id="of-sh-l">ชั้น</label>
          <p-select v-model="model.shelf" :options="shelves" :disabled="!shelves.length" ariaLabelledby="of-sh-l" fluid />
        </div>
      </div>
      <small v-if="model.shelf === SHELF" class="muted pd-hint">วางที่ ทั่วไป ย้ายชั้นทีหลังได้</small>
      <p v-for="m in problems" :key="m" class="of-problem" role="status"><i class="pi pi-exclamation-circle" aria-hidden="true"></i> {{ m }}</p>
      <p class="pd-note"><i class="pi pi-info-circle" aria-hidden="true"></i> {{ lead }}</p>
    </div>`,
  };
})();
