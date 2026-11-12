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

  const catOf = (state, id) => state.categories.find((c) => c.id === id);

  function categoryPath(state, categoryId) {
    const c = catOf(state, categoryId);
    if (!c) return '';
    const parent = c.parentId && catOf(state, c.parentId);
    return parent ? `${parent.name} › ${c.name}` : c.name;
  }

  function descendantIds(state, categoryId) {
    const ids = new Set([categoryId]);
    state.categories.forEach((c) => { if (c.parentId === categoryId) ids.add(c.id); });
    return ids; // ponytail: 2 ระดับตาม Shared Types; ซ้อนลึกกว่านี้ต้องวนซ้ำ
  }

  function categoryImage(state, categoryId) {
    const c = catOf(state, categoryId);
    if (!c) return null;
    if (c.image) return c.image;
    const parent = c.parentId && catOf(state, c.parentId);
    return (parent && parent.image) || null;
  }
  const imageOf = (state, product) => product.image || categoryImage(state, product.categoryId);

  // แคช haystack ต่อ product เก็บ src คู่กัน — ถ้าชื่อ/รหัส/ยี่ห้อ/รุ่น/หมวดเปลี่ยน src ไม่ตรง จึงสร้างใหม่
  const hayCache = new WeakMap();
  function hayOf(p, path) {
    const src = [p.name, p.code, p.brand, p.model, path].join(' ');
    let e = hayCache.get(p);
    if (!e || e.src !== src) { e = { src, hay: src.toLowerCase() }; hayCache.set(p, e); }
    return e.hay;
  }

  function filterProducts(state, q) {
    const tokens = (q.text || '').toLowerCase().split(/\s+/).filter(Boolean);
    const cats = q.categoryId ? descendantIds(state, q.categoryId) : null;
    const paths = new Map();
    const out = [];
    for (const p of state.products) {
      if (cats && !cats.has(p.categoryId)) continue;
      if (tokens.length) {
        let path = paths.get(p.categoryId);
        if (path === undefined) paths.set(p.categoryId, (path = categoryPath(state, p.categoryId)));
        const hay = hayOf(p, path);
        if (!tokens.every((t) => hay.includes(t))) continue;
      }
      out.push(p);
    }
    return { out, tokens };
  }

  function searchProducts(state, q) {
    const { out, tokens } = filterProducts(state, q);
    const tab = q.tab && q.tab !== 'all' ? q.tab : null;
    const res = tab ? out.filter((p) => stockStatus(state, p, q.whId) === tab) : out;
    const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (!tokens.length) return res.sort(byId);
    const text = tokens.join(' ');
    const rank = (p) => { const n = p.name.toLowerCase(); return n.startsWith(text) ? 0 : n.includes(text) ? 1 : 2; };
    return res.map((p) => [rank(p), p]).sort((a, b) => a[0] - b[0] || byId(a[1], b[1])).map((x) => x[1]);
  }

  function tabCounts(state, q) {
    const c = { all: 0, in: 0, low: 0, out: 0 };
    for (const p of filterProducts(state, q).out) { c.all++; c[stockStatus(state, p, q.whId)]++; }
    return c;
  }

  function kpis(state, whId) {
    let low = 0, out = 0;
    for (const p of state.products) {
      const s = stockStatus(state, p, whId);
      if (s === 'low') low++; else if (s === 'out') out++;
    }
    return {
      low, out,
      pendingApprovals: state.docs.filter((d) => d.type === 'issue' && d.status === 'pending').length,
      openPRs: state.prs.filter((r) => r.status === 'open').length,
    };
  }

  function warehouseOptions(state, lines) {
    const RANK = { full: 0, partial: 1, none: 2, counting: 3 };
    return state.warehouses.map((wh, i) => {
      const total = lines.length;
      let missing = 0, zero = 0;
      for (const l of lines) {
        const have = qtyOf(state, l.productId, wh.id);
        if (l.qty > have) missing++;
        if (have <= 0) zero++;
      }
      const short = wh.countId ? 'counting' : missing === 0 ? 'full' : zero === total ? 'none' : 'partial';
      return { wh, short, missing, total, i };
    }).sort((a, b) => RANK[a.short] - RANK[b.short] || a.i - b.i).map(({ i, ...o }) => o);
  }

  const Domain = {
    DomainError, unitAbbr, formatQty, validateQty, stockKey, qtyOf, totalQty,
    stockStatus, nextId, currentUser, assertWarehouseOpen, parseSaved,
    categoryPath, descendantIds, searchProducts, tabCounts, kpis, warehouseOptions, imageOf, categoryImage,
  };
  root.Domain = Domain;
  if (typeof module !== 'undefined') module.exports = Domain;
})(typeof window !== 'undefined' ? window : globalThis);
