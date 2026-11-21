// ยอดตั้งต้น/ของที่เจอเพิ่ม (ผ่านขั้นยืนยัน) · ยอดรอ · นำเข้า CSV · คิวอนุมัติ — โหลดหลัง js/domain/jobs.js
// state.ccs: { id:'CC-0001', productId, whId, shelf, qty, rollLengths?, diff? (kind count), by, stage:'store'|'head'|'done'|'rejected', reason, kind:'opening'|'found'|'count' }
(function (root) {
  const D = root.Domain || require('../domain.js');
  const { DomainError, validateQty, assertWarehouseOpen, nextId, log, notify } = D;
  const r2 = (n) => +n.toFixed(2);
  const SHELF = 'ทั่วไป';
  const isHead = (a) => !!a && a.role === 'head';
  const isStaff = (a) => !!a && (a.role === 'head' || a.role === 'store');
  const forbidden = () => new DomainError('forbidden', D.FORBIDDEN);
  const ccs = (state) => state.ccs || (state.ccs = []);
  const usersOf = (state, role) => state.users.filter((u) => u.role === role).map((u) => u.id);
  const productOf = (state, id) => {
    const p = state.products.find((x) => x.id === id);
    if (!p) throw new DomainError('prod_missing', 'ไม่พบสินค้า');
    return p;
  };
  const ccQty = (c) => (c.rollLengths ? r2(c.rollLengths.reduce((a, b) => a + b, 0)) : c.qty);
  const live = (c) => c.stage === 'store' || c.stage === 'head';

  // ยอดที่รอยืนยัน (ไม่นับรายการปรับยอดนับ)
  const pendingOpening = (state, productId, whId) =>
    r2(ccs(state).filter((c) => live(c) && c.kind !== 'count' && c.productId === productId && c.whId === whId).reduce((a, c) => a + ccQty(c), 0));

  // ตรวจครบก่อนแตะข้อมูล: คลังมี/ไม่ถูกนับ, จำนวนหรือความยาวทุกม้วน > 0, หน่วย, ชั้น
  function check(state, s) {
    const p = productOf(state, s.productId);
    if (!state.warehouses.some((w) => w.id === s.whId)) throw new DomainError('wh_required', 'เลือกคลังที่มีของ');
    assertWarehouseOpen(state, s.whId);
    const shelf = s.shelf || SHELF;
    if (D.qcCodes(state, s.whId).includes(shelf)) throw new DomainError('shelf_invalid', 'วางที่ชั้นรอตรวจไม่ได้');
    const lengths = p.isRoll && s.rollLengths && s.rollLengths.length ? s.rollLengths.map(Number) : null;
    if (lengths) { if (!lengths.every((l) => l > 0)) throw new DomainError('roll_invalid', 'ใส่ความยาวของทุกม้วน (มากกว่า 0)'); }
    else if (!(s.qty > 0)) throw new DomainError('qty_invalid', 'ใส่จำนวนที่มีอยู่ (มากกว่า 0)');
    const ins = D.stockIn(state, { productId: p.id, whId: s.whId, shelf, qty: s.qty, rollLengths: lengths || undefined, batch: s.batch || '' });
    return { p, shelf, amount: ins.amount, rollLengths: lengths, apply: ins.apply };
  }

  const OPEN_FILL = ['partial', 'waiting', 'ready'];
  const openDocs = (state, whId) => state.docs.filter((d) => d.type === 'issue' && d.status === 'posted' && d.whId === whId && OPEN_FILL.includes(d.fill));

  // ลงยอดจริง + ปรับยอดรอ + กันของให้ใบเบิกที่รอ (ผ่านการตรวจแล้ว)
  function land(state, apply, productId, whId) {
    apply();
    rebalance(state, productId, whId);
    D.reserveForWaiting(state, productId, whId); // กันของแล้วปรับ PR ให้ตรงส่วนขาด
  }

  // ใบเบิกที่ยอดรอครอบคลุมไว้ (ไม่เปิด PR) ลด covered เมื่อยอดรอหายไป; คืนบรรทัดที่ลด เพื่อให้ ensurePRs ตรวจหลังกันของแล้ว
  function rebalance(state, productId, whId) {
    const lines = [];
    for (const d of openDocs(state, whId)) for (const l of d.lines) if (l.productId === productId && l.covered > 0) lines.push([d, l]);
    let excess = r2(lines.reduce((a, [, l]) => a + l.covered, 0) - pendingOpening(state, productId, whId));
    const dropped = [];
    for (const [d, l] of lines.sort((a, b) => b[0].at.localeCompare(a[0].at))) {
      if (excess <= 0) break;
      const take = Math.min(l.covered, excess);
      l.covered = r2(l.covered - take); excess = r2(excess - take);
      dropped.push([d, l]);
    }
    return dropped;
  }
  // postIssue ใช้: ส่วนขาดที่ยอดรอยังไม่ถูกใบอื่นนับครอบคลุม
  function coverable(state, productId, whId, need, used = 0) { // used = ส่วนที่บรรทัดก่อนหน้าของใบเดียวกันนับไปแล้ว
    used = +used;
    for (const d of openDocs(state, whId)) for (const l of d.lines) if (l.productId === productId) used += l.covered || 0;
    return r2(Math.max(0, Math.min(need, pendingOpening(state, productId, whId) - used)));
  }

  const preOf = (s, kind) => (kind === 'opening' ? `สร้าง ${s.id} แล้ว · ` : `${s.id} · `);

  function submitOpening(state, input, actor) {
    const kind = input.kind === 'found' ? 'found' : 'opening';
    const v = check(state, { ...input, kind });
    const stage = !isStaff(actor) ? 'store' : actor.role === 'store' && v.p.needsApproval ? 'head' : null;
    const pre = preOf(v.p, kind);
    const text = D.formatQty(v.amount, v.p.unit);
    if (!stage) {
      land(state, v.apply, v.p.id, input.whId);
      log(state, actor, 'opening.post', v.p.id, `ลงยอด ${text} ${input.whId}/${v.shelf} (${kind})`);
      return { cc: null, message: `${pre}ลงยอด ${text} เข้าคลังแล้ว` };
    }
    const cc = { id: nextId(state, 'CC'), productId: v.p.id, whId: input.whId, shelf: v.shelf, qty: v.amount, by: actor.id, stage, reason: '', kind, at: new Date().toISOString() };
    if (v.rollLengths) cc.rollLengths = v.rollLengths;
    ccs(state).push(cc);
    notify(state, usersOf(state, stage === 'store' ? 'store' : 'head'), 'info', `${actor.name} ส่งยอด ${v.p.name} ${text} รอ${stage === 'store' ? 'ยืนยัน' : 'อนุมัติ'} (${cc.id})`, '#/approvals?tab=cc');
    log(state, actor, 'opening.submit', v.p.id, `${cc.id} ส่งยอด ${v.p.name} ${text} ${input.whId} รอ${stage === 'store' ? ' Store' : 'หัวหน้า'}`);
    return { cc, message: stage === 'store' ? `${pre}ส่งให้ Store ยืนยันยอด (${cc.id})` : `${pre}รอหัวหน้าอนุมัติยอด (${cc.id})` };
  }

  // ปรับยอดจากรอบนับของสินค้าที่ต้องอนุมัติ (ไม่ใช่หัวหน้าปิดรอบ) → รอหัวหน้า
  function queueCountDiff(state, count, line, diff, actor) {
    const p = productOf(state, line.productId);
    const id = nextId(state, 'CC');
    for (const o of ccs(state)) if (o.kind === 'count' && live(o) && o.productId === p.id && o.whId === count.whId) { o.stage = 'rejected'; o.reason = `แทนด้วย ${id}`; }
    const cc = { id, productId: p.id, whId: count.whId, shelf: SHELF, diff, by: actor.id, stage: 'head', reason: '', kind: 'count', countId: count.id, at: new Date().toISOString() };
    ccs(state).push(cc);
    notify(state, usersOf(state, 'head'), 'info', `ปรับยอด ${p.name} ${diff > 0 ? '+' : ''}${D.formatQty(diff, p.unit)} จากรอบนับ ${count.id} รออนุมัติ (${cc.id})`, '#/approvals?tab=cc');
    log(state, actor, 'count.queue', p.id, `${cc.id} ปรับยอด ${p.name} ${diff} รอหัวหน้าอนุมัติ`);
    return cc;
  }

  function prepareCount(state, cc) {
    assertWarehouseOpen(state, cc.whId);
    if (cc.diff < 0 && -cc.diff > D.qtyOf(state, cc.productId, cc.whId) + 1e-9) throw new DomainError('stock_short', 'ยอดในคลังเปลี่ยนไป ปรับยอดไม่ได้');
    return () => {
      if (cc.diff > 0) D.putStock(state, { productId: cc.productId, whId: cc.whId, qty: cc.diff, rollLengths: productOf(state, cc.productId).isRoll ? [cc.diff] : undefined, batch: 'จากการนับ' });
      else D.stockOut(state, { productId: cc.productId, whId: cc.whId, qty: -cc.diff });
      if (cc.diff > 0) D.reserveForWaiting(state, cc.productId, cc.whId);
    };
  }

  function confirmOpening(state, ccId, actor, ok, reason = '') {
    const cc = ccs(state).find((c) => c.id === ccId);
    if (!cc || !live(cc)) throw new DomainError('cc_not_pending', 'รายการนี้ไม่ได้รอยืนยัน');
    if (cc.stage === 'head' ? !isHead(actor) : !isStaff(actor)) throw forbidden();
    const p = productOf(state, cc.productId);
    const text = cc.kind === 'count' ? `ปรับยอด ${cc.diff}` : D.formatQty(ccQty(cc), p.unit);
    const tell = (msg, level) => { if (cc.by !== actor.id) notify(state, [cc.by], level, msg, '#/'); };
    if (!ok) {
      const why = String(reason || '').trim();
      if (!why) throw new DomainError('reason_required', 'ใส่เหตุผลก่อน (จะแจ้งผู้ขอ)');
      cc.stage = 'rejected'; cc.reason = why;
      if (cc.kind !== 'count') { rebalance(state, cc.productId, cc.whId); D.syncPRs(state, cc.productId, cc.whId); }
      tell(`${cc.id} ${p.name} ${text} ไม่ผ่าน: ${why}`, 'warn');
      log(state, actor, 'opening.reject', p.id, `${cc.id} ไม่รับยอด ${p.name} ${text}: ${why}`);
      return cc;
    }
    if (cc.stage === 'store' && actor.role === 'store' && p.needsApproval) {
      cc.stage = 'head';
      notify(state, usersOf(state, 'head'), 'info', `${cc.id} ${p.name} ${text} Store ยืนยันแล้ว รอหัวหน้าอนุมัติ`, '#/approvals?tab=cc');
      log(state, actor, 'opening.confirm', p.id, `${cc.id} Store ยืนยัน ส่งต่อหัวหน้า`);
      return cc;
    }
    const apply = cc.kind === 'count' ? prepareCount(state, cc) : check(state, cc).apply;
    cc.stage = 'done'; // ก่อน land เพื่อให้ยอดรอของใบนี้ไม่ถูกนับซ้ำ
    if (cc.kind === 'count') {
      apply();
      state.docs.push({ id: nextId(state, 'ADJ'), type: 'adjust', status: 'posted', whId: cc.whId, lines: [{ productId: cc.productId, qty: cc.diff }], note: `ปรับยอดจากรอบนับ ${cc.countId} (${cc.id})`, by: actor.id, at: new Date().toISOString() });
    } else land(state, apply, cc.productId, cc.whId);
    tell(`${cc.id} ${p.name} ${text} อนุมัติแล้ว`, 'info');
    log(state, actor, 'opening.approve', p.id, `${cc.id} อนุมัติยอด ${p.name} ${text}`);
    return cc;
  }

  function approvalItems(state, actor) {
    const none = { issues: [], receipts: [], ccs: [] };
    if (!isStaff(actor)) return none;
    const pend = (t) => state.docs.filter((d) => d.type === t && d.status === 'pending');
    if (isHead(actor)) return { issues: pend('issue'), receipts: pend('receive'), ccs: ccs(state).filter(live) };
    const roleOf = (id) => (state.users.find((u) => u.id === id) || {}).role;
    return { issues: [], receipts: pend('receive').filter((d) => !isStaff({ role: roleOf(d.by) })), ccs: ccs(state).filter((c) => c.stage === 'store') };
  }

  // ---- นำเข้า CSV ----
  function splitCsv(text) {
    const rows = []; let row = [], cur = '', q = false;
    const t = String(text).replace(/^﻿/, '');
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
      else cur += c;
    }
    row.push(cur); rows.push(row);
    return rows.filter((r) => r.some((x) => x.trim()));
  }

  function checkRow(state, row, seen) {
    const p = state.products.find((x) => x.code === row.code || x.id === row.code);
    if (!row.code) return 'ไม่มีรหัสสินค้า';
    if (!p) return 'ไม่พบรหัสสินค้าในระบบ (สร้างรหัสก่อน)';
    const wh = state.warehouses.find((w) => w.id === row.whId);
    if (!wh) return 'ไม่พบคลัง';
    if (wh.active === false) return `${wh.name} ปิดใช้งานอยู่`;
    if (wh.countId) return 'คลังนี้กำลังตรวจนับ รอให้นับเสร็จก่อน';
    const sh = (wh.shelves || []).find((s) => s.code === row.shelf);
    if (!sh || sh.active === false || sh.qc) return 'ไม่พบตำแหน่ง';
    if (!(row.qty > 0)) return 'จำนวนไม่ถูกต้อง';
    try { validateQty(row.qty, p.unit); } catch (e) { return e.code === 'qty_integer' ? e.message : 'จำนวนไม่ถูกต้อง'; }
    if (p.isRoll) {
      if (!row.rollNo) return 'สินค้าติดตามรายม้วนต้องมีเลขม้วน';
      if (state.rolls.some((r) => r.id === row.rollNo)) return 'เลขม้วนซ้ำกับในระบบ';
      if (row.rollInitial != null && !(row.rollInitial >= row.qty)) return 'จำนวนไม่ถูกต้อง';
    }
    const key = p.isRoll ? 'R|' + row.rollNo : `${p.id}|${wh.id}|${row.shelf}`;
    if (seen.has(key)) return 'ข้อมูลซ้ำในไฟล์';
    seen.add(key);
    return null;
  }

  function parseOpeningCsv(state, text) {
    const recs = splitCsv(text);
    const head = (recs.shift() || []).map((h) => h.trim().toLowerCase());
    const col = (r, name) => { const i = head.indexOf(name); return i < 0 ? '' : String(r[i] ?? '').trim(); };
    const seen = new Set();
    const rows = recs.map((r, i) => {
      const w = col(r, 'warehouse').toLowerCase();
      const wh = state.warehouses.find((x) => x.id.toLowerCase() === w || x.name.toLowerCase() === w);
      const ri = col(r, 'roll_initial');
      const row = {
        line: i + 2, code: col(r, 'code'), warehouse: col(r, 'warehouse'), whId: wh ? wh.id : '', shelf: col(r, 'location') || SHELF,
        qty: Number(col(r, 'qty')), rollNo: col(r, 'roll_no'), rollInitial: ri === '' ? null : Number(ri), batch: col(r, 'batch'),
      };
      const err = checkRow(state, row, seen);
      row.errors = err ? [err] : [];
      return row;
    });
    return { rows };
  }

  function importOpening(state, rows, actor) {
    if (!isHead(actor)) throw forbidden();
    if (state.settings.openingLocked) throw new DomainError('opening_locked', 'ยอดยกมาถูกล็อกแล้ว');
    if (!rows || !rows.length) throw new DomainError('rows_empty', 'ไม่มีแถวให้นำเข้า');
    const seen = new Set();
    if (rows.some((r) => checkRow(state, r, seen))) throw new DomainError('rows_invalid', 'ตัดแถวที่ผิดก่อน'); // ตรวจใหม่ทุกแถว ไม่เชื่อ errors ที่ส่งมา
    const touched = new Set();
    for (const r of rows) {
      const p = state.products.find((x) => x.code === r.code || x.id === r.code);
      if (p.isRoll) {
        const m = /^R-(\d+)$/.exec(r.rollNo); if (m && +m[1] > state.counters.R) state.counters.R = +m[1];
        state.rolls.push({ id: r.rollNo, productId: p.id, whId: r.whId, shelf: r.shelf, length: r.qty, opened: r.rollInitial != null && r.rollInitial > r.qty, batch: r.batch || '', fromRollId: null });
        D.touchRolls(state);
      } else D.putStock(state, { productId: p.id, whId: r.whId, shelf: r.shelf, qty: r.qty, batch: r.batch || '' });
      touched.add(p.id + '|' + r.whId);
    }
    for (const k of touched) { const [pid, wid] = k.split('|'); rebalance(state, pid, wid); D.reserveForWaiting(state, pid, wid); }
    log(state, actor, 'opening.import', 'opening', `นำเข้ายอดยกมา ${rows.length} แถว`);
    return { imported: rows.length };
  }

  function setOpeningLock(state, on, actor) {
    if (!isHead(actor)) throw forbidden();
    state.settings.openingLocked = !!on;
    log(state, actor, 'opening.lock', 'opening', on ? 'ล็อกยอดยกมา' : 'ปลดล็อกยอดยกมา');
    return state.settings.openingLocked;
  }

  // ข้อความบอกล่วงหน้า (OS-G5): หัวหน้าเข้าทันทีเสมอ · Store เข้าทันทียกเว้นสินค้าต้องอนุมัติ · คนอื่นรอ Store
  const openingLead = (role, needsApproval) => (role === 'head' ? 'ยอดเข้าคลังทันที'
    : role === 'store' ? (needsApproval ? 'หัวหน้าจะอนุมัติยอดก่อนเข้าคลัง' : 'ยอดเข้าคลังทันที') : 'Store จะตรวจยืนยันยอดก่อนเข้าคลัง');
  // ข้อความตรวจในกล่องกรอกยอด (5B.6) — in: { whId, qty, rolls[], isRoll, unit }
  function openingProblems(i) {
    const m = [];
    if (!i.whId) m.push('เลือกคลังที่มีของ');
    if (i.isRoll) { const r = i.rolls || []; if (!r.length || !r.every((l) => l > 0)) m.push('ใส่ความยาวของทุกม้วน (มากกว่า 0)'); }
    else if (!(i.qty > 0)) m.push('ใส่จำนวนที่มีอยู่ (มากกว่า 0)');
    else if (i.unit !== 'เมตร' && !Number.isInteger(i.qty)) m.push(`${i.unit || 'หน่วย'}ต้องเป็นจำนวนเต็ม`);
    return m;
  }

  Object.assign(D, { openingLead, openingProblems, submitOpening, confirmOpening, approvalItems, pendingOpening, coverable, queueCountDiff, parseOpeningCsv, importOpening, setOpeningLock });
  if (typeof module !== 'undefined') module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
