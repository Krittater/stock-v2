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
  const unread = (state, userId) => (state.notifs || []).filter((n) => n.to === userId && !n.read).length;

  Object.assign(D, {
    qcStock, stockIn, stockOut, putStock, log, auditFor, notify, unread,
    FORBIDDEN: 'คุณทำรายการนี้ไม่ได้ ให้หัวหน้าทำแทน หรือขอให้หัวหน้าเปิดสิทธิ์',
  });
  if (typeof module !== 'undefined') module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
