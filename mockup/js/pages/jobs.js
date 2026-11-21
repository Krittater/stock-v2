// หน้าโครงการ / งาน: ตาราง + แผงขวา (≤1279px เป็น p-drawer ล่าง) · dialog เพิ่ม/แก้ · ยืนยันปิดงาน · ปิด/ยกเลิกใบเบิก · ส่งออก CSV
(function () {
  const { ref, reactive, computed, watch, nextTick, onBeforeUnmount } = Vue;
  const { state, user, act, route, go, services } = AppState;

  const OPEN_FILL = ['partial', 'waiting', 'ready'];
  const toast = (summary, detail, severity = 'success') => services.toast?.add({ severity, summary, detail, life: 4000 });
  const dateTh = (v) => (v ? new Date(v.length === 10 ? v + 'T00:00:00' : v).toLocaleDateString('th-TH', { dateStyle: 'medium' }) : '-');
  const when = (at) => new Date(at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  const prName = (id) => state.products.find((p) => p.id === id)?.name || id;
  const unitOf = (id) => state.products.find((p) => p.id === id)?.unit;
  const fmt = (n, unit) => Domain.formatQty(n ?? 0, unit);
  const userName = (id) => state.users.find((u) => u.id === id)?.name || (id ? id : '-');
  const canClose = (d) => d.status === 'posted' && OPEN_FILL.includes(d.fill);
  const canCancel = (d) => d.status === 'pending' || (canClose(d) && !d.lines.some((l) => (l.issued || 0) > 0));

  // ---------- แผงรายละเอียดงาน (ใช้ทั้งแผงขวาและ drawer) ----------
  const JobPanel = {
    props: { job: Object, hl: String },
    emits: ['edit', 'close', 'reopen', 'clone', 'export', 'req'],
    setup(props) {
      const usage = computed(() => Domain.jobUsage(state, props.job.id));
      const docs = computed(() => state.docs.filter((d) => d.type === 'issue' && d.jobId === props.job.id).sort((a, b) => b.at.localeCompare(a.at)));
      const history = computed(() => Domain.jobHistory(state, props.job.id));
      // ปิด/ยกเลิกโดยใคร เมื่อไร (จาก audit ของใบเบิก)
      const byWho = (d) => {
        const a = Domain.auditFor(state, d.id).filter((x) => x.action === 'issue.close' || x.action === 'issue.cancel').pop();
        return a ? (a.action === 'issue.close' ? 'ปิดโดย ' : 'ยกเลิกโดย ') + userName(a.by) + ' · ' + when(a.at) : '';
      };
      return { byWho, usage, docs, history, prName, unitOf, fmt, dateTh, when, userName, canClose, canCancel, docStatus: (d) => UI.docStatus(d), user };
    },
    template: `<div class="jb-detail">
      <div class="jb-head">
        <div class="min-w-0">
          <span class="doc-id">{{ job.id }}</span>
          <h2 class="jb-title">{{ job.name }}</h2>
          <p class="muted jb-meta">{{ job.customer || 'ไม่ระบุลูกค้า' }}<template v-if="job.site"> · {{ job.site }}</template> · ผู้รับผิดชอบ {{ userName(job.ownerId) }}</p>
        </div>
        <span class="status-tag" :class="job.open ? 'tone-green' : 'tone-gray'"><span class="dot" aria-hidden="true"></span>{{ job.open ? 'เปิดอยู่' : 'ปิดแล้ว' }}</span>
      </div>
      <p v-if="!job.open && job.closedAt" class="muted jb-meta">ปิดงานเมื่อ {{ dateTh(job.closedAt) }}</p>
      <p v-if="job.note" class="jb-note">หมายเหตุ: {{ job.note }}</p>

      <div class="jb-acts">
        <p-button v-if="job.open" label="ปิดงาน" icon="pi pi-check-circle" @click="$emit('close')" />
        <p-button v-else label="เปิดงานอีกครั้ง" icon="pi pi-replay" @click="$emit('reopen')" />
        <p-button label="แก้ไข" icon="pi pi-pencil" severity="secondary" outlined @click="$emit('edit')" />
        <p-button label="ส่งออก Excel" icon="pi pi-file-excel" severity="secondary" outlined @click="$emit('export')" />
        <p-button label="เปิดงานใหม่จากงานนี้" icon="pi pi-copy" severity="secondary" outlined @click="$emit('clone')" />
      </div>

      <h3 class="rt-h3">ยอดใช้ของงานนี้</h3>
      <p v-if="!usage.length" class="muted jb-empty">ยังไม่มีการเบิกของ</p>
      <div v-else class="jb-scroll">
        <table class="jb-usage">
          <thead><tr><th>สินค้า</th><th class="n">เบิก</th><th class="n">คืน</th><th class="n">ใช้จริง</th></tr></thead>
          <tbody>
            <tr v-for="u in usage" :key="u.productId">
              <td>{{ prName(u.productId) }}</td>
              <td class="n num">{{ fmt(u.issued, unitOf(u.productId)) }}</td>
              <td class="n num">{{ fmt(u.returned, unitOf(u.productId)) }}</td>
              <td class="n num"><strong>{{ fmt(u.used, unitOf(u.productId)) }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 class="rt-h3">ใบเบิกของงานนี้</h3>
      <p v-if="!docs.length" class="muted jb-empty">ยังไม่มีใบเบิก</p>
      <ul v-else class="jb-docs">
        <li v-for="d in docs" :key="d.id" :id="'rq-' + d.id" tabindex="-1" :class="{ 'jb-hl': hl === d.id }">
          <div class="jb-doc-main">
            <doc-id :id="d.id" /> <span class="muted">{{ when(d.at) }}</span>
            <span class="status-tag" :class="docStatus(d)[1]"><span class="dot" aria-hidden="true"></span>{{ docStatus(d)[0] }}</span>
          </div>
          <div v-if="byWho(d)" class="muted jb-meta">{{ byWho(d) }}</div>
          <div v-if="canClose(d) || canCancel(d)" class="jb-doc-acts">
            <p-button v-if="canClose(d)" label="ปิดใบเบิก" size="small" severity="secondary" outlined @click="$emit('req', d, 'close')" />
            <p-button v-if="canCancel(d)" label="ยกเลิก" size="small" severity="danger" outlined @click="$emit('req', d, 'cancel')" />
          </div>
        </li>
      </ul>

      <h3 class="rt-h3">ประวัติ</h3>
      <p v-if="!history.length" class="muted jb-empty">ยังไม่มีประวัติ</p>
      <ul v-else class="pd-hist-list">
        <li v-for="(h, i) in history" :key="i"><span class="muted pd-hist-meta">{{ when(h.at) }} · {{ userName(h.by) }}</span><span>{{ h.text }}</span></li>
      </ul>
    </div>`,
  };

  window.Pages.jobs = {
    components: { JobPanel },
    setup() {
      const tab = ref('open');
      const text = ref('');
      const first = ref(0);
      const selId = ref(null);
      const drawerOpen = ref(false);
      const hl = ref('');
      const mq = window.matchMedia('(max-width: 1279.98px)');
      const isMobile = ref(mq.matches);
      const onMq = () => { isMobile.value = mq.matches; };
      mq.addEventListener('change', onMq);
      let hlTimer;
      onBeforeUnmount(() => { mq.removeEventListener('change', onMq); clearTimeout(hlTimer); });

      const job = computed(() => state.jobs.find((j) => j.id === selId.value) || null);
      const select = (id) => {
        const j = state.jobs.find((x) => x.id === id);
        if (!j) return;
        if ((j.open && tab.value === 'closed') || (!j.open && tab.value === 'open')) tab.value = 'all';
        selId.value = id; drawerOpen.value = true;
      };
      watch(() => route.query.id, (id) => { if (id) select(id); }, { immediate: true });

      const rows = computed(() => {
        const q = text.value.trim().toLowerCase();
        return state.jobs
          .filter((j) => tab.value === 'all' || (tab.value === 'open') === !!j.open)
          .filter((j) => !q || [j.id, j.name, j.customer, j.site].some((v) => String(v || '').toLowerCase().includes(q)))
          .map((j) => {
            const docs = state.docs.filter((d) => d.type === 'issue' && d.jobId === j.id && d.fill !== 'cancelled');
            return { j, n: docs.length, stuck: Domain.openDocsOf(state, j.id).length };
          })
          .sort((a, b) => b.j.id.localeCompare(a.j.id));
      });
      const count = (k) => state.jobs.filter((j) => k === 'all' || (k === 'open') === !!j.open).length;
      watch([tab, text], () => { first.value = 0; });
      const onScan = ({ id }) => { text.value = ''; select(id); };

      // ---------- เพิ่ม / แก้ไข ----------
      const form = reactive({ open: false, id: null, name: '', customer: '', site: '', ownerId: null, start: '', due: '', note: '' });
      const openAdd = () => Object.assign(form, { open: true, id: null, name: '', customer: '', site: '', ownerId: user.value.id, start: Domain.today(), due: '', note: '' });
      const openEdit = () => {
        const j = job.value;
        Object.assign(form, { open: true, id: j.id, name: j.name, customer: j.customer || '', site: j.site || '', ownerId: j.ownerId || user.value.id, start: j.start || '', due: j.due || '', note: j.note || '' });
      };
      const formCode = computed(() => form.id || Domain.nextJobId(state));
      const dup = computed(() => (form.name.trim() ? state.jobs.find((j) => j.id !== form.id && Domain.norm(j.name) === Domain.norm(form.name)) : null));
      const similar = computed(() => Domain.similarJobs(state, form.name).filter((x) => x.job.id !== form.id));
      const datesBad = computed(() => !!(form.start && form.due && form.due < form.start));
      const formOk = computed(() => form.name.trim() && !dup.value && !datesBad.value);
      const save = () => {
        if (!formOk.value) return;
        const f = { name: form.name, customer: form.customer.trim(), site: form.site.trim(), ownerId: form.ownerId, start: form.start || null, due: form.due || null, note: form.note.trim() };
        if (form.id) {
          const j = act((s, u) => Domain.updateJob(s, form.id, f, u));
          if (j) { form.open = false; toast('แก้ไขงานแล้ว', `${j.id} ${j.name}`); }
        } else {
          const j = act((s, u) => Domain.addJob(s, f, u));
          if (j) { form.open = false; toast('เปิดงานแล้ว', `${j.id} ${j.name} — เลือกใช้ในใบเบิกได้ทันที`); select(j.id); }
        }
      };

      // ---------- ปิดงาน / เปิดอีกครั้ง / คัดลอก ----------
      const cl = reactive({ open: false, cancel: true });
      const chk = computed(() => (cl.open && job.value ? Domain.closeJobCheck(state, job.value.id) : { openDocs: [], unreturned: [], openPRs: [] }));
      const openClose = () => { cl.cancel = true; cl.open = true; };
      const confirmClose = () => {
        const r = act((s, u) => Domain.closeJob(s, job.value.id, u, { cancelPRs: cl.cancel }));
        if (r) {
          cl.open = false;
          toast('ปิดงานแล้ว', 'เบิกเพิ่มไม่ได้ แต่ยังคืนของอ้างอิงใบเบิกเดิมได้' + (r.cancelledPRs.length ? ` · ยกเลิกรายการต้องซื้อ ${r.cancelledPRs.length} รายการ` : ''));
        }
      };
      const gotoDoc = (id) => {
        cl.open = false; hl.value = id; clearTimeout(hlTimer); hlTimer = setTimeout(() => { hl.value = ''; }, 3500);
        nextTick(() => setTimeout(() => { const el = document.getElementById('rq-' + id); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); } }, 150));
      };
      const reopen = () => { if (act((s, u) => Domain.reopenJob(s, job.value.id, u))) toast('เปิดงานอีกครั้งแล้ว', `${job.value.id} ${job.value.name}`); };
      const clone = () => {
        const j = act((s, u) => Domain.cloneJob(s, job.value.id, u));
        if (j) { toast('เปิดงานใหม่แล้ว', `${j.id} ${j.name}`); select(j.id); }
      };

      // ---------- ปิด/ยกเลิกใบเบิก ----------
      const rq = reactive({ open: false, doc: null, kind: 'close', cancel: true });
      const openReq = (doc, kind) => Object.assign(rq, { open: true, doc, kind, cancel: true });
      const rqPRs = computed(() => (rq.doc ? Domain.openPRsOf(state, [rq.doc]).length : 0));
      const confirmReq = () => {
        const fn = rq.kind === 'close' ? Domain.closeIssue : Domain.cancelIssue;
        const r = act((s, u) => fn(s, rq.doc.id, u, { cancelPRs: rq.cancel }));
        if (r) {
          rq.open = false;
          toast(rq.kind === 'close' ? 'ปิดใบเบิกแล้ว' : 'ยกเลิกใบเบิกแล้ว', r.doc.id + (r.cancelledPRs.length ? ` · ยกเลิกรายการต้องซื้อ ${r.cancelledPRs.length} รายการ` : ''));
        }
      };

      // ---------- ส่งออก CSV (UTF-8 + BOM) ----------
      const exportCsv = () => {
        const j = job.value;
        const url = URL.createObjectURL(new Blob([Domain.jobUsageCsv(state, j.id)], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = `${j.id}-usage.csv`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('ส่งออกแล้ว', `${j.id}-usage.csv`);
      };

      return {
        state, user, tab, text, first, selId, job, drawerOpen, isMobile, hl, rows, count, select, onScan, dateTh, userName,
        form, openAdd, openEdit, formCode, dup, similar, datesBad, formOk, save,
        cl, chk, openClose, confirmClose, gotoDoc, reopen, clone, rq, rqPRs, openReq, confirmReq, exportCsv, prName, unitOf, fmt,
      };
    },
    template: `<div class="jobs-page">
      <page-header icon="pi-briefcase" title="โครงการ / งาน" subtitle="งานที่เบิกของเข้า ดูยอดใช้ ปิดงานเมื่อเสร็จ">
        <p-button label="+ เพิ่มงาน" @click="openAdd" />
      </page-header>

      <div class="jb-layout">
        <section class="card jb-main" aria-label="รายการงาน">
          <div class="rt-tools">
            <p-iconfield class="rt-search">
              <p-inputicon class="pi pi-search" />
              <p-inputtext v-model="text" type="search" placeholder="ค้นหารหัส ชื่องาน ลูกค้า หรือไซต์" aria-label="ค้นหางาน" fluid />
            </p-iconfield>
            <scan-button :kinds="['job']" @found="onScan" />
          </div>
          <div class="pp-chips" role="group" aria-label="กรองสถานะงาน">
            <button v-for="t in [['open', 'เปิดอยู่'], ['closed', 'ปิดแล้ว'], ['all', 'ทั้งหมด']]" :key="t[0]" type="button" class="pp-chip" :aria-pressed="tab === t[0]" @click="tab = t[0]">
              {{ t[1] }} ({{ count(t[0]) }})
            </button>
          </div>
          <p-datatable :value="rows" dataKey="j.id" paginator :rows="15" v-model:first="first" class="jb-table" rowHover
            :rowClass="(r) => r.j.id === selId ? 'jb-sel' : ''" @row-click="select($event.data.j.id)">
            <p-column header="รหัส"><template #body="{ data }"><doc-id :id="data.j.id" /></template></p-column>
            <p-column header="ชื่องาน" bodyClass="c-name">
              <template #body="{ data }"><button type="button" class="doc-link jb-name" :aria-label="'ดูงาน ' + data.j.id + ' ' + data.j.name" @click.stop="select(data.j.id)">{{ data.j.name }}</button>
                <span class="jb-mline"><span class="status-tag" :class="data.j.open ? 'tone-green' : 'tone-gray'"><span class="dot" aria-hidden="true"></span>{{ data.j.open ? 'เปิดอยู่' : 'ปิดแล้ว' }}</span>
                  <span v-if="data.stuck" class="jb-stuck">ใบเบิก {{ data.n }} ({{ data.stuck }} ค้าง)</span></span></template>
            </p-column>
            <p-column header="ลูกค้า"><template #body="{ data }">{{ data.j.customer || '-' }}</template></p-column>
            <p-column header="ไซต์"><template #body="{ data }">{{ data.j.site || '-' }}</template></p-column>
            <p-column header="ผู้รับผิดชอบ"><template #body="{ data }">{{ userName(data.j.ownerId) }}</template></p-column>
            <p-column header="ใบเบิก" headerClass="jb-dcol" bodyClass="jb-dcol">
              <template #body="{ data }"><span class="num">{{ data.n }}</span><template v-if="data.stuck"> <span class="jb-stuck">({{ data.stuck }} ค้าง)</span></template></template>
            </p-column>
            <p-column header="กำหนดเสร็จ"><template #body="{ data }">{{ dateTh(data.j.due) }}</template></p-column>
            <p-column header="สถานะ" headerClass="jb-dcol" bodyClass="jb-dcol">
              <template #body="{ data }"><span class="status-tag" :class="data.j.open ? 'tone-green' : 'tone-gray'"><span class="dot" aria-hidden="true"></span>{{ data.j.open ? 'เปิดอยู่' : 'ปิดแล้ว' }}</span></template>
            </p-column>
            <template #empty><div class="table-empty"><p>ไม่มีงาน</p></div></template>
          </p-datatable>
        </section>

        <aside v-if="!isMobile" class="card jb-panel" aria-label="รายละเอียดงาน">
          <job-panel v-if="job" :job="job" :hl="hl" @edit="openEdit" @close="openClose" @reopen="reopen" @clone="clone" @export="exportCsv" @req="openReq" />
          <p v-else class="muted jb-pick">เลือกงานจากตารางเพื่อดูยอดใช้ ใบเบิก และประวัติ</p>
        </aside>
      </div>

      <p-drawer v-if="isMobile" v-model:visible="drawerOpen" position="bottom" header="รายละเอียดงาน" class="jb-drawer">
        <job-panel v-if="job" :job="job" :hl="hl" @edit="openEdit" @close="openClose" @reopen="reopen" @clone="clone" @export="exportCsv" @req="openReq" />
      </p-drawer>

      <p-dialog v-model:visible="form.open" :header="form.id ? 'แก้ไขงาน' : 'เพิ่มงาน'" modal dismissableMask class="jb-form-dialog" :draggable="false">
        <form class="pd-form" @submit.prevent="save">
          <p class="jb-code">รหัสงาน <doc-id :id="formCode" /><span v-if="!form.id" class="muted"> (ระบบออกให้เมื่อบันทึก)</span></p>
          <div class="field">
            <label for="jf-name">ชื่องาน <span class="req">*</span></label>
            <p-inputtext id="jf-name" v-model="form.name" placeholder="เช่น ติดตั้งแอร์ ห้องประชุม" autocomplete="off" :invalid="!!dup" fluid />
            <small v-if="dup" class="jb-err" role="alert">มีงานชื่อนี้แล้ว: {{ dup.id }}</small>
            <p-message v-if="similar.length" severity="warn" class="pd-msg">
              <div class="jb-sim">
                <strong>มีงานชื่อคล้ายกัน ตรวจสอบก่อนเปิดซ้ำ</strong>
                <ul><li v-for="x in similar" :key="x.job.id"><span class="doc-id">{{ x.job.id }}</span> {{ x.job.name }} · {{ x.job.open ? 'เปิดอยู่' : 'ปิดแล้ว' }}</li></ul>
              </div>
            </p-message>
          </div>
          <div class="field"><label for="jf-cust">ลูกค้า / หน่วยงาน</label><p-inputtext id="jf-cust" v-model="form.customer" placeholder="เช่น ภายในบริษัท" fluid /></div>
          <div class="field"><label for="jf-site">สถานที่ / ไซต์</label><p-inputtext id="jf-site" v-model="form.site" placeholder="เช่น มาบตาพุด ระยอง" fluid /></div>
          <div class="field"><label id="jf-own-l">ผู้รับผิดชอบ</label><p-select v-model="form.ownerId" :options="state.users" optionLabel="name" optionValue="id" ariaLabelledby="jf-own-l" fluid /></div>
          <div class="jb-dates">
            <div class="field"><label for="jf-start">วันเริ่ม</label><input id="jf-start" v-model="form.start" type="date" class="p-inputtext jb-date"></div>
            <div class="field"><label for="jf-due">กำหนดเสร็จ</label><input id="jf-due" v-model="form.due" type="date" class="p-inputtext jb-date"></div>
          </div>
          <small v-if="datesBad" class="jb-err" role="alert">กำหนดเสร็จต้องไม่ก่อนวันเริ่ม</small>
          <div class="field"><label for="jf-note">หมายเหตุ</label><p-textarea id="jf-note" v-model="form.note" rows="2" autoResize fluid /></div>
        </form>
        <template #footer>
          <p v-if="!form.name.trim()" class="pd-missing">ยังขาด: ชื่องาน</p>
          <p-button label="ยกเลิก" severity="secondary" outlined @click="form.open = false" />
          <p-button label="บันทึก" icon="pi pi-check" :disabled="!formOk" @click="save" />
        </template>
      </p-dialog>

      <p-dialog v-model:visible="cl.open" header="ปิดงาน" modal class="jb-close-dialog" :draggable="false">
        <template v-if="job">
          <p class="jb-close-t"><span class="doc-id">{{ job.id }}</span> {{ job.name }}</p>
          <p v-if="chk.openDocs.length" class="jb-err" role="alert">
            ยังมีใบเบิกที่ไม่ปิด
            <template v-for="(d, i) in chk.openDocs" :key="d.id"><template v-if="i">, </template><button type="button" class="doc-link jb-reqlink" @click="gotoDoc(d.id)">{{ d.id }}</button></template>
            — ปิดหรือยกเลิกก่อนปิดงาน
          </p>
          <h3 class="rt-h3">ของที่ยังไม่คืน</h3>
          <p v-if="!chk.unreturned.length" class="muted jb-empty">ไม่มีของค้างคืน</p>
          <template v-else>
            <p class="muted jb-empty">ปิดงานได้ และยังคืนของอ้างอิงใบเบิกเดิมได้ภายหลัง ({{ chk.unreturned.length }} รายการ)</p>
            <div class="jb-scroll">
              <table class="jb-usage">
                <thead><tr><th>สินค้า</th><th>ใบเบิก</th><th class="n">ยังไม่คืน</th></tr></thead>
                <tbody><tr v-for="(x, i) in chk.unreturned" :key="i"><td>{{ prName(x.productId) }}</td><td><span class="doc-id">{{ x.docId }}</span></td><td class="n num">{{ fmt(x.left, unitOf(x.productId)) }}</td></tr></tbody>
              </table>
            </div>
          </template>
          <label v-if="chk.openPRs.length" class="rt-check" for="cl-pr">
            <p-checkbox v-model="cl.cancel" inputId="cl-pr" binary />
            <span>ยกเลิกรายการต้องซื้อที่ยังไม่ได้รับของ ({{ chk.openPRs.length }} รายการ)</span>
          </label>
        </template>
        <template #footer>
          <p-button label="ไม่ปิด" severity="secondary" outlined @click="cl.open = false" />
          <p-button label="ยืนยันปิดงาน" icon="pi pi-check-circle" :disabled="chk.openDocs.length > 0" @click="confirmClose" />
        </template>
      </p-dialog>

      <p-dialog v-model:visible="rq.open" :header="rq.kind === 'close' ? 'ปิดใบเบิก' : 'ยกเลิกใบเบิก'" modal class="jb-req-dialog" :draggable="false">
        <template v-if="rq.doc">
          <p class="jb-close-t"><doc-id :id="rq.doc.id" /></p>
          <p class="muted jb-empty">{{ rq.kind === 'close' ? 'ปิดแล้วจะปล่อยของที่กันไว้คืน และไม่รอของเข้าอีก' : 'ยกเลิกใบเบิกที่ยังไม่ได้จ่ายของ' }}</p>
          <label v-if="rqPRs" class="rt-check" for="rq-pr">
            <p-checkbox v-model="rq.cancel" inputId="rq-pr" binary />
            <span>ยกเลิกรายการต้องซื้อที่ยังไม่ได้รับของ ({{ rqPRs }} รายการ)</span>
          </label>
        </template>
        <template #footer>
          <p-button label="ไม่ทำ" severity="secondary" outlined @click="rq.open = false" />
          <p-button :label="rq.kind === 'close' ? 'ปิดใบเบิก' : 'ยกเลิกใบเบิก'" :severity="rq.kind === 'close' ? undefined : 'danger'" @click="confirmReq" />
        </template>
      </p-dialog>
    </div>`,
  };
})();
