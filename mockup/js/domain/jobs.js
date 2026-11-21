// งาน / โครงการ: สร้าง แก้ ปิด เปิดอีกครั้ง คัดลอก · ปิด/ยกเลิกใบเบิก — โหลดหลัง js/domain/products.js
(function (root) {
  const D = root.Domain || require('../domain.js');
  const { DomainError, norm, similarity, log } = D;
  const r2 = (n) => +n.toFixed(2);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const jobOf = (state, id) => {
    const j = state.jobs.find((x) => x.id === id);
    if (!j) throw new DomainError('job_missing', 'ไม่พบงานนี้');
    return j;
  };
  const nameOf = (state, actor) => (state.users.find((u) => u.id === (actor && actor.id)) || actor || {}).name || '';

  // รหัส J-{YY}-{NNN}: ค.ศ. 2 หลัก รันต่อปี (id เก่าที่ไม่เข้ารูปแบบข้ามไป)
  function nextJobId(state) {
    const yy = String(new Date().getFullYear()).slice(-2);
    let max = 0;
    for (const j of state.jobs) { const m = /^J-(\d{2})-(\d+)$/.exec(j.id); if (m && m[1] === yy) max = Math.max(max, +m[2]); }
    return `J-${yy}-${String(max + 1).padStart(3, '0')}`;
  }

  function cleanJob(state, f, selfId) {
    const name = String(f.name ?? '').trim().replace(/\s+/g, ' ');
    if (!name) throw new DomainError('job_name', 'กรุณาระบุชื่องาน');
    const dup = state.jobs.find((j) => j.id !== selfId && norm(j.name) === norm(name));
    if (dup) throw new DomainError('job_dup', `มีงานชื่อนี้แล้ว: ${dup.id}`);
    if (f.start && f.due && f.due < f.start) throw new DomainError('job_dates', 'กำหนดเสร็จต้องไม่ก่อนวันเริ่ม');
    return name;
  }

  // งานที่ชื่อคล้าย (รวมที่ปิดแล้ว ไม่รวมชื่อเดียวกันเป๊ะ) ≥ 45% ไม่เกิน 5
  function similarJobs(state, name) {
    const q = norm(name);
    if (q.length < 3) return [];
    return state.jobs.filter((j) => norm(j.name) !== q && norm(j.name).length >= 3)
      .map((job) => ({ job, pct: Math.round(similarity(job.name, name) * 100) }))
      .filter((x) => x.pct >= 45).sort((a, b) => b.pct - a.pct).slice(0, 5);
  }

  function addJob(state, f = {}, actor) {
    const name = cleanJob(state, f);
    const job = {
      id: nextJobId(state), name, customer: f.customer || '', open: true,
      ownerId: f.ownerId || (actor && actor.id) || null, site: f.site || '', start: f.start || today(), due: f.due || null,
      closedAt: null, note: f.note || '',
    };
    state.jobs.push(job);
    log(state, actor, 'job.add', job.id, 'สร้างงาน ' + job.name);
    return job;
  }

  const FIELDS = ['name', 'customer', 'site', 'ownerId', 'start', 'due', 'note'];
  function updateJob(state, id, patch, actor) {
    const job = jobOf(state, id);
    const next = { ...job, ...Object.fromEntries(FIELDS.filter((k) => k in patch).map((k) => [k, patch[k]])) };
    next.name = cleanJob(state, next, id);
    const diff = FIELDS.filter((k) => (job[k] ?? '') !== (next[k] ?? '')).map((k) => `${k}: ${job[k] ?? ''} → ${next[k] ?? ''}`);
    Object.assign(job, next);
    log(state, actor, 'job.update', id, 'แก้ไขงาน ' + job.name + (diff.length ? ' (' + diff.join(', ') + ')' : ''));
    return job;
  }

  const jobDocs = (state, jobId) => state.docs.filter((d) => d.type === 'issue' && d.jobId === jobId);
  const openDocsOf = (state, jobId) => jobDocs(state, jobId).filter((d) => d.status === 'pending' || D.isOpenFill(d.fill));

  // PR ที่ยกเลิกได้ = เปิดอยู่ ยังไม่ได้รับของ และไม่ถูกใบรับที่รอยืนยันอ้างอยู่ (ไม่งั้น Store ยืนยันทีหลังจะติด pr_closed)
  const heldPRIds = (state) => new Set(state.docs.filter((d) => d.type === 'receive' && d.status === 'pending').flatMap((d) => d.lines.map((l) => l.prId)));
  const prsOfDocs = (state, docs) => { const ids = new Set(docs.map((d) => d.id)); return state.prs.filter((r) => r.status === 'open' && ids.has(r.reqId) && !(r.received > 0)); };
  function openPRsOf(state, docs) {
    const held = heldPRIds(state);
    return prsOfDocs(state, docs).filter((r) => !held.has(r.id));
  }
  const heldPRsOf = (state, docs) => { const held = heldPRIds(state); return prsOfDocs(state, docs).filter((r) => held.has(r.id)); };

  function closeJobCheck(state, jobId) {
    const docs = jobDocs(state, jobId);
    const unreturned = [];
    for (const d of docs) for (const l of d.lines) {
      const left = r2((l.issued || 0) - (l.returned || 0));
      if (left > 0) unreturned.push({ productId: l.productId, docId: d.id, left });
    }
    return { openDocs: openDocsOf(state, jobId), unreturned, openPRs: openPRsOf(state, docs), heldPRs: heldPRsOf(state, docs) };
  }

  function cancelPRs(state, docs, actor) {
    const prs = openPRsOf(state, docs);
    for (const r of prs) { r.status = 'cancelled'; log(state, actor, 'pr.cancel', r.id, 'ยกเลิกรายการต้องซื้อ ' + r.id); }
    return prs;
  }

  // Q2: ของที่ยังไม่คืนไม่บล็อกการปิด · Q3: cancelPRs ค่าเริ่ม true
  function closeJob(state, jobId, actor, { cancelPRs: cancel = true } = {}) {
    const job = jobOf(state, jobId);
    if (!job.open) throw new DomainError('job_closed', 'งานนี้ปิดแล้ว');
    const open = openDocsOf(state, jobId);
    if (open.length) throw new DomainError('job_open_docs', `ยังมีใบเบิกที่ไม่ปิด ${open.map((d) => d.id).join(', ')} — ปิดหรือยกเลิกก่อนปิดงาน`);
    const prs = cancel ? cancelPRs(state, jobDocs(state, jobId), actor) : [];
    job.open = false; job.closedAt = new Date().toISOString();
    if (!job.due) job.due = today();
    log(state, actor, 'job.close', jobId, `ปิดงาน ${job.name} ปิดโดย ${nameOf(state, actor)}` + (prs.length ? ` · ยกเลิกรายการต้องซื้อ ${prs.map((r) => r.id).join(', ')}` : ''));
    return { job, cancelledPRs: prs };
  }

  function reopenJob(state, jobId, actor) {
    const job = jobOf(state, jobId);
    if (job.open) return job; // เปิดอยู่แล้ว ไม่ลงประวัติซ้ำ
    job.open = true; job.closedAt = null;
    log(state, actor, 'job.reopen', jobId, `เปิดงาน ${job.name} อีกครั้ง โดย ${nameOf(state, actor)}`);
    return job;
  }

  function cloneJob(state, jobId, actor) {
    const src = jobOf(state, jobId);
    let name = src.name + ' (ใหม่)', n = 1;
    while (state.jobs.some((j) => norm(j.name) === norm(name))) name = `${src.name} (ใหม่ ${++n})`;
    const job = addJob(state, { name, customer: src.customer, site: src.site, ownerId: src.ownerId }, actor);
    log(state, actor, 'job.clone', job.id, `คัดลอกจาก ${src.id}`);
    return job;
  }

  // ปิดได้ = ใบที่จ่ายแล้วแต่ยังไม่ครบ · ยกเลิกได้ = ใบรออนุมัติ หรือใบที่ยังไม่เคยจ่ายของ (UI ใช้ชุดเดียวกัน)
  const canCloseIssue = (d) => d.status === 'posted' && D.isOpenFill(d.fill);
  const canCancelIssue = (d) => d.status === 'pending' || (canCloseIssue(d) && !d.lines.some((l) => (l.issued || 0) > 0));
  const docOf = (state, id) => {
    const d = state.docs.find((x) => x.id === id && x.type === 'issue');
    if (!d) throw new DomainError('doc_missing', 'ไม่พบใบเบิกนี้');
    return d;
  };
  // ปล่อยของที่กันไว้ แล้วให้ใบที่รออยู่ได้ของต่อ
  function release(state, doc) {
    for (const l of doc.lines) { l.reserved = 0; l.waiting = 0; l.covered = 0; }
    for (const pid of new Set(doc.lines.map((l) => l.productId))) D.reserveForWaiting(state, pid, doc.whId);
  }

  function closeIssue(state, docId, actor, { cancelPRs: cancel = true } = {}) {
    const doc = docOf(state, docId);
    if (!canCloseIssue(doc)) throw new DomainError('doc_not_open', 'ปิดได้เฉพาะใบเบิกที่ยังจ่ายไม่ครบ');
    const prs = cancel ? cancelPRs(state, [doc], actor) : [];
    doc.fill = 'closed';
    release(state, doc);
    log(state, actor, 'issue.close', doc.id, `ปิดใบเบิก ${doc.id} ปิดโดย ${nameOf(state, actor)}`);
    return { doc, cancelledPRs: prs };
  }

  function cancelIssue(state, docId, actor, { cancelPRs: cancel = true } = {}) {
    const doc = docOf(state, docId);
    if (!(doc.status === 'pending' || canCloseIssue(doc))) throw new DomainError('doc_not_open', 'ใบเบิกนี้ยกเลิกไม่ได้');
    if (doc.lines.some((l) => (l.issued || 0) > 0)) throw new DomainError('doc_issued', 'ใบเบิกนี้จ่ายของไปแล้ว ยกเลิกไม่ได้ ใช้ "ปิดใบเบิก" แทน');
    const prs = cancel ? cancelPRs(state, [doc], actor) : [];
    if (doc.status === 'pending') doc.status = 'rejected'; // ออกจากคิวรออนุมัติ
    doc.fill = 'cancelled';
    release(state, doc);
    log(state, actor, 'issue.cancel', doc.id, `ยกเลิกใบเบิก ${doc.id} โดย ${nameOf(state, actor)}`);
    return { doc, cancelledPRs: prs };
  }

  // ประวัติของงาน + ใบเบิก + รายการต้องซื้อของใบเหล่านั้น ใหม่สุดก่อน
  function jobHistory(state, jobId) {
    const docIds = new Set(jobDocs(state, jobId).map((d) => d.id));
    const refs = new Set([jobId, ...docIds, ...state.prs.filter((r) => docIds.has(r.reqId)).map((r) => r.id)]);
    return (state.audit || []).map((a, i) => ({ a, i })).filter((x) => refs.has(x.a.ref))
      .sort((x, y) => (y.a.at > x.a.at ? 1 : y.a.at < x.a.at ? -1 : y.i - x.i)).map((x) => x.a);
  }

  // CSV ยอดใช้ของงาน: BOM + CRLF ให้ Excel อ่านไทยถูก
  function jobUsageCsv(state, jobId) {
    const job = jobOf(state, jobId);
    const q = (v) => { let t = String(v ?? ''); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const rows = [['รหัสงาน', job.id], ['ชื่องาน', job.name], [], ['รหัสสินค้า', 'สินค้า', 'หน่วย', 'เบิก', 'คืน', 'ใช้จริง']];
    for (const u of D.jobUsage(state, jobId)) {
      const p = state.products.find((x) => x.id === u.productId) || {};
      rows.push([u.productId, p.name || u.productId, p.unit || '', u.issued, u.returned, u.used]);
    }
    return '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
  }

  Object.assign(D, { today, nextJobId, jobHistory, openPRsOf, heldPRsOf, canCloseIssue, canCancelIssue, jobUsageCsv, similarJobs, addJob, updateJob, openDocsOf, closeJobCheck, closeJob, reopenJob, cloneJob, closeIssue, cancelIssue });
  if (typeof module !== 'undefined') module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
