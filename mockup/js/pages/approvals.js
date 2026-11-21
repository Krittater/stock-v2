// หน้าอนุมัติ: แท็บ "ใบเบิก" (หัวหน้า) + "ยืนยันยอด" (Store/หัวหน้า) ตาม Domain.approvalItems · วิศวกรไม่มีเรื่องรอ (Q7b)
(function () {
  const { computed, ref, watch } = Vue;
  const { state, user, act, services, route } = AppState;

  const DONE = {
    full: (id) => `อนุมัติ ${id} แล้ว จ่ายของครบ`,
    partial: (id) => `อนุมัติ ${id} แล้ว จ่ายบางส่วน ที่ขาดรอของเข้า`,
    waiting: (id) => `อนุมัติ ${id} แล้ว ยังไม่มีของ รอของเข้า`,
    rejected: (id) => `ไม่อนุมัติ ${id} แล้ว`,
  };

  window.Pages.approvals = {
    components: { ConfirmList: window.ConfirmList },
    setup() {
      const isHead = computed(() => user.value.role === 'head');
      const byId = computed(() => new Map(state.products.map((p) => [p.id, p])));
      const nameOf = (id) => state.users.find((u) => u.id === id)?.name || id;
      const whName = (id) => state.warehouses.find((w) => w.id === id)?.name || '-';
      const jobName = (id) => { const j = state.jobs.find((x) => x.id === id); return j ? `${j.id} ${j.name}` : '-'; };
      const when = (at) => new Date(at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
      // เปิดหน้านี้ = เห็นแล้ว: ปิดแจ้งเตือนที่ลิงก์มาหน้านี้ไม่ให้ค้างเป็นยังไม่อ่าน
      for (const n of state.notifs || []) if (n.to === user.value.id && !n.read && (n.link || '').startsWith('#/approvals')) Domain.markRead(state, user.value.id, n.id);
      const items = computed(() => Domain.approvalItems(state, user.value));
      const ccCount = computed(() => items.value.ccs.length + items.value.receipts.length);
      const tab = ref(route.query.tab === 'cc' || !isHead.value ? 'cc' : 'issues');
      watch(() => route.query.tab, (t) => { if (t === 'cc') tab.value = 'cc'; });
      watch(() => user.value.id, () => { tab.value = route.query.tab === 'cc' || !isHead.value ? 'cc' : 'issues'; });
      const cards = computed(() => items.value.issues.slice()
        .sort((a, b) => a.at.localeCompare(b.at))
        .map((d) => ({
          d,
          counting: !!state.warehouses.find((w) => w.id === d.whId)?.countId,
          lines: d.lines.map((l) => {
            const have = Domain.available(state, l.productId, d.whId);
            return { l, p: byId.value.get(l.productId), have, short: l.qty > have ? +(l.qty - have).toFixed(2) : 0 };
          }),
        })));

      const decide = (d, ok) => act((s, u) => Domain.approveIssue(s, d.id, u, ok), (r) => DONE[r.outcome](d.id));
      const reject = (d) => services.confirm.require({
        header: 'ไม่อนุมัติใบเบิก',
        message: `ไม่อนุมัติ ${d.id} ใช่หรือไม่? ใบเบิกจะถูกปิดและไม่ตัดสต็อก`,
        icon: 'pi pi-times-circle',
        rejectProps: { label: 'ยกเลิก', severity: 'secondary', outlined: true },
        acceptProps: { label: 'ไม่อนุมัติ', severity: 'danger' },
        accept: () => decide(d, false),
      });
      return { user, isHead, items, ccCount, tab, cards, nameOf, whName, jobName, when, decide, reject, Domain };
    },
    template: `<div class="approvals-page">
      <page-header icon="pi-file-check" :title="isHead ? 'อนุมัติ' : 'ยืนยันยอด'" :subtitle="isHead ? cards.length + ' ใบเบิกรออนุมัติ · ' + ccCount + ' ยอดรอยืนยัน' : ccCount + ' รายการรอคุณ'" />
      <div v-if="user.role === 'engineer'" class="card placeholder"><i class="pi pi-check-circle" aria-hidden="true"></i><p>ไม่มีเรื่องรอคุณ</p></div>
      <p-tabs v-else v-model:value="tab">
        <p-tablist>
          <p-tab v-if="isHead" value="issues">ใบเบิก ({{ cards.length }})</p-tab>
          <p-tab value="cc">ยืนยันยอด ({{ ccCount }})</p-tab>
        </p-tablist>
        <p-tabpanels>
          <p-tabpanel v-if="isHead" value="issues">
        <div v-if="!cards.length" class="card placeholder"><i class="pi pi-check-circle" aria-hidden="true"></i><p>ไม่มีใบเบิกรออนุมัติ</p></div>
        <article v-for="c in cards" :key="c.d.id" class="card appr-card" :aria-label="'ใบเบิก ' + c.d.id">
          <header class="appr-head">
            <div class="min-w-0">
              <h2><doc-id :id="c.d.id" /></h2>
              <p class="muted">ผู้ขอ {{ nameOf(c.d.by) }} · {{ when(c.d.at) }}</p>
              <p class="appr-meta"><span><i class="pi pi-briefcase" aria-hidden="true"></i> {{ jobName(c.d.jobId) }}</span>
                <span><i class="pi pi-building" aria-hidden="true"></i> {{ whName(c.d.whId) }}</span></p>
              <p v-if="c.d.note" class="muted">หมายเหตุ: {{ c.d.note }}</p>
            </div>
            <div v-if="isHead" class="appr-actions">
              <p-button label="ไม่อนุมัติ" icon="pi pi-times" severity="danger" outlined :disabled="c.counting" @click="reject(c.d)" />
              <p-button label="อนุมัติ" icon="pi pi-check" :disabled="c.counting" @click="decide(c.d, true)" />
            </div>
          </header>
          <p v-if="c.counting" class="appr-warn"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> คลังนี้กำลังตรวจนับ อนุมัติไม่ได้จนกว่าตรวจนับเสร็จ</p>
          <ul class="appr-lines">
            <li v-for="(x, i) in c.lines" :key="i">
              <product-thumb :product="x.p" :size="44" />
              <span class="appr-name">{{ x.p ? x.p.name : x.l.productId }}</span>
              <span class="appr-qty">ขอเบิก <qty :n="x.l.qty" :unit="x.p && x.p.unit" /></span>
              <span class="appr-qty">มีในคลังนี้ <qty :n="x.have" :unit="x.p && x.p.unit" /></span>
              <span v-if="x.short" class="status-tag tone-orange"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i>ขาด {{ Domain.formatQty(x.short) }}</span>
            </li>
          </ul>
        </article>
            </p-tabpanel>
          <p-tabpanel value="cc">
            <section class="card rt-main">
              <p v-if="!ccCount" class="muted rc-empty">ไม่มียอดรอยืนยัน</p>
              <confirm-list :receipts="items.receipts.slice().reverse()" :ccs="items.ccs.slice().reverse()" />
            </section>
          </p-tabpanel>
        </p-tabpanels>
      </p-tabs>
    </div>`,
  };
})();
