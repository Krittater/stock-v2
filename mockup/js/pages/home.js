// หน้าแรก: KPI · ทางลัด · ความเคลื่อนไหวล่าสุด (docs ทุกชนิด) + dialog รายละเอียดบรรทัด
(function () {
  const { ref, computed, watch } = Vue;
  const { state, user, go, act, route } = AppState;

  const TYPE = { issue: ['เบิก', 'warn'], receive: ['รับ', 'info'], adjust: ['ปรับยอด', 'secondary'] };
  // [ข้อความ, tone] — ข้อความเสมอ ไม่พึ่งสีอย่างเดียว
  const STATUS = {
    issue: { pending: ['รออนุมัติ', 'tone-orange'], rejected: ['ไม่อนุมัติ', 'tone-red'] },
    receive: { posted: ['รับแล้ว', 'tone-green'], pending: ['รอยืนยัน', 'tone-orange'], rejected: ['ไม่มีของ', 'tone-red'] },
    adjust: { posted: ['ปรับยอดแล้ว', 'tone-blue'] },
  };
  // ใบเบิกที่ลงยอดแล้วดูจากบรรทัด: ครบทุกบรรทัด = จ่ายแล้ว · ไม่ได้ของเลย = รอของเข้า · นอกนั้น = จ่ายบางส่วน
  function statusOf(d) {
    if (d.type === 'issue' && d.status === 'rejected' && d.fill === 'cancelled') return ['ยกเลิกแล้ว', 'tone-gray']; // ยกเลิกตอนรออนุมัติ
    if (d.type === 'issue' && d.status === 'posted') {
      if (d.fill === 'closed') return ['ปิดใบเบิกแล้ว', 'tone-gray'];
      if (d.fill === 'cancelled') return ['ยกเลิกแล้ว', 'tone-gray'];
      if (d.fill === 'ready') return ['รอของเข้า — กันของไว้แล้ว', 'tone-blue'];
      const got = d.lines.map((l) => l.issued ?? l.qty); // ใบเก่าไม่มี issued = จ่ายครบ
      if (d.lines.every((l, i) => got[i] >= l.qty)) return ['จ่ายแล้ว', 'tone-green'];
      if (got.every((n) => !(n > 0))) return ['รอของเข้า', 'tone-orange'];
      return ['จ่ายบางส่วน', 'tone-orange'];
    }
    return (STATUS[d.type] || {})[d.status] || [d.status, 'tone-gray'];
  }
  UI.docStatus = statusOf; // หน้างานใช้ป้ายสถานะใบเบิกเดียวกัน
  const SHORTCUTS = [
    { label: 'เบิกของ', icon: 'pi-shopping-cart', to: ['issue'] },
    { label: 'รับของเข้า', icon: 'pi-download', to: ['receive'] },
    { label: 'ตรวจนับ', icon: 'pi-list-check', to: ['count'] },
    { label: 'เพิ่มวัสดุ', icon: 'pi-plus', to: ['products', { new: '1' }] },
  ];

  window.Pages.home = {
    setup() {
      const byId = computed(() => new Map(state.products.map((p) => [p.id, p])));
      const nameOf = (id) => state.users.find((u) => u.id === id)?.name || id || '-';
      const whName = (id) => state.warehouses.find((w) => w.id === id)?.name || '-';
      const jobName = (id) => { const j = state.jobs.find((x) => x.id === id); return j ? `${j.id} ${j.name}` : '-'; };
      const jobCode = (id) => state.jobs.find((x) => x.id === id) ? id : null;
      const when = (at) => new Date(at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
      const rows = computed(() => [...state.docs].sort((a, b) => b.at.localeCompare(a.at)).map((d) => ({
        d, type: TYPE[d.type] || [d.type, 'secondary'], status: statusOf(d),
      })));
      const first = ref(0);
      const sel = ref(null);
      // #/?doc=REQ-… เปิดกล่องรายละเอียดเอกสาร (ลิงก์จากหน้าประวัติ)
      const openDoc = (id) => { if (id) sel.value = state.docs.find((d) => d.id === id) || null; };
      openDoc(route.query.doc);
      watch(() => route.query.doc, openDoc);
      const selLines = computed(() => sel.value && sel.value.lines.map((l) => ({ l, p: byId.value.get(l.productId) })));
      const canPick = (d) => d.type === 'issue' && d.lines.some((l) => l.reserved > 0) && !state.warehouses.find((w) => w.id === d.whId)?.countId && (user.value.role !== 'engineer' || d.by === user.value.id);
      const pick = (d) => act((s, u) => Domain.pickReserved(s, d.id, u), (r) => `จ่ายของที่กันไว้ให้ ${r.id} แล้ว`);
      const retDocs = computed(() => new Set(Domain.returnable(state, user.value).map((x) => x.doc.id)));
      const waitN = computed(() => { const a = Domain.approvalItems(state, user.value); return a.ccs.length + a.receipts.length; });
      return { waitN, retDocs, canPick, pick, user, rows, first, sel, selLines, SHORTCUTS, nameOf, whName, jobName, jobCode, when, go, Domain };
    },
    template: `<div class="home-page">
      <page-header icon="pi-home" title="หน้าแรก" :subtitle="'สวัสดี ' + user.name" />
      <button v-if="user.role === 'store' && waitN" type="button" class="card home-wait" @click="go('approvals', { tab: 'cc' })">
        <i class="pi pi-check-square" aria-hidden="true"></i><span>มียอดรอคุณยืนยัน <strong class="num">{{ waitN }}</strong></span><i class="pi pi-chevron-right" aria-hidden="true"></i>
      </button>
      <kpi-row wh-id="W-BN" @tab="go('issue')" />

      <section class="card home-card" aria-labelledby="sc-h">
        <h2 id="sc-h" class="home-h">ทางลัด</h2>
        <div class="shortcuts">
          <button v-for="s in SHORTCUTS" :key="s.label" type="button" class="shortcut" @click="go(...s.to)">
            <span class="shortcut-icon"><i :class="['pi', s.icon]" aria-hidden="true"></i></span>{{ s.label }}
          </button>
        </div>
      </section>

      <section class="card home-card" aria-labelledby="led-h">
        <h2 id="led-h" class="home-h">ความเคลื่อนไหวล่าสุด</h2>
        <p-datatable :value="rows" dataKey="d.id" paginator :rows="10" v-model:first="first" class="ledger" rowHover
          @row-click="sel = $event.data.d">
          <p-column header="เวลา" bodyClass="col-when"><template #body="{ data }"><span class="num">{{ when(data.d.at) }}</span></template></p-column>
          <p-column header="เลขที่">
            <template #body="{ data }">
              <button type="button" class="doc-link" :aria-label="'ดูรายละเอียด ' + data.d.id" @click.stop="sel = data.d"><doc-id :id="data.d.id" /></button>
            </template>
          </p-column>
          <p-column header="ประเภท"><template #body="{ data }"><p-tag :value="data.type[0]" :severity="data.type[1]" /></template></p-column>
          <p-column header="คลัง"><template #body="{ data }">{{ whName(data.d.whId) }}</template></p-column>
          <p-column header="งาน"><template #body="{ data }"><template v-if="jobCode(data.d.jobId)"><button type="button" class="doc-link" :aria-label="'ดูงาน ' + data.d.jobId" @click.stop="go('jobs', { id: data.d.jobId })">{{ data.d.jobId }}</button> {{ jobName(data.d.jobId).slice(data.d.jobId.length + 1) }}</template><template v-else>-</template></template></p-column>
          <p-column header="รายการ" headerClass="col-num" bodyClass="col-num"><template #body="{ data }"><span class="num">{{ data.d.lines.length }}</span></template></p-column>
          <p-column header="โดย"><template #body="{ data }">{{ nameOf(data.d.by) }}</template></p-column>
          <p-column header="สถานะ">
            <template #body="{ data }"><span class="status-tag" :class="data.status[1]"><span class="dot" aria-hidden="true"></span>{{ data.status[0] }}</span>
              <p-button v-if="canPick(data.d)" label="จ่ายของ" size="small" class="ml-2" @click.stop="pick(data.d)" />
              <p-button v-if="retDocs.has(data.d.id)" label="คืนของ" icon="pi pi-replay" size="small" severity="secondary" outlined class="ml-2" @click.stop="go('returns', { doc: data.d.id })" /></template>
          </p-column>
          <template #empty><p class="muted">ยังไม่มีความเคลื่อนไหว</p></template>
        </p-datatable>
      </section>

      <p-dialog :visible="!!sel" @update:visible="sel = null" :header="sel ? 'เอกสาร ' + sel.id : ''" modal dismissableMask class="doc-dialog" :draggable="false">
        <template v-if="sel">
          <p class="muted doc-meta">{{ when(sel.at) }} · {{ whName(sel.whId) }}<template v-if="sel.jobId"> · งาน <button v-if="jobCode(sel.jobId)" type="button" class="doc-link" @click="go('jobs', { id: sel.jobId })">{{ sel.jobId }}</button> {{ jobName(sel.jobId).slice(sel.jobId.length + 1) }}</template> · โดย {{ nameOf(sel.by) }}</p>
          <p v-if="sel.note" class="doc-note">หมายเหตุ: {{ sel.note }}</p>
          <ul class="doc-lines">
            <li v-for="x in selLines" :key="x.l.productId">
              <span class="doc-line-name">{{ x.p ? x.p.name : x.l.productId }}</span>
              <span class="doc-line-qty">
                <template v-if="sel.type === 'issue' && sel.status === 'posted' && x.l.issued != null && x.l.issued !== x.l.qty">จ่าย <span class="num">{{ Domain.formatQty(x.l.issued) }}</span> จาก </template>
                <qty :n="x.l.qty" :unit="x.p && x.p.unit" />
              </span>
            </li>
          </ul>
        </template>
        <template #footer><p-button label="ปิด" severity="secondary" outlined @click="sel = null" /></template>
      </p-dialog>
    </div>`,
  };
})();
