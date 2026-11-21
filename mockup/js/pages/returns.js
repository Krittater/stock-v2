// หน้าคืนของ: ตารางใบเบิกที่คืนได้ + แผงใบคืน · ชั้นรอตรวจ · คืนล่าสุด (UI อย่างเดียว กติกาอยู่ใน domain/returns.js)
(function () {
  const { ref, reactive, computed, watch, onBeforeUnmount } = Vue;
  const { state, user, act, route, services } = AppState;
  const fmt = (n, unit) => Domain.formatQty(n ?? 0, unit);
  const COND = [{ v: 'ok', label: 'ใช้ได้' }, { v: 'damaged', label: 'เสียหาย' }, { v: 'scrap', label: 'ตัดเป็นของเสีย' }];
  const condLabel = (v) => (COND.find((c) => c.v === v) || {}).label || v;
  const DEFAULT_SHELF = 'ทั่วไป';
  const blank = (q) => q === null || q === undefined || q === '' || Number(q) === 0;
  const toast = (severity, detail, life = 4000) => services.toast?.add({ severity, summary: severity === 'warn' ? 'ทำไม่ได้' : 'ผลลัพธ์', detail, life });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ย่อรูปให้ด้านยาวสุด 320px เป็น JPEG dataURL
  async function shrink(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
      const k = Math.min(1, 320 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    } finally { URL.revokeObjectURL(url); }
  }

  window.Pages.returns = {
    setup() {
      const byId = computed(() => new Map(state.products.map((p) => [p.id, p])));
      const whOf = (id) => state.warehouses.find((w) => w.id === id);
      const whName = (id) => whOf(id)?.name || '-';
      const nameOf = (id) => state.users.find((u) => u.id === id)?.name || id || '-';
      const jobName = (id) => { const j = state.jobs.find((x) => x.id === id); return j ? `${j.id} ${j.name}` : '-'; };
      const when = (at) => new Date(at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
      const date = (at) => new Date(at).toLocaleDateString('th-TH', { dateStyle: 'medium' });
      const isEng = computed(() => user.value.role === 'engineer');
      const isStaff = computed(() => !isEng.value);
      const isHead = computed(() => user.value.role === 'head');
      const shelfLabel = (whId, code) => (Domain.qcCodes(state, whId).includes(code) ? 'ชั้นรอตรวจ' : code);

      const tab = ref('return');
      const text = ref('');
      const docFilter = ref('');
      const first = ref(0);
      watch([text, docFilter], () => { first.value = 0; });

      // ---------- ใบเบิกที่คืนได้ ----------
      const docsAll = computed(() => Domain.returnable(state, user.value));
      // กรองจาก docsAll (ไม่เรียก returnable ซ้ำ) ด้วยกติกาเดียวกับ Domain.returnable: เลขใบ ชื่องาน ชื่อ/ยี่ห้อ/รุ่นสินค้า
      const docsShown = computed(() => {
        const n = text.value.trim().toLowerCase();
        if (!n) return docsAll.value;
        return docsAll.value.filter((x) => {
          const job = state.jobs.find((j) => j.id === x.doc.jobId);
          return [x.doc.id, job && job.name, ...x.lines.map((l) => { const p = byId.value.get(l.productId); return p ? [p.name, p.brand, p.model].join(' ') : ''; })]
            .some((h) => (h || '').toLowerCase().includes(n));
        });
      });
      const flat = (docs) => docs.flatMap((x) => x.lines.map((line) => ({
        key: x.doc.id + '|' + line.productId, doc: x.doc, by: x.by, line, p: byId.value.get(line.productId),
      }))).filter((r) => r.p);
      const rowsAll = computed(() => flat(docsAll.value));
      const rows = computed(() => flat(docsShown.value).filter((r) => !docFilter.value || r.doc.id === docFilter.value));
      const docOpts = computed(() => docsAll.value.map((x) => ({
        id: x.doc.id, label: `${x.doc.id} · ${x.doc.jobId ? jobName(x.doc.jobId) : 'ไม่ระบุงาน'}${isStaff.value ? ' · ' + (x.by?.name || '') : ''}`,
      })));
      const docCur = computed(() => docsAll.value.find((x) => x.doc.id === docFilter.value) || null);

      // ?doc= กรองให้ครั้งเดียวต่อค่าใน URL และต้องเป็นใบที่ผู้ใช้คนนี้คืนได้เท่านั้น
      const applyDoc = (id) => { if (id && docsAll.value.some((x) => x.doc.id === id)) docFilter.value = id; };
      applyDoc(route.query.doc);
      watch(() => route.query.doc, applyDoc);
      // สลับบทบาท: ล้างสิ่งที่กรอก + ตัวกรองที่ไม่ใช่ของผู้ใช้นี้ (ไม่ใช้ ?doc= ซ้ำ)
      watch(() => user.value.id, () => { clearAll(); if (tab.value === 'qc' && isEng.value) tab.value = 'return'; if (!docOpts.value.some((o) => o.id === docFilter.value)) docFilter.value = ''; });
      watch(docOpts, (o) => { if (docFilter.value && !o.some((x) => x.id === docFilter.value)) docFilter.value = ''; });

      // ---------- ที่กรอก (ต่อแถว) ----------
      const st = reactive({}); // key → { qty, condition, rollId, shelf, photo }
      const revs = reactive({}); // ต่อแถว: บังคับ mount ช่องจำนวนใหม่เฉพาะแถวที่ถูกปฏิเสธ
      const ent = (r) => st[r.key] || { qty: null, condition: 'ok' };
      const patch = (r, o) => { st[r.key] = { qty: null, condition: 'ok', ...st[r.key], ...o }; };
      function clearAll() { for (const k of Object.keys(st)) delete st[k]; }
      const activeDocId = computed(() => { const r = rowsAll.value.find((x) => !blank(ent(x).qty)); return r ? r.doc.id : ''; });
      watch(docFilter, (id) => { if (activeDocId.value && id && id !== activeDocId.value) clearAll(); }); // เปลี่ยนใบ = ทิ้งที่กรอก/รูป (RT-AC9)

      const setQty = (r, v) => {
        if (!blank(v) && activeDocId.value && activeDocId.value !== r.doc.id) { toast('warn', 'คืนได้ทีละใบเบิก'); revs[r.key] = (revs[r.key] || 0) + 1; return; }
        patch(r, { qty: v });
      };
      const setCond = (r, v) => patch(r, v === 'damaged' ? { condition: v } : { condition: v, photo: null });
      const returnAll = () => {
        if (!docCur.value) return;
        if (activeDocId.value && activeDocId.value !== docCur.value.doc.id) clearAll();
        for (const r of rows.value) if (r.doc.id === docCur.value.doc.id) patch(r, { qty: r.line.left });
      };

      const rowErr = (r, e) => {
        const q = Number(e.qty), unit = r.p.unit, left = r.line.left;
        try { Domain.validateQty(q, unit); } catch (x) {
          if (!(unit !== 'เมตร' && !Number.isInteger(left) && q === left)) return x.message; // ข้อมูลเก่าที่ค้างทศนิยม คืนทั้งหมดได้
        }
        return q > left + 1e-9 ? `คืนได้ไม่เกิน ${fmt(left, unit)}` : '';
      };
      const errOf = (r) => { const e = ent(r); return blank(e.qty) ? '' : rowErr(r, e); };

      // ---------- แผงใบคืน ----------
      const items = computed(() => rowsAll.value.filter((r) => !blank(ent(r).qty)).map((r) => {
        const e = ent(r), q = Number(e.qty), err = rowErr(r, e);
        const rollId = r.p.isRoll ? e.rollId || r.line.cuts[0] || null : null;
        const hint = !err && r.p.isRoll && e.condition !== 'scrap' ? Domain.returnHint(state, r.p.id, q) : null;
        return { r, e, q, err, rollId, hint };
      }));
      const goodItems = computed(() => items.value.filter((i) => !i.err));
      const ctxDoc = computed(() => { const id = activeDocId.value || docFilter.value; return id ? state.docs.find((d) => d.id === id) : null; });

      // RT-AC8: คลังเริ่มต้น = คลังของใบ ถ้าเปิดใช้และไม่ถูกล็อกนับ ไม่งั้นว่าง
      const whOpts = computed(() => state.warehouses.filter((w) => w.active !== false).map((w) => ({ id: w.id, name: w.name, disabled: !!w.countId, counting: !!w.countId })));
      const defaultWh = computed(() => { const w = ctxDoc.value && whOf(ctxDoc.value.whId); return w && w.active !== false && !w.countId ? w.id : null; });
      const whSel = ref(null);
      watch(() => ctxDoc.value?.id, () => { whSel.value = null; });
      const whId = computed(() => whSel.value || defaultWh.value);
      const whNote = computed(() => {
        const w = ctxDoc.value && whOf(ctxDoc.value.whId);
        if (!w || defaultWh.value) return '';
        return w.active === false ? `${w.name} ปิดใช้งานอยู่ เลือกคลังอื่นก่อน` : `${w.name} ถูกล็อกเพื่อตรวจนับ เลือกคลังอื่นก่อน`;
      });
      const shelfOpts = computed(() => (whId.value ? Domain.shelves(state, whId.value) : []));
      watch(whId, () => { for (const k of Object.keys(st)) if (st[k].shelf) st[k].shelf = null; }); // ชั้นรายแถวของคลังเดิมใช้ไม่ได้
      const shelf = ref(DEFAULT_SHELF);
      watch(shelfOpts, (o) => { if (o.length && !o.includes(shelf.value)) shelf.value = o.includes(DEFAULT_SHELF) ? DEFAULT_SHELF : o[0]; });
      const hasQc = computed(() => !!(whId.value && Domain.qcShelf(state, whId.value)));
      const split = ref(false);
      const note = ref('');
      const hasDamaged = computed(() => goodItems.value.some((i) => i.e.condition === 'damaged'));
      const damagedItems = computed(() => items.value.filter((i) => i.e.condition === 'damaged' && !i.err));

      const photoBusy = ref(0);
      async function onPhoto(r, ev) {
        const f = ev.files && ev.files[0];
        if (!f) return;
        photoBusy.value++;
        try {
          const d = await shrink(f);
          if (ent(r).condition === 'damaged') patch(r, { photo: d });
        } catch (e) { toast('error', 'อ่านรูปไม่ได้ ลองรูปอื่น'); } finally { photoBusy.value--; }
      }

      const missing = computed(() => {
        const m = [];
        if (!items.value.length) m.push('จำนวนที่จะคืน');
        else if (items.value.some((i) => i.err)) m.push('แก้จำนวนที่ผิด');
        if (!whId.value) m.push(whNote.value ? 'คลัง (' + whNote.value + ')' : 'คลังที่จะคืนเข้า');
        else if (!shelfOpts.value.length) m.push('คลังที่มีชั้นวาง');
        else if (hasDamaged.value && !hasQc.value) m.push('คลังที่มีชั้นรอตรวจ');
        if (photoBusy.value) m.push('รอบันทึกรูปให้เสร็จ');
        return m;
      });

      const setScrap = (r) => patch(r, { condition: 'scrap', photo: null });
      const result = ref(null);
      const busy = ref(false);
      const submit = () => {
        if (missing.value.length) return;
        busy.value = true;
        const docId = activeDocId.value;
        const rec = act((s, u) => Domain.returnItems(s, {
          docId, whId: whId.value, shelf: shelf.value, note: note.value,
          lines: goodItems.value.map((i) => ({
            productId: i.r.p.id, qty: i.q, condition: i.e.condition, rollId: i.rollId || undefined,
            shelf: split.value && i.e.condition === 'ok' ? i.e.shelf || shelf.value : undefined, photo: i.e.photo || undefined,
          })),
        }, u), 'บันทึกคืนของแล้ว');
        busy.value = false;
        if (rec) { result.value = rec; clearAll(); note.value = ''; whSel.value = null; sheetOpen.value = false; }
      };

      const sheetOpen = ref(false);

      // ---------- สแกน ----------
      const onScan = ({ kind, id }) => {
        if (kind === 'req') {
          if (docOpts.value.some((o) => o.id === id)) docFilter.value = id; else toast('warn', 'ใบเบิกนี้คืนของไม่ได้ (ไม่มีของค้างคืน หรือไม่ใช่ใบของคุณ)');
        } else {
          const hit = docsAll.value.find((x) => x.lines.some((l) => l.cuts.includes(id))); // ใหม่สุดก่อน
          if (hit) docFilter.value = hit.doc.id; else toast('warn', 'ไม่พบใบเบิกที่ตัดจากม้วนนี้');
        }
      };

      // ---------- พิมพ์ป้ายเลขม้วน ----------
      const printLabels = (rec) => {
        const ls = rec.lines.filter((l) => l.newRollId);
        const w = window.open('', '_blank', 'width=480,height=640');
        if (!w) { toast('warn', 'เบราว์เซอร์บล็อกหน้าต่างพิมพ์ อนุญาตป๊อปอัปแล้วลองใหม่'); return; }
        w.document.write(`<!doctype html><meta charset="utf-8"><title>ป้ายเลขม้วน</title><style>body{font-family:sans-serif;margin:0}.l{padding:24px;border-bottom:2px dashed #999;page-break-inside:avoid}.i{font:700 44px monospace}.n{font-size:20px;margin-top:6px}.q{font-size:18px;color:#444}</style>${
          ls.map((l) => { const p = byId.value.get(l.productId); return `<div class="l"><div class="i">${esc(l.newRollId)}</div><div class="n">${esc(p ? p.name : l.productId)}</div><div class="q">${esc(fmt(l.qty, p && p.unit))}${l.fromRollId ? ' · จาก ' + esc(l.fromRollId) : ''}</div></div>`; }).join('')}`);
        w.document.close(); w.focus(); w.print();
      };

      // ---------- คืนของที่ไม่มีใบเบิก ----------
      const loose = reactive({ open: false, productId: null, qty: null, condition: 'ok', whId: null, shelf: DEFAULT_SHELF, reason: '', jobId: null });
      const prodOpts = computed(() => state.products.filter((p) => p.active !== false).map((p) => ({ id: p.id, label: `${p.name}${p.brand ? ' ' + p.brand : ''} (${p.unit})` })));
      const jobOpts = computed(() => state.jobs.filter((j) => j.open).map((j) => ({ id: j.id, label: `${j.id} ${j.name}` })));
      const looseP = computed(() => byId.value.get(loose.productId));
      const looseShelves = computed(() => (loose.whId ? Domain.shelves(state, loose.whId) : []));
      watch(() => loose.whId, () => { if (looseShelves.value.length && !looseShelves.value.includes(loose.shelf)) loose.shelf = looseShelves.value[0]; });
      const looseErr = computed(() => {
        if (blank(loose.qty) || !looseP.value) return '';
        try { Domain.validateQty(Number(loose.qty), looseP.value.unit); return ''; } catch (e) { return e.message; }
      });
      const looseOk = computed(() => loose.productId && !blank(loose.qty) && !looseErr.value && loose.whId && loose.reason.trim()
        && looseShelves.value.length && (loose.condition !== 'damaged' || (loose.whId && Domain.qcShelf(state, loose.whId))));
      const openLoose = () => Object.assign(loose, { open: true, productId: null, qty: null, condition: 'ok', whId: whOpts.value.find((w) => !w.disabled)?.id || null, shelf: DEFAULT_SHELF, reason: '', jobId: null });
      const saveLoose = () => {
        const rec = act((s, u) => Domain.returnLoose(s, {
          productId: loose.productId, whId: loose.whId, shelf: loose.shelf, qty: Number(loose.qty), condition: loose.condition, reason: loose.reason, jobId: loose.jobId || undefined,
        }, u), 'บันทึกคืนของแล้ว');
        if (rec) { loose.open = false; result.value = rec; }
      };

      // ---------- ชั้นรอตรวจ ----------
      const qcRows = computed(() => Domain.qcStock(state).map((x) => {
        const p = byId.value.get(x.productId);
        const rt = [...state.returns].reverse().find((r) => !r.reversed && r.whId === x.whId && r.lines.some((l) => l.condition === 'damaged' && l.productId === x.productId && (!x.rollId || l.newRollId === x.rollId)));
        return { ...x, key: x.whId + '|' + x.productId + '|' + (x.rollId || ''), p, rt: rt ? rt.id : null };
      }).filter((x) => x.p));
      const qcd = reactive({ open: false, row: null, mode: 'restock', shelf: DEFAULT_SHELF, reason: '' });
      const openQc = (row, mode) => {
        const o = Domain.shelves(state, row.whId);
        Object.assign(qcd, { open: true, row, mode, shelf: o.includes(DEFAULT_SHELF) ? DEFAULT_SHELF : o[0] || '', reason: '' });
      };
      const qcShelves = computed(() => (qcd.row ? Domain.shelves(state, qcd.row.whId) : []));
      const saveQc = () => {
        const x = qcd.row;
        const ok = act((s, u) => { Domain.qcDecide(s, { whId: x.whId, productId: x.productId, rollId: x.rollId, qty: x.qty, decision: qcd.mode, shelf: qcd.shelf, reason: qcd.reason }, u); return true; },
          qcd.mode === 'restock' ? 'คืนเข้าชั้นแล้ว' : 'ตัดทิ้งแล้ว');
        if (ok) qcd.open = false;
      };

      // ---------- คืนล่าสุด ----------
      const recent = computed(() => [...state.returns].reverse().slice(0, 20).map((r) => ({
        r, lines: r.lines.map((l) => ({ l, p: byId.value.get(l.productId) })),
      })));
      const reverse = (r) => services.confirm.require({
        header: 'กลับรายการคืน', icon: 'pi pi-undo', message: `กลับรายการ ${r.id} หรือไม่? ยอดที่คืนเข้าจะถูกถอนออกและใบเบิกกลับไปเป็นยังไม่คืน`,
        rejectProps: { label: 'ยกเลิก', severity: 'secondary', outlined: true }, acceptProps: { label: 'กลับรายการ', severity: 'danger' },
        accept: () => act((s, u) => Domain.reverseReturn(s, r.id, u), `กลับรายการ ${r.id} แล้ว`),
      });

      onBeforeUnmount(clearAll);

      return {
        state, user, Domain, COND, condLabel, fmt, whName, nameOf, jobName, when, date, isEng, isStaff, isHead, shelfLabel, tab, text, docFilter, first,
        rows, docOpts, docCur, st, revs, ent, patch, setQty, setCond, returnAll, errOf, items, goodItems, whOpts, whSel, whId, whNote, shelfOpts, shelf, split, note,
        hasDamaged, damagedItems, hasQc, photoBusy, onPhoto, missing, setScrap, result, busy, submit, sheetOpen, onScan, printLabels,
        loose, prodOpts, jobOpts, looseP, looseShelves, looseErr, looseOk, openLoose, saveLoose, qcRows, qcd, openQc, qcShelves, saveQc, recent, reverse, rowsCount: computed(() => rows.value.length),
      };
    },
    template: `<div class="returns-page">
      <page-header icon="pi-replay" title="คืนของ" subtitle="เลือกใบเบิก ใส่จำนวนที่คืน แล้วบันทึกเข้าคลัง">
        <p-button v-if="isStaff" label="คืนของที่ไม่มีใบเบิก" icon="pi pi-plus" severity="secondary" outlined @click="openLoose" />
      </page-header>

      <p-tabs v-model:value="tab">
        <p-tablist>
          <p-tab value="return"><i class="pi pi-replay" aria-hidden="true"></i> คืนของ</p-tab>
          <p-tab v-if="isStaff" value="qc"><i class="pi pi-search" aria-hidden="true"></i> ชั้นรอตรวจ ({{ qcRows.length }})</p-tab>
          <p-tab value="recent"><i class="pi pi-history" aria-hidden="true"></i> คืนล่าสุด</p-tab>
        </p-tablist>
        <p-tabpanels>
          <p-tabpanel value="return">
            <div class="rt-layout">
              <section class="card rt-main" aria-label="ใบเบิกที่คืนได้">
                <div class="rt-tools">
                  <p-iconfield class="rt-search">
                    <p-inputicon class="pi pi-search" />
                    <p-inputtext v-model="text" type="search" placeholder="ค้นหาเลขใบเบิก งาน หรือสินค้า" aria-label="ค้นหาใบเบิก" fluid />
                  </p-iconfield>
                  <scan-button :kinds="['req', 'roll']" @found="onScan" />
                  <p-select v-model="docFilter" :options="docOpts" optionLabel="label" optionValue="id" filter showClear placeholder="ทุกใบเบิก"
                    class="rt-doc" aria-label="เลือกใบเบิก" />
                </div>
                <div v-if="docCur" class="rt-picked">
                  <span>ใบเบิก <doc-id :id="docCur.doc.id" /> · {{ date(docCur.doc.at) }}<template v-if="docCur.doc.jobId"> · {{ jobName(docCur.doc.jobId) }}</template></span>
                  <span class="rt-picked-act">
                    <p-button label="คืนทั้งหมดของใบนี้" icon="pi pi-check-circle" @click="returnAll" />
                    <p-button label="แก้ไข" severity="secondary" outlined @click="docFilter = ''" />
                  </span>
                </div>
                <p-datatable :value="rows" dataKey="key" paginator :rows="20" v-model:first="first" class="rt-table" rowHover>
                  <p-column header="รูป" bodyClass="c-img d-only"><template #body="{ data }"><product-thumb :product="data.p" :size="44" /></template></p-column>
                  <p-column header="สินค้า" bodyClass="c-prod">
                    <template #body="{ data }">
                      <product-thumb :product="data.p" :size="44" class="m-only" />
                      <span class="rt-pname">{{ data.p.name }}</span>
                    </template>
                  </p-column>
                  <p-column header="ใบเบิก / งาน / วันที่" bodyClass="c-doc">
                    <template #body="{ data }">
                      <doc-id :id="data.doc.id" /><span class="rt-sub">{{ data.doc.jobId ? jobName(data.doc.jobId) : 'ไม่ระบุงาน' }} · {{ date(data.doc.at) }}</span>
                    </template>
                  </p-column>
                  <p-column v-if="isStaff" header="เบิกโดย" bodyClass="c-by"><template #body="{ data }">{{ data.by ? data.by.name : '-' }}</template></p-column>
                  <p-column header="จ่ายไป" bodyClass="c-issued num"><template #body="{ data }"><span class="m-lbl">จ่ายไป</span>{{ fmt(data.line.issued, data.p.unit) }}</template></p-column>
                  <p-column header="คืนแล้ว" bodyClass="c-ret num"><template #body="{ data }"><span class="m-lbl">คืนแล้ว</span>{{ fmt(data.line.returned, data.p.unit) }}</template></p-column>
                  <p-column header="คืนได้อีก" bodyClass="c-left num"><template #body="{ data }"><span class="m-lbl">คืนได้อีก</span><strong>{{ fmt(data.line.left, data.p.unit) }}</strong></template></p-column>
                  <p-column header="จำนวนคืน" bodyClass="c-qty">
                    <template #body="{ data }">
                      <span class="m-lbl">จำนวนคืน</span>
                      <p-inputnumber :key="data.key + ':' + (revs[data.key] || 0)" :modelValue="ent(data).qty" @input="setQty(data, $event.value)" :min="0" :minFractionDigits="0"
                        :maxFractionDigits="2" :useGrouping="false" :placeholder="Domain.unitAbbr(data.p.unit)" :ariaLabel="'จำนวนที่คืน ' + data.p.name"
                        :invalid="!!errOf(data)" class="rt-qty" />
                      <small v-if="errOf(data)" class="rt-err" role="alert">{{ errOf(data) }}</small>
                    </template>
                  </p-column>
                  <p-column header="สภาพ" bodyClass="c-cond">
                    <template #body="{ data }">
                      <span class="m-lbl">สภาพ</span>
                      <p-select :modelValue="ent(data).condition" @update:modelValue="setCond(data, $event)" :options="COND" optionLabel="label" optionValue="v"
                        :ariaLabel="'สภาพ ' + data.p.name" class="rt-cond" />
                    </template>
                  </p-column>
                  <p-column v-if="split" header="ชั้น" bodyClass="c-shelf">
                    <template #body="{ data }">
                      <span class="m-lbl">ชั้น</span>
                      <p-select v-if="ent(data).condition === 'ok'" :modelValue="ent(data).shelf || shelf" @update:modelValue="patch(data, { shelf: $event })" :options="shelfOpts"
                        :ariaLabel="'ชั้นของ ' + data.p.name" class="rt-cond" />
                      <span v-else class="muted">{{ ent(data).condition === 'damaged' ? 'ชั้นรอตรวจ' : '-' }}</span>
                    </template>
                  </p-column>
                  <template #empty>
                    <div class="table-empty" v-if="text.trim()"><p>ไม่พบใบเบิกที่ตรงกับ "{{ text.trim() }}"</p></div>
                    <div class="table-empty" v-else>
                      <p>ยังไม่มีของที่ต้องคืน</p>
                      <p v-if="isEng" class="muted">ของที่คนอื่นเบิก ให้คนเบิก Store หรือหัวหน้าเป็นคนคืน</p>
                    </div>
                  </template>
                </p-datatable>
              </section>

              <aside class="card rt-panel" :class="{ open: sheetOpen }" aria-labelledby="rt-h">
                <button type="button" class="rt-sheet-head" :aria-expanded="sheetOpen" @click="sheetOpen = !sheetOpen">
                  <span id="rt-h"><i class="pi pi-replay" aria-hidden="true"></i> ใบคืน ({{ goodItems.length }})</span>
                  <i :class="['pi', sheetOpen ? 'pi-chevron-down' : 'pi-chevron-up']" aria-hidden="true"></i>
                </button>
                <h2 class="rt-head-lg"><i class="pi pi-replay" aria-hidden="true"></i> ใบคืน ({{ goodItems.length }})</h2>
                <div class="rt-body">
                  <h3 class="rt-h3">ของที่จะคืน</h3>
                  <p v-if="!items.length" class="muted rt-empty">ยังไม่ได้ใส่จำนวน ใส่ในช่อง "จำนวนคืน" ของตาราง หรือกด "คืนทั้งหมดของใบนี้"</p>
                  <div v-for="i in items" :key="i.r.key" class="rt-item" :class="{ bad: i.err }">
                    <product-thumb :product="i.r.p" :size="40" />
                    <div class="rt-item-body">
                      <div class="rt-item-name">{{ i.r.p.name }}</div>
                      <div class="rt-item-qty"><span class="num">{{ fmt(i.q, i.r.p.unit) }}</span> · {{ condLabel(i.e.condition) }}</div>
                      <div v-if="i.err" class="rt-err" role="alert"><i class="pi pi-exclamation-circle" aria-hidden="true"></i> {{ i.err }}</div>
                    </div>
                    <button type="button" class="line-remove" :aria-label="'เอา ' + i.r.p.name + ' ออกจากใบคืน'" @click="patch(i.r, { qty: null, photo: null })"><i class="pi pi-times" aria-hidden="true"></i></button>
                  </div>

                  <template v-if="items.some((i) => i.r.p.isRoll)">
                    <h3 class="rt-h3">ม้วนสาย</h3>
                    <div v-for="i in items.filter((x) => x.r.p.isRoll)" :key="'r' + i.r.key" class="rt-roll">
                      <div class="rt-item-name">{{ i.r.p.name }}</div>
                      <template v-if="i.r.line.cuts.length > 1">
                        <label :for="'cut-' + i.r.key" class="rt-lbl">ตัดมาจากม้วน</label>
                        <p-select :inputId="'cut-' + i.r.key" :modelValue="i.rollId" @update:modelValue="patch(i.r, { rollId: $event })" :options="i.r.line.cuts" fluid />
                      </template>
                      <p v-else-if="i.rollId" class="rt-msg">ตัดมาจากม้วน <doc-id :id="i.rollId" /></p>
                      <p v-if="!i.err && i.e.condition !== 'scrap'" class="rt-msg">
                        จะสร้างม้วนใหม่ความยาว {{ fmt(i.q, i.r.p.unit) }}<template v-if="i.rollId"> อ้างอิง <doc-id :id="i.rollId" /></template> และพิมพ์ป้ายเลขม้วนได้ทันที</p>
                      <div v-if="i.hint && i.hint.short" class="rt-warn" role="alert">
                        <span><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> ยาวแค่ {{ fmt(i.q, i.r.p.unit) }} สั้นกว่า {{ fmt(i.hint.scrapMin, i.r.p.unit) }} ซึ่งนับเป็นเศษ ตัดเป็นของเสียไหม</span>
                        <p-button label="เปลี่ยนเป็นของเสีย" size="small" severity="warn" outlined @click="setScrap(i.r)" />
                      </div>
                    </div>
                  </template>

                  <h3 class="rt-h3">คืนเข้าที่ไหน</h3>
                  <div class="field">
                    <label id="rt-wh-l">คลัง <span class="req">*</span></label>
                    <p-select :modelValue="whId" @update:modelValue="whSel = $event" :options="whOpts" optionLabel="name" optionValue="id" optionDisabled="disabled"
                      placeholder="เลือกคลัง" ariaLabelledby="rt-wh-l" fluid>
                      <template #option="{ option }"><span class="opt-row"><span>{{ option.name }}</span><span v-if="option.counting" class="status-tag tone-yellow">กำลังตรวจนับ</span></span></template>
                    </p-select>
                    <small v-if="whNote" class="rt-err">{{ whNote }}</small>
                  </div>
                  <div class="field">
                    <label id="rt-sh-l">ชั้นวาง</label>
                    <p-select v-model="shelf" :options="shelfOpts" :disabled="!shelfOpts.length" ariaLabelledby="rt-sh-l" fluid />
                    <small v-if="whId && !shelfOpts.length" class="rt-err">คลังนี้ไม่มีชั้นวาง เลือกคลังอื่น</small>
                  </div>
                  <label class="rt-check"><p-checkbox v-model="split" binary inputId="rt-split" /><span>แยกชั้นรายการ</span></label>
                  <p v-if="hasDamaged" class="rt-msg"><i class="pi pi-info-circle" aria-hidden="true"></i> ของที่เสียหายจะถูกแยกไว้ที่ชั้นรอตรวจของคลังนี้ รอตรวจสอบ</p>

                  <template v-if="damagedItems.length">
                    <h3 class="rt-h3">รูปของที่เสียหาย</h3>
                    <div v-for="i in damagedItems" :key="'ph' + i.r.key" class="rt-photo">
                      <span class="rt-item-name">{{ i.r.p.name }}</span>
                      <div class="rt-photo-row">
                        <img v-if="i.e.photo" :src="i.e.photo" alt="รูปของที่เสียหาย" class="rt-photo-img">
                        <p-fileupload mode="basic" accept="image/*" auto customUpload :chooseLabel="i.e.photo ? 'เปลี่ยนรูป' : 'ถ่าย/เลือกรูป'" chooseIcon="pi pi-camera"
                          severity="secondary" outlined @uploader="onPhoto(i.r, $event)" />
                        <button v-if="i.e.photo" type="button" class="link-btn danger" @click="patch(i.r, { photo: null })">เอารูปออก</button>
                      </div>
                    </div>
                  </template>

                  <div class="field rt-note">
                    <label for="rt-note">หมายเหตุ (ถ้ามี)</label>
                    <p-textarea id="rt-note" v-model="note" rows="2" placeholder="เช่น เหลือจากงานเดินสาย" fluid autoResize />
                  </div>
                </div>
                <div class="rt-foot">
                  <p class="rt-sum"><strong>จะคืน {{ goodItems.length }} รายการ</strong></p>
                  <p v-if="missing.length" class="submit-block" id="rt-why"><i class="pi pi-lock" aria-hidden="true"></i> ยังขาด: {{ missing.join(' · ') }}</p>
                  <p-button label="บันทึกคืนของ" icon="pi pi-check" class="btn-issue rt-save" :loading="busy" :disabled="!!missing.length" :aria-describedby="missing.length ? 'rt-why' : null" @click="submit" />
                </div>
              </aside>
            </div>
          </p-tabpanel>

          <p-tabpanel v-if="isStaff" value="qc">
            <section class="card rt-main">
              <p class="muted rt-note-top">ของเสียหายที่คืนมา แยกไว้รอตรวจ ยังไม่นับเป็นของพร้อมเบิก</p>
              <p-datatable :value="qcRows" dataKey="key" class="rt-table rt-stack" rowHover>
                <p-column header="รูป"><template #body="{ data }"><product-thumb :product="data.p" :size="44" /></template></p-column>
                <p-column header="สินค้า"><template #body="{ data }"><span class="rt-pname">{{ data.p.name }}</span></template></p-column>
                <p-column header="คลัง"><template #body="{ data }">{{ whName(data.whId) }}</template></p-column>
                <p-column header="จำนวน / เลขม้วน"><template #body="{ data }"><span class="num">{{ fmt(data.qty, data.p.unit) }}</span><doc-id v-if="data.rollId" :id="data.rollId" class="rt-sub" /></template></p-column>
                <p-column header="มาจาก"><template #body="{ data }"><doc-id v-if="data.rt" :id="data.rt" /><span v-else class="muted">-</span></template></p-column>
                <p-column header="ตัดสิน" bodyClass="c-act">
                  <template #body="{ data }">
                    <span class="rt-acts">
                      <p-button label="คืนเข้าชั้น" icon="pi pi-inbox" size="small" @click="openQc(data, 'restock')" />
                      <p-button label="ตัดทิ้ง" icon="pi pi-trash" size="small" severity="danger" outlined @click="openQc(data, 'scrap')" />
                    </span>
                  </template>
                </p-column>
                <template #empty><div class="table-empty"><p>ไม่มีของรอตรวจ</p></div></template>
              </p-datatable>
            </section>
          </p-tabpanel>

          <p-tabpanel value="recent">
            <section class="card rt-main">
              <p-datatable :value="recent" dataKey="r.id" class="rt-table rt-stack" rowHover>
                <p-column header="เลขที่"><template #body="{ data }"><doc-id :id="data.r.id" /></template></p-column>
                <p-column header="เวลา"><template #body="{ data }"><span class="num">{{ when(data.r.at) }}</span></template></p-column>
                <p-column header="ใบเบิก"><template #body="{ data }"><doc-id v-if="data.r.docId" :id="data.r.docId" /><span v-else class="muted">ไม่มีใบเบิก</span></template></p-column>
                <p-column header="รายการ">
                  <template #body="{ data }">
                    <div v-for="x in data.lines" :key="x.l.productId + x.l.condition" class="rt-recent-line">{{ x.p ? x.p.name : x.l.productId }} · {{ fmt(x.l.qty, x.p && x.p.unit) }} · {{ condLabel(x.l.condition) }}</div>
                  </template>
                </p-column>
                <p-column header="คลัง"><template #body="{ data }">{{ whName(data.r.whId) }}</template></p-column>
                <p-column header="โดย"><template #body="{ data }">{{ nameOf(data.r.by) }}</template></p-column>
                <p-column header="สถานะ" bodyClass="c-act">
                  <template #body="{ data }">
                    <span v-if="data.r.reversed" class="status-tag tone-gray"><span class="dot" aria-hidden="true"></span>กลับรายการแล้ว</span>
                    <p-button v-else-if="isHead" label="กลับรายการ" icon="pi pi-undo" size="small" severity="danger" outlined @click="reverse(data.r)" />
                  </template>
                </p-column>
                <template #empty><div class="table-empty"><p>ยังไม่มี</p></div></template>
              </p-datatable>
            </section>
          </p-tabpanel>
        </p-tabpanels>
      </p-tabs>

      <!-- ผลลัพธ์ -->
      <p-dialog :visible="!!result" @update:visible="result = null" modal header="บันทึกคืนของแล้ว" class="result-dialog" :draggable="false">
        <div v-if="result" class="result">
          <p class="result-meta"><doc-id :id="result.id" /> · {{ whName(result.whId) }}<template v-if="result.docId"> · อ้างอิง <doc-id :id="result.docId" /></template></p>
          <ul class="result-lines">
            <li v-for="l in result.lines" :key="l.productId + l.condition + (l.newRollId || '')">
              <span class="result-name">{{ state.products.find((p) => p.id === l.productId)?.name }}</span>
              <span class="result-qty">
                คืน {{ fmt(l.qty, state.products.find((p) => p.id === l.productId)?.unit) }} · {{ condLabel(l.condition) }}<template v-if="l.shelf"> · เก็บที่ {{ shelfLabel(result.whId, l.shelf) }}</template>
                <span v-if="l.newRollId" class="result-pr">ม้วนใหม่: <doc-id :id="l.newRollId" /></span>
              </span>
            </li>
          </ul>
        </div>
        <template #footer>
          <p-button v-if="result && !isEng && result.lines.some((l) => l.newRollId)" label="พิมพ์ป้ายเลขม้วน" icon="pi pi-print" severity="secondary" outlined @click="printLabels(result)" />
          <p-button label="ปิด" @click="result = null" autofocus />
        </template>
      </p-dialog>

      <!-- คืนของที่ไม่มีใบเบิก -->
      <p-dialog v-model:visible="loose.open" header="คืนของที่ไม่มีใบเบิก" modal dismissableMask class="loose-dialog" :draggable="false">
        <form class="pd-form" @submit.prevent="looseOk && saveLoose()">
          <div class="field"><label id="lo-p">สินค้า <span class="req">*</span></label>
            <p-select v-model="loose.productId" :options="prodOpts" optionLabel="label" optionValue="id" filter placeholder="เลือกสินค้า" ariaLabelledby="lo-p" fluid /></div>
          <div class="field"><label for="lo-q">จำนวน <span class="req">*</span></label>
            <p-inputnumber v-model="loose.qty" @input="loose.qty = $event.value" inputId="lo-q" :min="0" :maxFractionDigits="2" :useGrouping="false" :placeholder="looseP ? Domain.unitAbbr(looseP.unit) : ''" fluid />
            <small v-if="looseErr" class="rt-err">{{ looseErr }}</small></div>
          <div class="field"><label id="lo-c">สภาพ</label>
            <p-select v-model="loose.condition" :options="COND" optionLabel="label" optionValue="v" ariaLabelledby="lo-c" fluid /></div>
          <div class="field"><label id="lo-w">คลัง <span class="req">*</span></label>
            <p-select v-model="loose.whId" :options="whOpts" optionLabel="name" optionValue="id" optionDisabled="disabled" placeholder="เลือกคลัง" ariaLabelledby="lo-w" fluid /></div>
          <div v-if="loose.condition === 'ok'" class="field"><label id="lo-s">ชั้นวาง</label>
            <p-select v-model="loose.shelf" :options="looseShelves" ariaLabelledby="lo-s" fluid />
            <small v-if="loose.whId && !looseShelves.length" class="rt-err">คลังนี้ไม่มีชั้นวาง เลือกคลังอื่น</small></div>
          <p v-else-if="loose.condition === 'damaged'" class="rt-msg"><i class="pi pi-info-circle" aria-hidden="true"></i> ของที่เสียหายจะถูกแยกไว้ที่ชั้นรอตรวจของคลังนี้ รอตรวจสอบ</p>
          <div class="field"><label for="lo-r">ของมาจากไหน <span class="req">*</span></label>
            <p-inputtext id="lo-r" v-model="loose.reason" placeholder="เช่น เหลือจากงานนอก ไม่มีใบเบิก" fluid /></div>
          <div class="field"><label id="lo-j">งาน (ถ้ามี)</label>
            <p-select v-model="loose.jobId" :options="jobOpts" optionLabel="label" optionValue="id" filter showClear placeholder="ไม่ระบุงาน" ariaLabelledby="lo-j" fluid /></div>
        </form>
        <template #footer>
          <p-button label="ยกเลิก" severity="secondary" outlined @click="loose.open = false" />
          <p-button label="บันทึกคืนของ" icon="pi pi-check" :disabled="!looseOk" @click="saveLoose" />
        </template>
      </p-dialog>

      <!-- ตัดสินของที่ชั้นรอตรวจ -->
      <p-dialog v-model:visible="qcd.open" :header="qcd.mode === 'restock' ? 'คืนเข้าชั้น' : 'ตัดทิ้ง'" modal dismissableMask class="loose-dialog" :draggable="false">
        <template v-if="qcd.row">
          <p class="rt-msg">{{ qcd.row.p.name }} · {{ fmt(qcd.row.qty, qcd.row.p.unit) }} · {{ whName(qcd.row.whId) }}<template v-if="qcd.row.rollId"> · ม้วน <doc-id :id="qcd.row.rollId" /></template></p>
          <div v-if="qcd.mode === 'restock'" class="field"><label id="qc-s">เก็บที่ชั้น</label>
            <p-select v-model="qcd.shelf" :options="qcShelves" ariaLabelledby="qc-s" fluid /></div>
          <div v-else class="field"><label for="qc-r">เหตุผลที่ตัดทิ้ง <span class="req">*</span></label>
            <p-inputtext id="qc-r" v-model="qcd.reason" placeholder="เช่น แตกหัก ใช้ไม่ได้" fluid /></div>
        </template>
        <template #footer>
          <p-button label="ยกเลิก" severity="secondary" outlined @click="qcd.open = false" />
          <p-button :label="qcd.mode === 'restock' ? 'คืนเข้าชั้น' : 'ตัดทิ้ง'" :severity="qcd.mode === 'restock' ? null : 'danger'"
            :disabled="qcd.mode === 'scrap' ? !qcd.reason.trim() : !qcd.shelf" @click="saveQc" />
        </template>
      </p-dialog>
    </div>`,
  };
})();
