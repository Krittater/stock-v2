(function (root) {
  class DomainError extends Error {
    constructor(code, message) { super(message); this.name = 'DomainError'; this.code = code; }
  }

  const ABBR = { 'เมตร': 'ม.' };
  const unitAbbr = (unit) => ABBR[unit] || unit;

  function formatQty(n, unit) {
    const s = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return unit ? `${s} ${unitAbbr(unit)}` : s;
  }

  // เมตรรับทศนิยมได้ไม่เกิน 2 ตำแหน่ง; หน่วยอื่นต้องเป็นจำนวนเต็ม
  function validateQty(qty, unit) {
    if (!Number.isFinite(qty) || qty <= 0) throw new DomainError('qty_invalid', 'ใส่จำนวนที่มากกว่า 0');
    if (unit === 'เมตร') {
      if (Math.abs(qty * 100 - Math.round(qty * 100)) > 1e-9) throw new DomainError('qty_invalid', 'ทศนิยมได้ไม่เกิน 2 ตำแหน่ง');
    } else if (!Number.isInteger(qty)) {
      throw new DomainError('qty_integer', `${unit}ต้องเป็นจำนวนเต็ม`);
    }
  }

  const stockKey = (productId, whId) => `${productId}|${whId}`;
  const qtyOf = (state, productId, whId) => state.stock[stockKey(productId, whId)] || 0;
  const totalQty = (state, productId) =>
    state.warehouses.reduce((sum, w) => sum + qtyOf(state, productId, w.id), 0);

  function stockStatus(state, product, whId) {
    const q = whId ? qtyOf(state, product.id, whId) : totalQty(state, product.id);
    if (q <= 0) return 'out';
    return q <= product.reorderPoint ? 'low' : 'in';
  }

  // [prefix, ใช้ปี พ.ศ. 69 นำหน้า?, จำนวนหลัก]
  const ID_FORMAT = {
    P: ['P-', '', 4], REQ: ['REQ-', '69', 4], PR: ['PR-', '69', 4], RC: ['RC-', '69', 4],
    CC: ['CC-', '', 4], ADJ: ['ADJ-', '69', 4], J: ['J-26-', '', 3], C: ['C-', '', 3],
  };
  function nextId(state, kind) {
    const [prefix, year, digits] = ID_FORMAT[kind];
    const n = ++state.counters[kind];
    return prefix + year + String(n).padStart(digits, '0');
  }

  const currentUser = (state) => state.users.find((u) => u.id === state.currentUserId);

  function assertWarehouseOpen(state, whId) {
    const wh = state.warehouses.find((w) => w.id === whId);
    if (wh && wh.countId) throw new DomainError('wh_counting', 'คลังนี้กำลังตรวจนับ รอให้นับเสร็จก่อน');
  }

  function parseSaved(raw) {
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      return s && s.version === 1 ? s : null;
    } catch (e) {
      return null;
    }
  }

  const Domain = {
    DomainError, unitAbbr, formatQty, validateQty, stockKey, qtyOf, totalQty,
    stockStatus, nextId, currentUser, assertWarehouseOpen, parseSaved,
  };
  root.Domain = Domain;
  if (typeof module !== 'undefined') module.exports = Domain;
})(typeof window !== 'undefined' ? window : globalThis);
