// ลงยอด/ตัดยอดตามชั้นและม้วน · ประวัติ (audit) · แจ้งเตือน — โหลดหลัง js/domain.js
(function (root) {
  const D = root.Domain || require('../domain.js');
  const { DomainError, validateQty, assertWarehouseOpen, nextId } = D;
  const r2 = (n) => +n.toFixed(2);
  const DEFAULT_SHELF = 'ทั่วไป';
  const now = () => new Date().toISOString();

  const productOf = (state, id) => {
    const p = state.products.find((x) => x.id === id);
    if (!p) throw new DomainError('prod_missing', 'ไม่พบสินค้า');
    return p;
  };

  // ม้วนตาม rollSize เศษเป็นม้วนสั้น 1 ม้วน
  function splitRolls(qty, size) {
    const out = [];
    let left = qty;
    while (left > 0) { const n = Math.min(size, left); out.push(r2(n)); left = r2(left - n); }
    return out;
  }

  function rollLengthsFor(p, input) {
    if (input.rollLengths && input.rollLengths.length) return input.rollLengths;
    validateQty(input.qty, p.unit);
    return splitRolls(input.qty, p.rollSize || 100);
  }

  // ลงยอดโดยไม่ตรวจ (ตรวจแล้วใน stockIn หรือเป็นการปรับยอดตอนปิดรอบนับ)
  function putStock(state, input) {
    const { productId, whId, shelf = DEFAULT_SHELF, qty, batch = '', fromRollId = null } = input;
    const p = productOf(state, productId);
    if (!p.isRoll) {
      const k = D.stockKey(productId, whId, shelf);
      state.stock[k] = r2((state.stock[k] || 0) + qty);
      return { amount: qty, rollIds: [] };
    }
    const lengths = rollLengthsFor(p, input);
    const rollIds = lengths.map((length) => {
      const id = nextId(state, 'R');
      state.rolls.push({ id, productId, whId, shelf, length, opened: false, batch, fromRollId });
      return id;
    });
    D.touchRolls(state);
    return { amount: r2(lengths.reduce((a, b) => a + b, 0)), rollIds };
  }

  // ตรวจก่อน แล้วให้ apply() ลงยอดจริง
  function stockIn(state, input) {
    const { productId, whId, shelf = DEFAULT_SHELF } = input;
    const p = productOf(state, productId);
    const wh = state.warehouses.find((w) => w.id === whId);
    if (!wh) throw new DomainError('wh_required', 'เลือกคลังก่อน');
    assertWarehouseOpen(state, whId);
    const sh = (wh.shelves || []).find((s) => s.code === shelf);
    if (!sh) throw new DomainError('shelf_missing', `ไม่พบชั้น ${shelf} ในคลังนี้`);
    if (sh.active === false) throw new DomainError('shelf_inactive', `ชั้น ${shelf} เลิกใช้แล้ว เลือกชั้นอื่น`);
    let amount, preview = [];
    if (p.isRoll) {
      const lengths = rollLengthsFor(p, input);
      lengths.forEach((l) => validateQty(l, p.unit));
      amount = r2(lengths.reduce((a, b) => a + b, 0));
      preview = lengths.map((_, i) => 'R-' + String(state.counters.R + i + 1).padStart(6, '0'));
      input = { ...input, rollLengths: lengths };
    } else {
      validateQty(input.qty, p.unit);
      amount = input.qty;
    }
    return { amount, rollIds: preview, apply: () => putStock(state, input) };
  }

  // ตัดจากชั้นที่ไม่ใช่ชั้นรอตรวจ: ม้วนก่อน (สั้นสุดที่พอ ไม่มีก็ไล่จากยาวสุด) แล้วค่อยชั้นตามลำดับ warehouse.shelves
  function stockOut(state, { productId, whId, qty }) {
    const p = productOf(state, productId);
    validateQty(qty, p.unit);
    if (qty > D.qtyOf(state, productId, whId) + 1e-9) throw new DomainError('stock_short', 'ของในคลังไม่พอ');
    const qc = new Set(D.qcCodes(state, whId));
    const cuts = [], shelves = [];
    const addShelf = (shelf, n) => {
      const s = shelves.find((x) => x.shelf === shelf);
      if (s) s.qty = r2(s.qty + n); else shelves.push({ shelf, qty: r2(n) });
    };
    let need = qty;
    D.touchRolls(state);
    const rolls = state.rolls.filter((r) => r.productId === productId && r.whId === whId && !qc.has(r.shelf));
    while (need > 0 && rolls.length) {
      const fit = rolls.filter((r) => r.length >= need).sort((a, b) => a.length - b.length)[0];
      const roll = fit || rolls.sort((a, b) => b.length - a.length)[0];
      const cut = Math.min(roll.length, need);
      roll.length = r2(roll.length - cut);
      cuts.push({ rollId: roll.id, cut: r2(cut), left: roll.length });
      addShelf(roll.shelf, cut);
      need = r2(need - cut);
      if (roll.length <= 0) {
        rolls.splice(rolls.indexOf(roll), 1);
        state.rolls.splice(state.rolls.indexOf(roll), 1);
      }
    }
    for (const code of D.plainShelves(state, whId)) {
      if (need <= 0) break;
      const k = D.stockKey(productId, whId, code);
      const take = Math.min(state.stock[k] || 0, need);
      if (take <= 0) continue;
      state.stock[k] = r2(state.stock[k] - take);
      addShelf(code, take);
      need = r2(need - take);
    }
    return { cuts, shelves };
  }

  function qcStock(state, whId) {
    const out = [];
    for (const w of state.warehouses) {
      if (whId && w.id !== whId) continue;
      const qc = D.qcShelf(state, w.id);
      if (!qc) continue;
      for (const [k, qty] of Object.entries(state.stock)) {
        const [productId, wid, shelf] = k.split('|');
        if (wid === w.id && shelf === qc.code && qty > 0) out.push({ productId, whId: w.id, qty });
      }
      for (const r of state.rolls) if (r.whId === w.id && r.shelf === qc.code) out.push({ productId: r.productId, whId: w.id, qty: r.length, rollId: r.id });
    }
    return out;
  }

  function log(state, actor, action, ref, text) {
    if (!state.audit) state.audit = [];
    state.audit.push({ at: now(), by: actor && actor.id ? actor.id : actor, action, ref, text });
  }
  const auditFor = (state, ref) => (state.audit || []).filter((a) => a.ref === ref);

  function notify(state, userIds, level, text, link) {
    if (!state.notifs) state.notifs = [];
    for (const to of userIds) state.notifs.push({ id: 'N-' + (state.notifs.length + 1), to, level, text, link, at: now(), read: false });
  }
  function markRead(state, userId, id) {
    for (const n of state.notifs || []) if (n.to === userId && (!id || n.id === id)) n.read = true;
  }
  const unread = (state, userId) => (state.notifs || []).filter((n) => n.to === userId && !n.read).length;

  // PR ของใบเบิกต้องตรงส่วนขาดจริง: ต่อ (ใบ, สินค้า) ส่วนขาด = Σ max(0, waiting − reserved − covered) ของทุกบรรทัดสินค้านั้น
  // ค้างรับเกิน → ตัดจาก PR ใหม่สุดก่อน (ไม่ตัดส่วนที่รับแล้ว และไม่ตัด PR ที่ใบรับรอยืนยันอ้างอยู่) · ขาด → เปิด PR ส่วนที่ขาดครั้งเดียว
  function syncPRs(state, productId, whId) {
    const p = productOf(state, productId);
    const held = new Set(state.docs.filter((d) => d.type === 'receive' && d.status === 'pending').flatMap((d) => d.lines.map((l) => l.prId)));
    const docs = state.docs.filter((d) => d.type === 'issue' && d.status === 'posted' && d.whId === whId && ['partial', 'waiting', 'ready'].includes(d.fill));
    for (const d of docs) {
      const lines = d.lines.filter((l) => l.productId === productId);
      if (!lines.length) continue;
      const need = r2(lines.reduce((a, l) => a + Math.max(0, l.waiting - l.reserved - (l.covered || 0)), 0));
      const open = state.prs.filter((r) => r.reqId === d.id && r.productId === productId && r.status === 'open');
      const have = r2(open.reduce((a, r) => a + r.qty - r.received, 0));
      if (have > need) {
        let excess = r2(have - need);
        for (const r of open.slice().reverse()) {
          if (excess <= 0) break;
          const cutQty = held.has(r.id) ? 0 : Math.min(excess, r2(r.qty - r.received));
          if (cutQty <= 0) continue;
          r.qty = r2(r.qty - cutQty); excess = r2(excess - cutQty);
          if (r.qty <= r.received + 1e-9) r.status = r.received > 0 ? 'done' : 'cancelled';
          log(state, 'system', 'pr.trim', r.id, `ลดรายการต้องซื้อ ${r.id} ลง ${D.formatQty(cutQty, p.unit)} เพราะ ${d.id} ได้ของจากที่อื่นแล้ว${r.status === 'open' ? '' : r.status === 'done' ? ' (ปิด)' : ' (ยกเลิก)'}`);
        }
      } else if (need > have) {
        const pr = { id: nextId(state, 'PR'), productId, whId, qty: r2(need - have), received: 0, status: 'open', reqId: d.id };
        state.prs.push(pr); d.prIds.push(pr.id);
        notify(state, [d.by], 'warn', `${p.name} ของ ${d.id} ยังขาด จึงเปิดรายการต้องซื้อ ${pr.id}`, '#/');
        log(state, 'system', 'pr.open', pr.id, `เปิดรายการต้องซื้อ ${pr.id} ${D.formatQty(pr.qty, p.unit)} ให้ ${d.id}`);
      }
    }
  }

  // ของเข้าคลัง → กันให้ใบเบิกที่รอ (ใบเก่าสุดก่อน) เท่าที่เบิกได้จริง; ครบทุกบรรทัด = ready + แจ้งผู้เบิก
  function reserveForWaiting(state, productId, whId) {
    const docs = state.docs
      .filter((d) => d.type === 'issue' && d.status === 'posted' && d.whId === whId && (d.fill === 'partial' || d.fill === 'waiting'))
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    const touched = [];
    for (const d of docs) {
      let free = D.available(state, productId, whId);
      for (const l of d.lines) {
        if (l.productId !== productId || free <= 0) continue;
        const add = Math.min(free, r2(l.waiting - l.reserved));
        if (add <= 0) continue;
        l.reserved = r2(l.reserved + add); free = r2(free - add);
        if (l.reserved >= l.waiting - 1e-9) l.covered = 0; // กันครบแล้ว ไม่ต้องถือยอดรอยืนยันไว้อีก
        if (!touched.includes(d)) touched.push(d);
      }
      if (touched.includes(d) && d.lines.every((l) => l.reserved >= l.waiting - 1e-9)) {
        d.fill = 'ready';
        notify(state, [d.by], 'info', `ของที่รอสำหรับ ${d.id} เข้าแล้ว ระบบกันไว้ให้แล้ว`, '#/');
      }
    }
    syncPRs(state, productId, whId);
    return touched;
  }

  // จ่ายของที่กันไว้ให้ใบเบิก (Store/หัวหน้าจ่ายแทนได้ วิศวกรเฉพาะใบตัวเอง)
  function pickReserved(state, docId, actor) {
    const doc = state.docs.find((d) => d.id === docId);
    if (!doc || doc.type !== 'issue' || doc.status !== 'posted') throw new DomainError('doc_missing', 'ไม่พบใบเบิกที่จ่ายได้');
    if (actor.role === 'engineer' && doc.by !== actor.id) throw new DomainError('forbidden', D.FORBIDDEN);
    const lines = doc.lines.filter((l) => l.reserved > 0);
    if (!lines.length) throw new DomainError('nothing_reserved', 'ยังไม่มีของที่กันไว้ให้ใบนี้');
    // ตรวจทุกบรรทัดก่อนตัด (รวมต่อสินค้า) ถ้าของจริงน้อยกว่าที่กันไว้ → ไม่ตัดอะไรเลย
    const need = {};
    for (const l of lines) need[l.productId] = r2((need[l.productId] || 0) + l.reserved);
    for (const [pid, n] of Object.entries(need)) if (n > D.qtyOf(state, pid, doc.whId) + 1e-9) throw new DomainError('stock_short', 'ของในคลังน้อยกว่าที่กันไว้ จ่ายไม่ได้ ให้ Store ตรวจยอด');
    for (const l of lines) {
      const o = stockOut(state, { productId: l.productId, whId: doc.whId, qty: l.reserved });
      l.cuts = [...(l.cuts || []), ...o.cuts]; l.shelves = [...(l.shelves || []), ...o.shelves];
      l.issued = r2(l.issued + l.reserved); l.waiting = r2(l.waiting - l.reserved); l.reserved = 0;
    }
    doc.fill = doc.lines.every((l) => l.waiting <= 0) ? 'full' : doc.lines.some((l) => l.issued > 0) ? 'partial' : 'waiting';
    log(state, actor, 'issue.pick', doc.id, 'จ่ายของที่กันไว้ ' + lines.length + ' รายการ');
    if (actor.id !== doc.by) notify(state, [doc.by], 'info', `${doc.id} จ่ายของที่รอให้แล้ว`, '#/');
    return doc;
  }

  Object.assign(D, {
    reserveForWaiting, syncPRs, pickReserved, markRead, qcStock, stockIn, stockOut, putStock, log, auditFor, notify, unread,
    FORBIDDEN: 'คุณทำรายการนี้ไม่ได้ ให้หัวหน้าทำแทน หรือขอให้หัวหน้าเปิดสิทธิ์',
  });
  if (typeof module !== 'undefined') module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
