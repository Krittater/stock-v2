// รายการรอยืนยันยอด (ใบรับของวิศวกร + ยอดตั้งต้น/ของที่เจอเพิ่ม/ปรับยอดนับ) — ใช้ร่วมกันที่หน้ารับของและหน้าอนุมัติ
(function () {
  const { reactive, computed } = Vue;
  const { state, user, act } = AppState;
  const fmt = (n, unit) => Domain.formatQty(n ?? 0, unit);
  const r2 = (n) => +Number(n).toFixed(2);
  const COND = { ok: 'ครบดี', damaged: 'ชำรุด', reject: 'ส่งคืนผู้ขาย' };
  const KIND = { opening: 'ยอดตั้งต้น', found: 'ของที่เจอเพิ่ม', count: 'ปรับยอดจากรอบนับ' };

  window.ConfirmList = {
    props: { receipts: { type: Array, default: () => [] }, ccs: { type: Array, default: () => [] } },
    setup() {
      const byId = computed(() => new Map(state.products.map((p) => [p.id, p])));
      const whName = (id) => state.warehouses.find((w) => w.id === id)?.name || '-';
      const userName = (id) => state.users.find((u) => u.id === id)?.name || id || '-';
      const isEng = computed(() => user.value.role === 'engineer');
      const text = reactive({}); // id → { reason, rejecting }
      const tx = (id) => text[id] || (text[id] = { reason: '', rejecting: false });
      const docOver = (d) => (d.overReason ? [] : Domain.receiveCoverage(state, d.lines).filter((c) => c.left < -1e-9).map((c) => Domain.overMessage(-c.left, byId.value.get(c.productId)?.unit)));
      const confirmDoc = (d) => act((s, u) => Domain.confirmReceipt(s, d.id, u, true, tx(d.id).reason), 'ยืนยันยอด ' + d.id + ' แล้ว เพิ่มสต็อกเรียบร้อย');
      const rejectDoc = (d) => act((s, u) => Domain.confirmReceipt(s, d.id, u, false, tx(d.id).reason), 'บันทึก ' + d.id + ' ว่าไม่มีของแล้ว');
      const ccQty = (c) => (c.kind === 'count' ? c.diff : c.rollLengths ? r2(c.rollLengths.reduce((a, b) => a + b, 0)) : c.qty);
      const canAct = (c) => (c.stage === 'head' ? user.value.role === 'head' : !isEng.value);
      const confirmCc = (c) => act((s, u) => Domain.confirmOpening(s, c.id, u, true), (r) => (r.stage === 'head' ? `ยืนยันแล้ว ส่งให้หัวหน้าอนุมัติต่อ (${c.id})` : 'ยืนยันยอด ' + c.id + ' แล้ว'));
      const rejectCc = (c) => act((s, u) => Domain.confirmOpening(s, c.id, u, false, tx(c.id).reason), 'บันทึก ' + c.id + ' ว่าไม่มีของแล้ว');
      const rollTxt = (c) => (c.rollLengths ? `รวม ${c.rollLengths.length} ม้วน ${fmt(ccQty(c), byId.value.get(c.productId)?.unit)}` : null);
      return { Domain, byId, whName, userName, isEng, tx, docOver, confirmDoc, rejectDoc, ccQty, canAct, confirmCc, rejectCc, rollTxt, fmt, COND, KIND };
    },
    template: `<div class="confirm-list">
      <div v-for="d in receipts" :key="d.id" class="rc-pending">
        <div class="rc-pending-top"><doc-id :id="d.id" /> <span class="muted">· ใบรับของ · {{ whName(d.whId) }} · โดย {{ userName(d.by) }}<template v-if="d.invoiceNo"> · ใบส่งของ {{ d.invoiceNo }}</template></span></div>
        <ul class="rc-pending-lines">
          <li v-for="(l, i) in d.lines" :key="i">{{ byId.get(l.productId)?.name }} <strong>{{ fmt(l.qty, byId.get(l.productId)?.unit) }}</strong>
            <span class="muted"> · {{ COND[l.condition] || l.condition }}<template v-if="l.prId"> · <doc-id :id="l.prId" /></template></span></li>
        </ul>
        <template v-if="!isEng">
          <div v-for="o in docOver(d)" :key="o" class="rt-warn" role="alert"><span><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> {{ o }}</span>
            <label :for="'ov' + d.id" class="rt-lbl">เหตุผลที่รับเกิน <span class="req">*</span></label>
            <p-inputtext :id="'ov' + d.id" v-model="tx(d.id).reason" fluid /></div>
          <div v-if="tx(d.id).rejecting" class="field rc-mt"><label :for="'rj' + d.id">เหตุผล (จะแจ้งผู้ขอ) <span class="req">*</span></label>
            <p-inputtext :id="'rj' + d.id" v-model="tx(d.id).reason" fluid /></div>
          <div class="rc-pending-act">
            <template v-if="!tx(d.id).rejecting">
              <p-button label="ยืนยันยอด" icon="pi pi-check" :disabled="docOver(d).length > 0 && !tx(d.id).reason.trim()" @click="confirmDoc(d)" />
              <p-button label="ไม่มีของ" icon="pi pi-times" severity="secondary" outlined @click="tx(d.id).rejecting = true; tx(d.id).reason = ''" />
            </template>
            <template v-else>
              <p-button label="ยืนยันว่าไม่มีของ" icon="pi pi-times" severity="danger" :disabled="!tx(d.id).reason.trim()" @click="rejectDoc(d)" />
              <p-button label="ยกเลิก" severity="secondary" outlined @click="tx(d.id).rejecting = false; tx(d.id).reason = ''" />
            </template>
          </div>
        </template>
        <p v-else class="muted rc-wait"><i class="pi pi-clock" aria-hidden="true"></i> รอ Store ตรวจยืนยัน</p>
      </div>

      <div v-for="c in ccs" :key="c.id" class="rc-pending">
        <div class="rc-pending-top"><doc-id :id="c.id" /> <span class="muted">· {{ KIND[c.kind] || c.kind }} · {{ whName(c.whId) }}<template v-if="c.kind !== 'count'"> · ชั้น {{ c.shelf }}</template> · โดย {{ userName(c.by) }}<template v-if="c.countId"> · รอบนับ {{ c.countId }}</template></span></div>
        <ul class="rc-pending-lines"><li>{{ byId.get(c.productId)?.name }}
          <strong>{{ rollTxt(c) || ((c.kind === 'count' && c.diff > 0 ? '+' : '') + fmt(ccQty(c), byId.get(c.productId)?.unit)) }}</strong>
          <span class="muted"> · {{ c.stage === 'head' ? 'รอหัวหน้าอนุมัติ' : 'รอ Store ยืนยัน' }}</span></li></ul>
        <p v-if="c.stage === 'store' && byId.get(c.productId)?.needsApproval" class="rt-msg"><i class="pi pi-info-circle" aria-hidden="true"></i> สินค้านี้ต้องให้หัวหน้าอนุมัติต่อ</p>
        <template v-if="canAct(c)">
          <p v-if="c.stage === 'store' && !tx(c.id).rejecting" class="muted rc-hint">ตรวจว่ามีของจริงในคลัง แล้วกดยืนยัน</p>
          <div v-if="tx(c.id).rejecting" class="field rc-mt"><label :for="'rj' + c.id">เหตุผล (จะแจ้งผู้ขอ) <span class="req">*</span></label>
            <p-inputtext :id="'rj' + c.id" v-model="tx(c.id).reason" fluid /></div>
          <div class="rc-pending-act">
            <template v-if="!tx(c.id).rejecting">
              <p-button :label="c.stage === 'head' ? 'อนุมัติยอด' : 'ยืนยันยอด'" icon="pi pi-check" @click="confirmCc(c)" />
              <p-button label="ไม่มีของ" icon="pi pi-times" severity="secondary" outlined @click="tx(c.id).rejecting = true; tx(c.id).reason = ''" />
            </template>
            <template v-else>
              <p-button label="ยืนยันว่าไม่มีของ" icon="pi pi-times" severity="danger" :disabled="!tx(c.id).reason.trim()" @click="rejectCc(c)" />
              <p-button label="ยกเลิก" severity="secondary" outlined @click="tx(c.id).rejecting = false; tx(c.id).reason = ''" />
            </template>
          </div>
        </template>
        <p v-else class="muted rc-wait"><i class="pi pi-clock" aria-hidden="true"></i> {{ c.stage === 'head' ? 'รอหัวหน้าอนุมัติ' : 'รอ Store ตรวจยืนยัน' }}</p>
      </div>
    </div>`,
  };
})();
