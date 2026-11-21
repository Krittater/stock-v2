// หน้าตรวจนับ: รายการรอบนับ · เปิดรอบใหม่ (ล็อกคลัง) · กรอกยอดนับ · ปิดรอบ/ยกเลิก
(function () {
  const { ref, reactive, computed, watch, onBeforeUnmount } = Vue;
  const { state, user, act, route, go, services } = AppState;
  const fmt = (n, unit) => Domain.formatQty(n ?? 0, unit);
  const STATUS = { open: ['กำลังนับ', 'tone-yellow'], closed: ['ปิดแล้ว', 'tone-green'], cancelled: ['ยกเลิก', 'tone-gray'] };

  window.Pages.count = {
    setup() {
      const isEng = computed(() => user.value.role === 'engineer');
      const whName = (id) => state.warehouses.find((w) => w.id === id)?.name || '-';
      const byId = computed(() => new Map(state.products.map((p) => [p.id, p])));
      const catLabel = (id) => (id ? Domain.categoryPath(state, id) : 'ทุกหมวด');

      // ---------- รายการรอบ ----------
      const sessions = computed(() => state.counts.slice().reverse().map((c) => ({ c, s: Domain.countSummary(c) })));
      const openCounts = computed(() => state.counts.filter((c) => c.status === 'open'));
      const current = computed(() => {
        const id = route.query.id || (!route.query.list && openCounts.value.length === 1 ? openCounts.value[0].id : '');
        const c = state.counts.find((x) => x.id === id);
        return c && c.status === 'open' ? c : null;
      });
      const summary = computed(() => (current.value ? Domain.countSummary(current.value) : null));
      const pct = computed(() => (summary.value?.total ? Math.round((summary.value.counted / summary.value.total) * 100) : 0));
      const openSession = (c) => go('count', { id: c.id });

      // ---------- เปิดรอบใหม่ ----------
      const dlg = reactive({ open: false, whId: null, categoryId: null });
      const whOpts = computed(() => state.warehouses.map((w) => ({ id: w.id, name: w.name, counting: !!w.countId })));
      const catOpts = computed(() => state.categories.map((c) => ({ id: c.id, label: Domain.categoryPath(state, c.id) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'th')));
      const itemCount = computed(() => {
        if (!dlg.categoryId) return state.products.length;
        const ids = Domain.descendantIds(state, dlg.categoryId);
        return state.products.filter((p) => ids.has(p.categoryId)).length;
      });
      const openDlg = () => {
        dlg.whId = (state.warehouses.find((w) => !w.countId) || {}).id || null;
        dlg.categoryId = null;
        dlg.open = true;
      };
      const start = () => {
        const c = act((s, u) => Domain.startCount(s, { whId: dlg.whId, categoryId: dlg.categoryId }, u),
          (x) => 'เปิดรอบนับ ' + x.id + ' แล้ว · ' + whName(x.whId) + ' ถูกล็อกระหว่างนับ');
        if (c) { dlg.open = false; go('count', { id: c.id }); }
      };

      // ---------- กรอกยอดนับ ----------
      const qInput = ref('');
      const text = ref('');
      let timer;
      watch(qInput, (v) => { clearTimeout(timer); timer = setTimeout(() => { text.value = v.trim().toLowerCase(); first.value = 0; }, 150); });
      onBeforeUnmount(() => clearTimeout(timer));
      const filter = ref('all');
      const FILTERS = [{ id: 'all', label: 'ทั้งหมด' }, { id: 'todo', label: 'ยังไม่นับ' }, { id: 'diff', label: 'ต่าง' }];
      const first = ref(0);
      watch(filter, () => { first.value = 0; });
      watch(() => current.value?.id, () => { first.value = 0; qInput.value = ''; text.value = ''; filter.value = 'all'; });

      const diffOf = (l) => (l.counted === null ? null : +(l.counted - l.system).toFixed(2));
      const rows = computed(() => {
        const c = current.value;
        if (!c) return [];
        const out = [];
        for (const l of c.lines) {
          const p = byId.value.get(l.productId);
          if (!p) continue;
          if (filter.value === 'todo' && l.counted !== null) continue;
          if (filter.value === 'diff' && !(l.counted !== null && diffOf(l) !== 0)) continue;
          if (text.value && !(p.name.toLowerCase().includes(text.value) || String(p.code).toLowerCase().includes(text.value))) continue;
          out.push({ l, p });
        }
        return out;
      });
      const diffView = (r) => {
        const d = diffOf(r.l);
        if (d === null) return { cls: 'cd-none', text: '—', word: 'ยังไม่นับ' };
        if (d === 0) return { cls: 'cd-eq', text: 'ตรง', word: '' };
        const t = fmt(Math.abs(d), r.p.unit);
        return d > 0 ? { cls: 'cd-plus', text: '+' + t, word: 'เกิน' } : { cls: 'cd-minus', text: '−' + t, word: 'ขาด' };
      };

      // อ่านจากข้อความในช่อง (ไม่มี suffix — หน่วยอยู่นอกช่อง) แล้วตัดเครื่องหมาย , ออก; หลัง commit ซิงก์ช่องกลับด้วย key
      const ver = reactive({});
      const resync = (id) => { ver[id] = (ver[id] || 0) + 1; };
      const commit = (r, e) => {
        const id = r.p.id;
        const raw = String(e.originalEvent.target.value ?? '').replace(/,/g, '').trim();
        const v = raw === '' ? null : Number(raw);
        if (v !== null && !Number.isFinite(v)) services.toast?.add({ severity: 'error', summary: 'ทำรายการไม่สำเร็จ', detail: 'ใส่จำนวนที่นับเป็นตัวเลข', life: 6000 });
        else if (v !== r.l.counted) act((s) => { Domain.setCounted(s, current.value.id, id, v); });
        resync(id);
      };
      const next = (e) => {
        const ins = [...document.querySelectorAll('.count-page .cnt-in input')];
        const i = ins.indexOf(e.target);
        const n = ins[i + 1];
        if (n) { n.focus(); n.select(); } else e.target.blur();
      };

      // ---------- ปิด / ยกเลิก ----------
      const cancelRound = () => services.confirm.require({
        header: 'ยกเลิกรอบนับ ' + current.value.id,
        message: 'ยอดที่นับไว้จะทิ้งทั้งหมด สต็อกไม่เปลี่ยน และคลัง ' + whName(current.value.whId) + ' จะเบิก/รับของได้ตามปกติ',
        icon: 'pi pi-exclamation-triangle',
        rejectProps: { label: 'กลับไปนับต่อ', severity: 'secondary', outlined: true },
        acceptProps: { label: 'ยกเลิกรอบนับ', severity: 'danger' },
        accept: () => {
          const id = current.value.id;
          if (act((s, u) => Domain.cancelCount(s, id, u), 'ยกเลิกรอบนับ ' + id + ' แล้ว')) go('count', { list: 1 });
        },
      });
      const closeRound = () => {
        const sm = summary.value;
        const heldN = user.value.role === 'head' ? 0 : current.value.lines.filter((l) => l.counted !== null && l.counted !== l.system && state.products.find((p) => p.id === l.productId).needsApproval).length;
        services.confirm.require({
          header: 'ปิดรอบนับ ' + current.value.id,
          message: 'จะปรับยอด ' + sm.diffLines + ' รายการให้เท่ากับที่นับ' + (heldN ? ' (ในนี้ ' + heldN + ' รายการเป็นสินค้าต้องอนุมัติ รอหัวหน้ายืนยัน ยอดยังไม่เปลี่ยน)' : '') + ' และปลดล็อกคลัง · บรรทัดที่ยังไม่นับ (' + (sm.total - sm.counted).toLocaleString('en-US') + ' รายการ) จะไม่ถูกปรับ',
          icon: 'pi pi-question-circle',
          rejectProps: { label: 'กลับไปนับต่อ', severity: 'secondary', outlined: true },
          acceptProps: { label: 'ปิดรอบและปรับยอด' },
          accept: () => {
            const id = current.value.id;
            const res = act((s, u) => Domain.closeCount(s, id, u),
              (x) => 'ปิดรอบนับ ' + id + ' แล้ว · ' + (x.adjust ? 'ปรับยอด ' + x.adjust.lines.length + ' รายการ (' + x.adjust.id + ')' : x.pending.length ? '' : 'ไม่มียอดต้องปรับ') + (x.pending.length ? (x.adjust ? ' · ' : '') + 'รอหัวหน้าอนุมัติ ' + x.pending.length + ' รายการ' : ''));
            if (res) go('count', { list: 1 });
          },
        });
      };

      return { state, isEng, whName, catLabel, sessions, current, summary, pct, openSession, dlg, whOpts, catOpts, itemCount, openDlg, start,
        qInput, filter, FILTERS, first, rows, diffView, commit, ver, next, cancelRound, closeRound, STATUS, Domain, go };
    },
    template: `<div class="count-page">
      <page-header icon="pi-list-check" title="ตรวจนับ" subtitle="นับของจริงในคลัง เทียบกับยอดในระบบ แล้วปรับยอดให้ตรง">
        <template v-if="!current">
          <p-button label="เปิดรอบนับใหม่" icon="pi pi-plus" :disabled="isEng" @click="openDlg" />
        </template>
      </page-header>
      <p v-if="isEng && !current" class="muted ct-eng"><i class="pi pi-lock" aria-hidden="true"></i> เฉพาะ Store หรือหัวหน้าเปิดรอบนับได้</p>

      <section v-if="!current" class="card ct-card" aria-labelledby="ct-list-h">
        <div class="card-head"><h2 id="ct-list-h">รอบนับ ({{ sessions.length }})</h2></div>
        <p v-if="!sessions.length" class="muted ct-empty">ยังไม่มีรอบนับ กด "เปิดรอบนับใหม่" เพื่อเริ่ม</p>
        <div v-else class="ct-scroll">
          <table class="ct-sessions">
            <thead><tr><th>รอบนับ</th><th>คลัง</th><th>หมวด</th><th>สถานะ</th><th>นับแล้ว</th><th><span class="sr-only">เปิด</span></th></tr></thead>
            <tbody>
              <tr v-for="x in sessions" :key="x.c.id">
                <td><doc-id :id="x.c.id" /></td>
                <td>{{ whName(x.c.whId) }}</td>
                <td>{{ catLabel(x.c.categoryId) }}</td>
                <td><span class="status-tag" :class="STATUS[x.c.status][1]"><span class="dot" aria-hidden="true"></span>{{ STATUS[x.c.status][0] }}</span></td>
                <td><span class="num">{{ x.s.counted.toLocaleString('en-US') }}/{{ x.s.total.toLocaleString('en-US') }}</span></td>
                <td><p-button v-if="x.c.status === 'open'" label="เปิดนับ" icon="pi pi-arrow-right" iconPos="right" size="small" severity="secondary" outlined
                  :aria-label="'เปิดรอบนับ ' + x.c.id" @click="openSession(x.c)" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <template v-else>
        <section class="card ct-card ct-sum" aria-label="สรุปรอบนับ">
          <div class="ct-sum-top">
            <div class="min-w-0">
              <h2 class="ct-title"><doc-id :id="current.id" /> · {{ whName(current.whId) }}</h2>
              <p class="muted ct-sub">หมวด: {{ catLabel(current.categoryId) }}</p>
            </div>
            <div class="ct-actions">
              <p-button label="กลับไปรายการ" icon="pi pi-list" severity="secondary" text @click="go('count', { list: 1 })" />
              <p-button label="ยกเลิกรอบนับ" icon="pi pi-times" severity="danger" outlined :disabled="isEng" @click="cancelRound" />
              <p-button label="ปิดรอบและปรับยอด" icon="pi pi-check" :disabled="isEng" @click="closeRound" />
            </div>
          </div>
          <p v-if="isEng" class="muted ct-eng"><i class="pi pi-lock" aria-hidden="true"></i> เฉพาะ Store หรือหัวหน้าปิดรอบนับได้</p>
          <div class="ct-prog">
            <p-progressbar :value="pct" :showValue="false" aria-label="ความคืบหน้าการนับ" />
            <div class="ct-stats">
              <span>นับแล้ว <strong class="num">{{ summary.counted.toLocaleString('en-US') }}/{{ summary.total.toLocaleString('en-US') }}</strong> รายการ</span>
              <span>ต่าง <strong class="num">{{ summary.diffLines.toLocaleString('en-US') }}</strong> รายการ</span>
              <span class="cd-plus">เกิน +<span class="num">{{ summary.diffPlus.toLocaleString('en-US') }}</span></span>
              <span class="cd-minus">ขาด −<span class="num">{{ summary.diffMinus.toLocaleString('en-US') }}</span></span>
            </div>
          </div>
        </section>

        <section class="card ct-card" aria-label="รายการนับ">
          <div class="ct-tools">
            <div class="ct-search">
              <i class="pi pi-search" aria-hidden="true"></i>
              <input v-model="qInput" type="search" placeholder="ค้นหาในรอบนี้ ชื่อหรือรหัส..." aria-label="ค้นหาในรอบนับ">
            </div>
            <div class="ct-filters" role="group" aria-label="ตัวกรอง">
              <button v-for="f in FILTERS" :key="f.id" type="button" class="pill" :class="{ active: filter === f.id }" :aria-pressed="filter === f.id" @click="filter = f.id">{{ f.label }}</button>
            </div>
          </div>
          <p-datatable :value="rows" dataKey="p.id" paginator :rows="50" v-model:first="first" class="ct-table">
            <p-column header="สินค้า" bodyClass="ct-prod">
              <template #body="{ data: r }">
                <div class="ct-pcell"><product-thumb :product="r.p" :size="40" /><div class="min-w-0"><div class="ct-pname">{{ r.p.name }}</div><div class="muted ct-pcode">{{ r.p.code }}</div></div></div>
              </template>
            </p-column>
            <p-column header="ในระบบ"><template #body="{ data: r }"><qty :n="r.l.system" :unit="r.p.unit" /></template></p-column>
            <p-column header="นับได้">
              <template #body="{ data: r }">
                <div class="cnt-wrap"><p-inputnumber :key="r.p.id + ':' + (ver[r.p.id] || 0)" :modelValue="r.l.counted" :min="0" :minFractionDigits="0" :maxFractionDigits="2"
                  placeholder="ยังไม่นับ" :useGrouping="true" locale="en-US"
                  :ariaLabel="'จำนวนที่นับได้ ' + r.p.name" class="cnt-in" @blur="commit(r, $event)" @keydown.enter="next" /><span class="cnt-unit">{{ Domain.unitAbbr(r.p.unit) }}</span></div>
              </template>
            </p-column>
            <p-column header="ส่วนต่าง">
              <template #body="{ data: r }">
                <span class="ct-diff" :class="diffView(r).cls"><strong class="num">{{ diffView(r).text }}</strong><span v-if="diffView(r).word"> {{ diffView(r).word }}</span></span>
              </template>
            </p-column>
            <template #empty><p class="muted ct-empty">ไม่พบรายการ</p></template>
          </p-datatable>
        </section>
      </template>

      <p-dialog v-model:visible="dlg.open" header="เปิดรอบนับใหม่" modal :style="{ width: '30rem', maxWidth: '94vw' }">
        <div class="field">
          <label id="ct-wh-l">คลัง <span class="req">*</span></label>
          <p-select v-model="dlg.whId" :options="whOpts" optionLabel="name" optionValue="id" optionDisabled="counting" placeholder="เลือกคลัง" aria-labelledby="ct-wh-l" fluid>
            <template #option="{ option: o }">
              <span class="opt-row"><span>{{ o.name }}</span><span v-if="o.counting" class="status-tag tone-yellow"><span class="dot" aria-hidden="true"></span>กำลังตรวจนับ</span></span>
            </template>
          </p-select>
        </div>
        <div class="field">
          <label id="ct-cat-l">หมวด (ไม่บังคับ)</label>
          <p-select v-model="dlg.categoryId" :options="catOpts" optionLabel="label" optionValue="id" showClear filter placeholder="ทุกหมวด" aria-labelledby="ct-cat-l" fluid />
          <small class="muted">แนะนำให้นับทีละหมวด ถ้าไม่เลือกจะนับทั้ง {{ itemCount.toLocaleString('en-US') }} รายการ</small>
        </div>
        <div class="ct-warn" role="note"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i><span>ระหว่างนับ คลังนี้จะเบิกและรับของไม่ได้</span></div>
        <p v-if="isEng" class="muted ct-eng"><i class="pi pi-lock" aria-hidden="true"></i> เฉพาะ Store หรือหัวหน้าเปิดรอบนับได้</p>
        <template #footer>
          <p-button label="ยกเลิก" severity="secondary" text @click="dlg.open = false" />
          <p-button label="เปิดรอบนับ" icon="pi pi-play" :disabled="isEng || !dlg.whId" @click="start" />
        </template>
      </p-dialog>
    </div>`,
  };
})();
