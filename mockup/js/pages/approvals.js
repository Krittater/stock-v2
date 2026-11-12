// อนุมัติใบเบิก: การ์ดต่อใบที่ pending — อนุมัติ/ไม่อนุมัติเฉพาะหัวหน้า
(function () {
  const { computed } = Vue;
  const { state, user, act, services } = AppState;

  const DONE = {
    full: (id) => `อนุมัติ ${id} แล้ว จ่ายของครบ`,
    partial: (id) => `อนุมัติ ${id} แล้ว จ่ายบางส่วน ที่ขาดรอของเข้า`,
    waiting: (id) => `อนุมัติ ${id} แล้ว ยังไม่มีของ รอของเข้า`,
    rejected: (id) => `ไม่อนุมัติ ${id} แล้ว`,
  };

  window.Pages.approvals = {
    setup() {
      const isHead = computed(() => user.value.role === 'head');
      const byId = computed(() => new Map(state.products.map((p) => [p.id, p])));
      const nameOf = (id) => state.users.find((u) => u.id === id)?.name || id;
      const whName = (id) => state.warehouses.find((w) => w.id === id)?.name || '-';
      const jobName = (id) => { const j = state.jobs.find((x) => x.id === id); return j ? `${j.id} ${j.name}` : '-'; };
      const when = (at) => new Date(at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
      const cards = computed(() => state.docs
        .filter((d) => d.type === 'issue' && d.status === 'pending')
        .sort((a, b) => a.at.localeCompare(b.at))
        .map((d) => ({
          d,
          counting: !!state.warehouses.find((w) => w.id === d.whId)?.countId,
          lines: d.lines.map((l) => {
            const have = Domain.qtyOf(state, l.productId, d.whId);
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
      return { isHead, cards, nameOf, whName, jobName, when, decide, reject, Domain };
    },
    template: `<div class="approvals-page">
      <page-header icon="pi-file-check" title="อนุมัติใบเบิก" :subtitle="cards.length + ' ใบรออนุมัติ'" />
      <p v-if="!isHead" class="approve-banner" role="status"><i class="pi pi-lock" aria-hidden="true"></i> เฉพาะหัวหน้าอนุมัติได้ — สลับบทบาทที่การ์ดผู้ใช้ล่างซ้าย</p>
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
          <li v-for="x in c.lines" :key="x.l.productId">
            <product-thumb :product="x.p" :size="44" />
            <span class="appr-name">{{ x.p ? x.p.name : x.l.productId }}</span>
            <span class="appr-qty">ขอเบิก <qty :n="x.l.qty" :unit="x.p && x.p.unit" /></span>
            <span class="appr-qty">มีในคลังนี้ <qty :n="x.have" :unit="x.p && x.p.unit" /></span>
            <span v-if="x.short" class="status-tag tone-orange"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i>ขาด {{ Domain.formatQty(x.short) }}</span>
          </li>
        </ul>
      </article>
    </div>`,
  };
})();
