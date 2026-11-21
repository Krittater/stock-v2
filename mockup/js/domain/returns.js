// คืนของ: สภาพ (ok/damaged/scrap) ชั้น ม้วนใหม่อ้างม้วนเดิม ชั้นรอตรวจ กลับรายการ — โหลดหลัง js/domain/stock.js
(function (root) {
  const D = root.Domain || require('../domain.js');
  const { DomainError, validateQty, assertWarehouseOpen, nextId } = D;
  const r2 = (n) => +n.toFixed(2);
  const DEFAULT_SHELF = 'ทั่วไป';
  const USED = 'ของจากการคืนนี้ถูกใช้ไปแล้ว กลับรายการไม่ได้';
  const CONDITIONS = ['ok', 'damaged', 'scrap'];

  const left = (l) => r2(l.issued - (l.returned || 0));
  const blank = (q) => q === null || q === undefined || q === '' || Number(q) === 0;
  const productOf = (state, id) => {
    const p = state.products.find((x) => x.id === id);
    if (!p) throw new DomainError('prod_missing', 'ไม่พบสินค้า');
    return p;
  };
  const staffOnly = (actor) => { if (actor.role === 'engineer') throw new DomainError('forbidden', D.FORBIDDEN); };

  // คลังต้องมีอยู่ เปิดใช้ และไม่ถูกล็อกนับ
  function openWh(state, whId) {
    const wh = state.warehouses.find((w) => w.id === whId);
    if (!wh) throw new DomainError('wh_required', 'เลือกคลังก่อน');
    if (wh.active === false) throw new DomainError('wh_inactive', `${wh.name} ปิดใช้งานอยู่ — คืนของไม่ได้ (เปิดใช้อีกครั้งก่อน)`);
    assertWarehouseOpen(state, whId);
    return wh;
  }

  // ปลายทางของของที่คืน: ok → ชั้นที่เลือก, damaged → ชั้นรอตรวจของคลัง, scrap → ไม่มี
  function destOf(state, wh, condition, shelf) {
    if (condition === 'scrap') return null;
    const qc = D.qcShelf(state, wh.id);
    if (condition === 'damaged') {
      if (!qc) throw new DomainError('qc_missing', 'คลังนี้ไม่มีชั้นรอตรวจ เลือกคลังอื่น');
      return qc.code;
    }
    if (qc && shelf === qc.code) throw new DomainError('shelf_qc', 'ของที่ใช้ได้เก็บที่ชั้นรอตรวจไม่ได้');
    return shelf;
  }

  // ตรวจปลายทาง (ไม่ลงยอด) แล้วคืนฟังก์ชันลงยอดจริง; legacy = ยอดค้างทศนิยมของข้อมูลเก่า (ข้ามการตรวจจำนวนเต็มตอนลงยอด)
  function prepareIn(state, p, whId, shelf, qty, fromRollId, legacy) {
    const ins = D.stockIn(state, { productId: p.id, whId, shelf, qty: legacy ? 1 : qty, rollLengths: p.isRoll ? [qty] : undefined, fromRollId });
    if (!legacy) return ins.apply;
    return () => D.putStock(state, { productId: p.id, whId, shelf, qty });
  }

  // ใบเบิกที่ยังคืนได้ รวมต่อสินค้า (ทุกบรรทัดของสินค้านั้น) เรียงใหม่สุดก่อน; วิศวกรเห็นเฉพาะใบตัวเอง
  function returnable(state, actor, q = '') {
    const needle = String(q || '').trim().toLowerCase();
    return state.docs
      .filter((d) => d.type === 'issue' && d.status === 'posted' && (actor.role !== 'engineer' || d.by === actor.id))
      .map((doc) => ({
        doc, by: state.users.find((u) => u.id === doc.by),
        lines: [...new Set(doc.lines.map((l) => l.productId))].map((pid) => {
          const ls = doc.lines.filter((l) => l.productId === pid);
          return {
            productId: pid, issued: r2(ls.reduce((a, l) => a + l.issued, 0)), returned: r2(ls.reduce((a, l) => a + (l.returned || 0), 0)),
            left: r2(ls.reduce((a, l) => a + left(l), 0)), cuts: [...new Set(ls.flatMap((l) => (l.cuts || []).map((c) => c.rollId)))],
          };
        }).filter((l) => l.left > 0),
      }))
      .filter((x) => x.lines.length)
      .filter((x) => {
        if (!needle) return true;
        const job = state.jobs.find((j) => j.id === x.doc.jobId);
        const hay = [x.doc.id, job && job.name, ...x.lines.map((l) => { const p = state.products.find((y) => y.id === l.productId); return p ? [p.name, p.brand, p.model].join(' ') : ''; })];
        return hay.some((h) => (h || '').toLowerCase().includes(needle));
      })
      .sort((a, b) => b.doc.at.localeCompare(a.doc.at) || b.doc.id.localeCompare(a.doc.id));
  }

  function returnItems(state, input, actor) {
    const { docId, note = '', lines } = input;
    const doc = state.docs.find((d) => d.id === docId && d.type === 'issue' && d.status === 'posted');
    if (!doc) throw new DomainError('doc_missing', 'ไม่พบใบเบิก');
    if (actor.role === 'engineer' && doc.by !== actor.id) throw new DomainError('forbidden', D.FORBIDDEN);
    const wh = openWh(state, input.whId || doc.whId);
    const todo = (lines || []).filter((l) => !blank(l.qty));
    if (!todo.length) throw new DomainError('qty_empty', 'ยังไม่ได้กรอกจำนวนที่คืน');

    // ตรวจครบทุกบรรทัดก่อน ยังไม่แตะข้อมูล
    const sums = {};
    const items = todo.map((l) => {
      const rls = doc.lines.filter((x) => x.productId === l.productId);
      if (!rls.length) throw new DomainError('prod_not_in_doc', 'ไม่พบสินค้านี้ในใบเบิก');
      const p = productOf(state, l.productId);
      const qty = Number(l.qty);
      const max = r2(rls.reduce((a, x) => a + left(x), 0));
      let legacy = false;
      try { validateQty(qty, p.unit); } catch (e) {
        if (!(p.unit !== 'เมตร' && !Number.isInteger(max) && qty === max)) throw e;
        legacy = true;
      }
      if (!CONDITIONS.includes(l.condition)) throw new DomainError('condition_missing', 'เลือกสภาพของที่คืน');
      sums[p.id] = r2((sums[p.id] || 0) + qty);
      if (sums[p.id] > max + 1e-9) throw new DomainError('over_return', `${p.name} คืนได้ไม่เกิน ${max} ${p.unit} (ยอดที่เบิกไปหักที่คืนแล้ว)`);
      const cuts = [...new Set(rls.flatMap((x) => (x.cuts || []).map((c) => c.rollId)))];
      if (l.rollId && !cuts.includes(l.rollId)) throw new DomainError('roll_not_cut', 'เลือกได้เฉพาะม้วนที่ใบเบิกนี้ตัดไป');
      const shelf = destOf(state, wh, l.condition, l.shelf ?? input.shelf ?? DEFAULT_SHELF);
      const fromRollId = p.isRoll ? (l.rollId ?? cuts[0] ?? null) : null;
      const apply = shelf ? prepareIn(state, p, wh.id, shelf, qty, fromRollId, legacy) : null;
      return { l, p, qty, shelf, fromRollId, apply, rls };
    });

    // ลงยอด
    const rec = { id: nextId(state, 'RT'), docId: doc.id, whId: wh.id, by: actor.id, at: new Date().toISOString(), note: String(note || '').trim(), lines: [], reversed: false };
    for (const { l, p, qty, shelf, fromRollId, apply, rls } of items) {
      const res = apply ? apply() : null;
      const alloc = [];
      for (let rest = qty; rest > 0; ) {
        const x = rls.find((y) => left(y) > 0);
        if (!x) break;
        const take = Math.min(rest, left(x));
        x.returned = r2((x.returned || 0) + take);
        if (l.condition === 'scrap') x.scrapped = r2((x.scrapped || 0) + take); else x.scrapped = x.scrapped || 0;
        alloc.push({ i: doc.lines.indexOf(x), take });
        rest = r2(rest - take);
      }
      rec.lines.push({
        productId: p.id, qty, condition: l.condition, shelf, newRollId: res && res.rollIds[0] || null,
        fromRollId: res && res.rollIds[0] ? fromRollId : null, photo: l.condition === 'damaged' && l.photo ? l.photo : null, alloc,
      });
    }
    state.returns.push(rec);
    for (const k of new Set(items.filter((i) => i.l.condition === 'ok').map((i) => i.p.id))) D.reserveForWaiting(state, k, wh.id);
    D.log(state, actor, 'return', rec.id, `คืนของ ${doc.id} ${rec.lines.length} รายการ เข้า ${wh.name}`);
    return rec;
  }

  // คืนของที่ไม่มีใบเบิก (Store/หัวหน้า)
  function returnLoose(state, input, actor) {
    staffOnly(actor);
    const { productId, whId, qty, condition, jobId = null } = input;
    const why = String(input.reason || '').trim();
    if (!why) throw new DomainError('reason_required', 'กรุณาระบุว่าของมาจากไหน');
    const p = productOf(state, productId);
    const wh = openWh(state, whId);
    validateQty(qty, p.unit);
    if (!CONDITIONS.includes(condition)) throw new DomainError('condition_missing', 'เลือกสภาพของที่คืน');
    const shelf = destOf(state, wh, condition, input.shelf ?? DEFAULT_SHELF);
    const res = shelf ? prepareIn(state, p, wh.id, shelf, qty, null, false)() : null;
    const rec = {
      id: nextId(state, 'RT'), docId: null, jobId: jobId || null, whId: wh.id, by: actor.id, at: new Date().toISOString(), note: '', reason: why, reversed: false,
      lines: [{ productId: p.id, qty, condition, shelf, newRollId: res && res.rollIds[0] || null, fromRollId: null, photo: null, alloc: [] }],
    };
    state.returns.push(rec);
    if (condition === 'ok') D.reserveForWaiting(state, p.id, wh.id);
    D.log(state, actor, 'return', rec.id, `คืนของไม่มีใบเบิก ${p.name} ${qty} ${p.unit} (${why}) เข้า ${wh.name}`);
    return rec;
  }

  // กลับรายการคืน (หัวหน้า): ตรวจทุกอย่างก่อน แล้วค่อยถอน
  function reverseReturn(state, returnId, actor) {
    if (actor.role !== 'head') throw new DomainError('forbidden', D.FORBIDDEN);
    const rec = (state.returns || []).find((r) => r.id === returnId);
    if (!rec) throw new DomainError('return_missing', 'ไม่พบรายการคืน');
    if (rec.reversed) throw new DomainError('return_reversed', 'รายการคืนนี้ถูกกลับรายการไปแล้ว');
    openWh(state, rec.whId);
    const qc = D.qcShelf(state, rec.whId);
    const rollIds = new Set(), cut = {}, usable = {};
    for (const l of rec.lines) {
      if (l.newRollId) {
        const r = state.rolls.find((x) => x.id === l.newRollId);
        if (!r || r.length < l.qty - 1e-9) throw new DomainError('return_used', USED);
        rollIds.add(r.id);
      } else if (l.shelf) {
        const k = D.stockKey(l.productId, rec.whId, l.shelf);
        cut[k] = r2((cut[k] || 0) + l.qty);
      }
      if (l.shelf && !(qc && l.shelf === qc.code)) usable[l.productId] = r2((usable[l.productId] || 0) + l.qty);
    }
    for (const [k, n] of Object.entries(cut)) if ((state.stock[k] || 0) < n - 1e-9) throw new DomainError('return_used', USED);
    // ของที่กันไว้ให้ใบเบิกที่รอต้องไม่เสียหาย
    for (const [pid, n] of Object.entries(usable)) if (D.available(state, pid, rec.whId) < n - 1e-9) throw new DomainError('return_used', USED);

    state.rolls = state.rolls.filter((r) => !rollIds.has(r.id));
    if (rollIds.size) D.touchRolls(state);
    for (const [k, n] of Object.entries(cut)) state.stock[k] = r2(state.stock[k] - n);
    const doc = rec.docId && state.docs.find((d) => d.id === rec.docId);
    if (doc) for (const l of rec.lines) for (const { i, take } of l.alloc || []) {
      doc.lines[i].returned = r2(doc.lines[i].returned - take);
      if (l.condition === 'scrap') doc.lines[i].scrapped = r2(doc.lines[i].scrapped - take);
    }
    rec.reversed = true; rec.reversedBy = actor.id; rec.reversedAt = new Date().toISOString();
    D.log(state, actor, 'return.reverse', rec.id, `กลับรายการคืน ${rec.id}${rec.docId ? ' ของ ' + rec.docId : ''}`);
    return rec;
  }

  // ตัดสินของที่ชั้นรอตรวจ: เก็บเข้าชั้นปกติ (สายม้วน = ย้ายทั้งม้วน) หรือตัดทิ้ง
  function qcDecide(state, input, actor) {
    staffOnly(actor);
    const { whId, productId, rollId, qty, decision } = input;
    const p = productOf(state, productId);
    const wh = openWh(state, whId);
    if (!['restock', 'scrap'].includes(decision)) throw new DomainError('decision_missing', 'เลือกว่าจะเก็บเข้าชั้นหรือตัดทิ้ง');
    validateQty(qty, p.unit);
    const qc = D.qcShelf(state, wh.id);
    if (!qc) throw new DomainError('qc_missing', 'คลังนี้ไม่มีชั้นรอตรวจ');
    const why = String(input.reason || '').trim();
    const shelf = input.shelf || DEFAULT_SHELF;
    const roll = rollId ? state.rolls.find((r) => r.id === rollId && r.productId === p.id && r.whId === wh.id && r.shelf === qc.code) : null;
    if (rollId && !roll) throw new DomainError('qc_roll_missing', 'ไม่พบม้วนนี้ที่ชั้นรอตรวจ');
    const key = D.stockKey(p.id, wh.id, qc.code);
    const have = roll ? roll.length : state.stock[key] || 0;
    if (qty > have + 1e-9) throw new DomainError('qc_short', `ที่ชั้นรอตรวจมี ${p.name} แค่ ${have} ${p.unit}`);
    if (decision === 'scrap' && !why) throw new DomainError('reason_required', 'กรุณาระบุเหตุผลที่ตัดทิ้ง');
    if (decision === 'restock') {
      if (!D.shelves(state, wh.id).includes(shelf)) throw new DomainError('shelf_missing', `ชั้น ${shelf} ใช้ไม่ได้ในคลังนี้ เลือกชั้นอื่น`);
      if (roll) roll.shelf = shelf;
      else { state.stock[key] = r2(state.stock[key] - qty); D.putStock(state, { productId: p.id, whId: wh.id, shelf, qty }); }
      D.reserveForWaiting(state, p.id, wh.id);
      D.log(state, actor, 'qc.restock', rollId || p.id, `ชั้นรอตรวจ → ${shelf}: ${p.name} ${roll ? roll.length : qty} ${p.unit}`);
    } else {
      if (roll) { roll.length = r2(roll.length - qty); if (roll.length <= 0) { state.rolls.splice(state.rolls.indexOf(roll), 1); D.touchRolls(state); } }
      else state.stock[key] = r2(state.stock[key] - qty);
      D.log(state, actor, 'qc.scrap', rollId || p.id, `ตัดทิ้งจากชั้นรอตรวจ: ${p.name} ${qty} ${p.unit} (${why})`);
    }
  }

  // ยอดใช้ของงาน = เบิก − (คืน − ของเสีย) ของเสียนับเป็นยอดใช้ (Q8)
  function jobUsage(state, jobId) {
    const out = {};
    for (const d of state.docs) {
      if (d.type !== 'issue' || d.jobId !== jobId) continue;
      for (const l of d.lines) {
        const u = out[l.productId] ||= { productId: l.productId, issued: 0, returned: 0, scrapped: 0 };
        u.issued = r2(u.issued + (l.issued || 0)); u.returned = r2(u.returned + (l.returned || 0)); u.scrapped = r2(u.scrapped + (l.scrapped || 0));
      }
    }
    return Object.values(out).map((u) => ({ ...u, used: r2(u.issued - (u.returned - u.scrapped)) }));
  }

  // เตือนเศษสายสั้นกว่าเกณฑ์ (Q9) เป็นคำใบ้เท่านั้น ไม่บล็อกการคืน
  function returnHint(state, productId, qty) {
    const p = productOf(state, productId);
    const scrapMin = p.isRoll ? p.scrapMin || 0 : 0;
    return { short: !!p.isRoll && qty > 0 && qty < scrapMin, scrapMin };
  }

  Object.assign(D, { returnable, returnItems, returnLoose, reverseReturn, qcDecide, jobUsage, returnHint });
  if (typeof module !== 'undefined') module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
