// ประวัติการใช้งาน (หัวหน้าเท่านั้น): ตาราง state.audit ใหม่สุดก่อน กรองผู้ใช้ / การกระทำ / ช่วงวันที่
(function () {
  const { ref, computed, watch } = Vue;
  const { state, user, go } = AppState;

  // รหัสการกระทำ → ข้อความไทย (ไม่มีในนี้ = แสดงรหัสเดิม)
  const LABEL = {
    'category.add': 'เพิ่มหมวด', 'category.update': 'แก้หมวด', 'category.delete': 'ลบหมวด',
    'count.start': 'เปิดรอบนับ', 'count.close': 'ปิดรอบนับ', 'count.cancel': 'ยกเลิกรอบนับ', 'count.queue': 'ส่งปรับยอดให้หัวหน้า',
    issue: 'เบิกของ', 'issue.submit': 'ส่งใบเบิกรออนุมัติ', 'issue.pick': 'จ่ายของที่กันไว้', 'issue.reject': 'ไม่อนุมัติใบเบิก', 'issue.close': 'ปิดใบเบิก', 'issue.cancel': 'ยกเลิกใบเบิก',
    'job.add': 'เพิ่มงาน', 'job.update': 'แก้งาน', 'job.close': 'ปิดงาน', 'job.reopen': 'เปิดงานอีกครั้ง', 'job.clone': 'คัดลอกงาน',
    'opening.submit': 'ส่งยอดตั้งต้น', 'opening.confirm': 'Store ยืนยันยอด', 'opening.approve': 'อนุมัติยอด', 'opening.reject': 'ไม่รับยอด',
    'opening.post': 'ลงยอดตั้งต้น', 'opening.import': 'นำเข้ายอดยกมา', 'opening.lock': 'ล็อก/ปลดล็อกยอดยกมา', 'setting.approval': 'ตั้งค่าใบเบิกต้องอนุมัติ', 'hold.release': 'ลดของที่กันไว้',
    'pr.open': 'เปิดรายการต้องซื้อ', 'pr.trim': 'ลดรายการต้องซื้อ', 'pr.cancel': 'ยกเลิกรายการต้องซื้อ',
    'product.add': 'เพิ่มวัสดุ', 'product.update': 'แก้วัสดุ', 'product.active': 'เปิด/เลิกใช้วัสดุ', 'product.photo': 'เปลี่ยนรูปวัสดุ',
    'qc.restock': 'คืนเข้าชั้น', 'qc.scrap': 'ตัดเป็นของเสีย',
    receive: 'รับของเข้า', 'receive.submit': 'ส่งใบรับของ', 'receive.reject': 'ไม่รับของ',
    return: 'คืนของ', 'return.reverse': 'กลับรายการคืน',
  };
  const labelOf = (a, text) => (a === 'opening.lock' && text ? (text.startsWith('ปลดล็อก') ? 'ปลดล็อกยอดยกมา' : 'ล็อกยอดยกมา') : LABEL[a] || a); // รหัสเดียวทั้งล็อก/ปลดล็อก แยกตามข้อความ
  // ลิงก์ไปหน้าที่มีเลขอ้างอิงนั้น (ไม่มีหน้า = ไม่ทำลิงก์)
  function linkOf(a) {
    const r = a.ref || '';
    if (a.action === 'count.queue' || a.action === 'opening.submit' || a.action === 'opening.confirm') return ['approvals', { tab: 'cc' }];
    if (a.action === 'opening.post' || a.action === 'opening.approve' || a.action === 'opening.reject') return null; // ref เป็นรหัสสินค้า ไม่มีหน้าที่แสดงรายการนี้
    if (a.action.startsWith('count.')) return ['count', { id: r }];
    if (a.action === 'opening.import' || a.action === 'opening.lock') return ['opening'];
    if (/^J-/.test(r)) return ['jobs', { id: r }];
    if (/^RT-/.test(r)) return ['returns'];
    if (/^(RC|PR)-/.test(r)) return ['receive'];
    if (/^(REQ|RC|ADJ)-/.test(r)) return ['home', { doc: r }];
    return null;
  }
  const dayOf = (at) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  window.Pages.history = {
    setup() {
      const isHead = computed(() => user.value.role === 'head');
      const who = ref('');
      const act = ref('');
      const from = ref('');
      const to = ref('');
      const first = ref(0);
      watch([who, act, from, to], () => { first.value = 0; });
      const nameOf = (id) => (id === 'system' ? 'ระบบ' : state.users.find((u) => u.id === id)?.name || id || '-');
      const when = (at) => new Date(at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
      const all = computed(() => (state.audit || []).slice().reverse());
      const whoOpts = computed(() => [{ label: 'ทุกคน', value: '' }, ...[...new Set(all.value.map((a) => a.by))].map((id) => ({ label: nameOf(id), value: id }))]);
      const actOpts = computed(() => [{ label: 'ทุกการกระทำ', value: '' }, ...[...new Set(all.value.map((a) => a.action))].map((c) => ({ label: labelOf(c), value: c }))]);
      const rows = computed(() => all.value.filter((a) => (!who.value || a.by === who.value) && (!act.value || a.action === act.value)
        && (!from.value || dayOf(a.at) >= from.value) && (!to.value || dayOf(a.at) <= to.value)));
      const clear = () => { who.value = ''; act.value = ''; from.value = ''; to.value = ''; };
      const filtered = computed(() => !!(who.value || act.value || from.value || to.value));
      return { isHead, who, act, from, to, first, rows, whoOpts, actOpts, nameOf, when, labelOf, linkOf, clear, filtered, go, FORBIDDEN: Domain.FORBIDDEN };
    },
    template: `<div class="history-page">
      <page-header icon="pi-history" title="ประวัติการใช้งาน" subtitle="ใครทำอะไร เมื่อไร (ใหม่สุดก่อน)" />
      <div v-if="!isHead" class="card placeholder"><i class="pi pi-lock" aria-hidden="true"></i><p>{{ FORBIDDEN }}</p></div>
      <section v-else class="card hs-main" aria-label="ประวัติการใช้งาน">
        <div class="hs-filters">
          <label class="hs-field"><span>ผู้ใช้</span><p-select v-model="who" :options="whoOpts" optionLabel="label" optionValue="value" placeholder="ทุกคน" aria-label="กรองตามผู้ใช้" fluid /></label>
          <label class="hs-field"><span>การกระทำ</span><p-select v-model="act" :options="actOpts" optionLabel="label" optionValue="value" placeholder="ทุกการกระทำ" aria-label="กรองตามการกระทำ" filter fluid /></label>
          <label class="hs-field"><span>ตั้งแต่วันที่</span><input v-model="from" type="date" class="hs-date" :max="to || null"></label>
          <label class="hs-field"><span>ถึงวันที่</span><input v-model="to" type="date" class="hs-date" :min="from || null"></label>
          <p-button v-if="filtered" label="ล้างตัวกรอง" icon="pi pi-filter-slash" severity="secondary" outlined @click="clear" />
        </div>
        <p-datatable :value="rows" paginator :rows="20" v-model:first="first" class="hs-table">
          <p-column header="วันที่เวลา" bodyClass="hs-when"><template #body="{ data }"><span class="num">{{ when(data.at) }}</span></template></p-column>
          <p-column header="ผู้ใช้"><template #body="{ data }">{{ nameOf(data.by) }}</template></p-column>
          <p-column header="การกระทำ"><template #body="{ data }">{{ labelOf(data.action, data.text) }}</template></p-column>
          <p-column header="เลขอ้างอิง">
            <template #body="{ data }">
              <button v-if="linkOf(data)" type="button" class="doc-link" :aria-label="'ไปที่ ' + data.ref" @click="go(...linkOf(data))"><doc-id :id="data.ref" /></button>
              <doc-id v-else :id="data.ref" />
            </template>
          </p-column>
          <p-column header="รายละเอียด" bodyClass="hs-text"><template #body="{ data }">{{ data.text }}</template></p-column>
          <template #empty><div class="table-empty"><p>ยังไม่มีประวัติ</p></div></template>
        </p-datatable>
      </section>
    </div>`,
  };
})();
