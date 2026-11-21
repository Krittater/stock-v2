// รับของเข้า: ตรวจครบทุกบรรทัดก่อนลงยอด (ผิดบรรทัดเดียว = ไม่ลงอะไรเลย) · รับเกินที่สั่งต้องมีเหตุผล · ไม่มีใบขอซื้อ · ม้วน · ชำรุด/ปฏิเสธ · ชั้นต่อบรรทัด
// โหลดหลัง js/domain/opening.js (PR ปรับผ่าน D.syncPRs ใน stock.js)
(function (root) {
  const D = root.Domain || require('../domain.js');
  const { DomainError, validateQty, formatQty, nextId, log, notify } = D;
  const r2 = (n) => +n.toFixed(2);
  const SHELF = 'ทั่วไป';
  const CONDITIONS = ['ok', 'damaged', 'reject'];
  const trim = (v) => String(v ?? '').trim();

  const prodOf = (state, id) => {
    const p = state.products.find((x) => x.id === id);
    if (!p) throw new DomainError('prod_missing', 'ไม่พบสินค้า');
    return p;
  };
  const whName = (state, id) => (state.warehouses.find((w) => w.id === id) || {}).name || id;
  const outstanding = (pr) => Math.max(0, r2(pr.qty - pr.received));

  // คลังที่รับของได้: มี เปิดใช้ ไม่ถูกล็อกนับ (ข้อความตามสเปก 5A.6)
  function checkWh(state, whId) {
    const wh = state.warehouses.find((w) => w.id === whId);
    if (!wh) throw new DomainError('wh_required', 'เลือกคลังก่อน');
    if (wh.active === false) throw new DomainError('wh_inactive', `${wh.name} ปิดใช้งานอยู่ — รับของเข้าไม่ได้ (เปิดใช้อีกครั้งก่อน)`);
    if (wh.countId) throw new DomainError('wh_counting', 'คลังนี้ถูกล็อกเพื่อตรวจนับ รับของเข้าไม่ได้');
    return wh;
  }

  // แปลงที่กรอกเป็นบรรทัดมาตรฐาน (จำนวนหน่วยหลัก, ชั้นที่ลงจริง); บรรทัดที่เป็น 0 ถูกข้าม
  function normalise(state, input, wh) {
    const out = [];
    for (const l of input.lines) {
      const p = prodOf(state, l.productId);
      const condition = l.condition || 'ok';
      if (!CONDITIONS.includes(condition)) throw new DomainError('cond_invalid', 'สภาพของที่รับไม่ถูกต้อง');
      let qty, rollLengths;
      if (p.isRoll && l.rollLengths && l.rollLengths.length) {
        rollLengths = l.rollLengths.map((x) => Number(x || 0)).filter((x) => x !== 0);
        qty = r2(rollLengths.reduce((a, b) => a + b, 0));
        if (!rollLengths.length) continue;
      } else {
        qty = r2(Number(l.qty || 0) * (l.unit === 'buy' ? p.buyFactor || 1 : 1));
        if (qty === 0) continue;
      }
      validateQty(qty, p.unit);
      let shelf = null;
      if (condition === 'ok') shelf = l.shelf || input.shelf || SHELF;
      else if (condition === 'damaged') {
        const qc = D.qcShelf(state, wh.id);
        if (!qc) throw new DomainError('shelf_missing', 'คลังนี้ไม่มีชั้นรอตรวจ');
        shelf = qc.code;
      }
      out.push({ productId: p.id, prId: l.prId || null, qty, unit: 'base', condition, shelf, batch: l.batch || '', ...(rollLengths ? { rollLengths } : {}) });
    }
    if (!out.length) throw new DomainError('receive_empty', 'ยังไม่ได้กรอกจำนวนที่รับ');
    return out;
  }

  // ต่อรายการต้องซื้อ: ที่จะรับ (หน่วยหลัก ไม่นับ reject) เทียบค้างรับ · left > 0 = รับไม่ครบ, left < 0 = รับเกิน (ใช้ทั้งหน้าจอและตอนตรวจ)
  function receiveCoverage(state, lines) {
    const got = new Map();
    for (const l of lines) {
      if (!l.prId) continue;
      got.set(l.prId, r2((got.get(l.prId) || 0) + (l.condition === 'reject' ? 0 : Number(l.qty) || 0)));
    }
    return [...got].map(([prId, g]) => {
      const pr = state.prs.find((r) => r.id === prId);
      return pr ? { prId, productId: pr.productId, got: g, left: r2(outstanding(pr) - g) } : null;
    }).filter(Boolean);
  }

  // แถวม้วนเริ่มต้น: ม้วนละ size เศษอยู่ม้วนสุดท้าย
  function defaultRollLengths(qty, size) {
    const n = Math.ceil(r2(qty) / size - 1e-9);
    return n > 0 ? Array.from({ length: n }, (_, i) => (i < n - 1 ? size : r2(qty - size * (n - 1)))) : [];
  }

  // ตรวจทุกอย่างโดยไม่แตะข้อมูล; คืน stockIn ต่อบรรทัด (reject = null) ใช้ได้ทั้งตอนบันทึกและตอนยืนยัน
  function check(state, doc) {
    const wh = checkWh(state, doc.whId);
    const ins = doc.lines.map((l) => {
      const p = prodOf(state, l.productId);
      if (p.active === false) throw new DomainError('prod_inactive', `${p.name} เลิกใช้แล้ว รับของเข้าไม่ได้`);
      validateQty(l.qty, p.unit);
      if (l.prId) {
        const pr = state.prs.find((r) => r.id === l.prId);
        if (!pr || pr.productId !== l.productId || pr.whId !== doc.whId) throw new DomainError('pr_mismatch', 'รายการต้องซื้อไม่ตรงกับสินค้าหรือคลัง');
        if (pr.status !== 'open') throw new DomainError('pr_closed', `รายการต้องซื้อ ${pr.id} ปิดแล้ว รับของเข้าไม่ได้`);
      }
      if (l.condition === 'reject') return null;
      if (l.condition === 'ok') {
        const sh = (wh.shelves || []).find((s) => s.code === l.shelf);
        if (!sh) throw new DomainError('shelf_missing', `ไม่พบที่วาง ${l.shelf} ในคลังนี้`);
        if (sh.qc) throw new DomainError('shelf_invalid', 'วางที่ชั้นรอตรวจไม่ได้');
        if (sh.active === false) throw new DomainError('shelf_inactive', `ที่วาง ${l.shelf} ปิดใช้งานอยู่ — รับของเข้าไม่ได้ (เปิดใช้อีกครั้งก่อน)`);
      }
      return D.stockIn(state, { productId: l.productId, whId: doc.whId, shelf: l.shelf, qty: l.qty, rollLengths: p.isRoll ? l.rollLengths : undefined, batch: l.batch });
    });
    const o = receiveCoverage(state, doc.lines).find((c) => c.left < -1e-9);
    if (o && !trim(doc.overReason)) throw new DomainError('over_receive', `รับเกินที่สั่ง ${formatQty(-o.left, prodOf(state, o.productId).unit)} ใส่เหตุผล`);
    return ins;
  }

  function post(state, doc, ins, actor) {
    const gained = new Set();
    doc.lines.forEach((l, i) => {
      l.rollIds = ins[i] ? ins[i].apply().rollIds : [];
      if (l.condition === 'reject') return;
      const pr = l.prId && state.prs.find((r) => r.id === l.prId);
      if (pr) {
        pr.received = r2(pr.received + l.qty);
        if (pr.received >= pr.qty - 1e-9) pr.status = 'done';
      } else {
        const x = { id: nextId(state, 'PR'), productId: l.productId, whId: doc.whId, qty: l.qty, received: l.qty, status: 'done', reqId: null, noPr: true };
        state.prs.push(x); l.prId = x.id;
      }
      if (l.condition === 'ok') gained.add(l.productId);
    });
    doc.rollIds = doc.lines.flatMap((l) => l.rollIds);
    const filled = new Map();
    for (const pid of gained) { // reserveForWaiting ปรับ PR ของใบเบิกให้ตรงส่วนขาดเอง
      for (const d of D.reserveForWaiting(state, pid, doc.whId)) filled.set(d.id, d);
    }
    doc.filledDocs = [...filled.keys()];
    log(state, actor, 'receive', doc.id, `รับของเข้า${whName(state, doc.whId)} ${doc.lines.length} บรรทัด`);
  }

  function receive(state, input, actor) {
    if (!input.lines || !input.lines.length) throw new DomainError('lines_empty', 'เพิ่มของอย่างน้อย 1 รายการ');
    const wh = checkWh(state, input.whId);
    const doc = {
      id: null, type: 'receive', status: actor.role === 'engineer' ? 'pending' : 'posted', whId: input.whId,
      lines: normalise(state, input, wh), invoiceNo: trim(input.invoiceNo), vendor: trim(input.vendor),
      receivedAt: input.receivedAt || D.today(), note: input.note ?? '', overReason: trim(input.overReason),
      by: actor.id, at: new Date().toISOString(),
    };
    const ins = check(state, doc); // ผิดบรรทัดเดียว = ไม่ลงอะไรเลย และยังไม่กินเลขเอกสาร
    doc.id = nextId(state, 'RC');
    if (doc.status === 'posted') post(state, doc, ins, actor);
    else {
      log(state, actor, 'receive.submit', doc.id, `ส่งใบรับของ${whName(state, doc.whId)} ${doc.lines.length} บรรทัด รอ Store ยืนยัน`);
      notify(state, state.users.filter((u) => u.role === 'store').map((u) => u.id), 'info', `${actor.name || actor.id} ส่งใบรับของ ${doc.id} รอ Store ยืนยันยอด`, '#/approvals');
    }
    state.docs.push(doc);
    return doc;
  }

  function confirmReceipt(state, docId, actor, accept, overReason) {
    if (actor.role === 'engineer') throw new DomainError('forbidden', 'บัญชีนี้ยืนยันยอดไม่ได้ ให้ Store หรือหัวหน้ายืนยัน');
    const doc = state.docs.find((d) => d.id === docId);
    if (!doc || doc.type !== 'receive' || doc.status !== 'pending') throw new DomainError('doc_not_pending', 'เอกสารนี้ไม่ได้รอยืนยัน');
    if (accept && trim(overReason)) doc.overReason = trim(overReason); // รับเกินที่เจอตอนยืนยัน ใส่เหตุผลตอนนี้ได้
    if (accept) post(state, doc, check(state, doc), actor); // ตรวจซ้ำตามยอดตอนนี้ (ชั้น/คลัง/ค้างรับอาจเปลี่ยนระหว่างรอ)
    doc.status = accept ? 'posted' : 'rejected';
    if (!accept) {
      const why = trim(overReason); // ตอนปฏิเสธ ช่องนี้คือเหตุผล (จะแจ้งผู้ส่ง)
      if (why) { doc.rejectReason = why; notify(state, [doc.by], 'warn', `ใบรับ ${doc.id} ไม่ผ่าน: ${why}`, '#/receive'); }
      log(state, actor, 'receive.reject', doc.id, 'ไม่รับใบรับ' + (why ? ': ' + why : ''));
      for (const pid of new Set(doc.lines.map((l) => l.productId))) D.syncPRs(state, pid, doc.whId); // ปล่อย PR ที่ถูกกันไว้เพราะใบรับนี้อ้างอยู่
    }
    return doc;
  }

  Object.assign(D, { receive, confirmReceipt, outstanding, receiveCoverage, defaultRollLengths });
  if (typeof module !== 'undefined') module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
