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

  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

  function checkCatName(state, name, parentId, selfId) {
    const n = String(name ?? '').trim().replace(/\s+/g, ' ');
    if (!n) throw new DomainError('cat_name', 'ใส่ชื่อหมวดก่อน');
    if (state.categories.some((c) => c.id !== selfId && (c.parentId || null) === (parentId || null) && norm(c.name) === norm(n)))
      throw new DomainError('cat_dup', `มีหมวด "${n}" อยู่แล้ว`);
    return n;
  }

  function addCategory(state, { name, parentId = null, icon, color, image } = {}) {
    if (parentId) {
      const p = catOf(state, parentId);
      if (!p || p.parentId) throw new DomainError('cat_depth', 'หมวดย่อยซ้อนได้ชั้นเดียว');
    }
    const n = checkCatName(state, name, parentId);
    const order = Math.max(0, ...state.categories.filter((c) => (c.parentId || null) === (parentId || null)).map((c) => c.order || 0)) + 1;
    const cat = { id: nextId(state, 'C'), name: n, parentId: parentId || null, icon: icon || 'pi-tag', color: color || '#82d2b3', order, image: image ?? null };
    state.categories.push(cat);
    return cat;
  }

  function updateCategory(state, id, patch) {
    const c = catOf(state, id);
    if (!c) throw new DomainError('cat_missing', 'ไม่พบหมวดนี้');
    if ('name' in patch) c.name = checkCatName(state, patch.name, c.parentId, c.id);
    for (const k of ['icon', 'color', 'order', 'image']) if (k in patch) c[k] = patch[k];
    return c;
  }

  function productCounts(state) {
    const m = new Map();
    for (const p of state.products) {
      const c = catOf(state, p.categoryId);
      for (const id of [p.categoryId, c && c.parentId]) if (id) m.set(id, (m.get(id) || 0) + 1);
    }
    return m;
  }

  function deleteCategory(state, id, opts = {}) {
    const c = catOf(state, id);
    if (!c) throw new DomainError('cat_missing', 'ไม่พบหมวดนี้');
    const subs = state.categories.filter((x) => x.parentId === id);
    const prods = state.products.filter((p) => p.categoryId === id);
    const n = (productCounts(state).get(id) || 0), m = subs.length;
    if (!n && !m) { state.categories.splice(state.categories.indexOf(c), 1); return { movedProducts: 0 }; }
    const to = opts.moveTo && catOf(state, opts.moveTo);
    if (!opts.moveTo) throw new DomainError('cat_in_use', `หมวดนี้มีสินค้า ${n} รายการ และหมวดย่อย ${m} หมวด เลือกหมวดที่จะย้ายไปก่อน`);
    if (!to || descendantIds(state, id).has(to.id)) throw new DomainError('cat_move_invalid', 'เลือกหมวดปลายทางอื่น');
    // สินค้าของหมวดย่อยที่ถูก reparent ยังอยู่กับหมวดย่อยนั้น; เฉพาะสินค้าตรงของหมวดนี้ที่ย้าย
    prods.forEach((p) => { p.categoryId = to.id; });
    subs.forEach((s) => { s.parentId = to.parentId || to.id; });
    state.categories.splice(state.categories.indexOf(c), 1);
    return { movedProducts: prods.length };
  }

  function findSimilar(state, name) {
    const q = norm(name);
    if (q.length < 3) return [];
    return state.products.filter((p) => {
      const n = norm(p.name);
      return n !== q && n.length >= 3 && (n.includes(q) || q.includes(n));
    }).slice(0, 5);
  }

  function checkProduct(state, p, selfId) {
    if (!norm(p.name) || !p.unit) throw new DomainError('prod_required', 'ใส่ชื่อและเลือกหน่วยก่อน');
    const dup = state.products.find((x) => x.id !== selfId && norm(x.name) === norm(p.name));
    if (dup) throw new DomainError('prod_dup', `มีสินค้านี้แล้ว: ${dup.id} ${dup.name}`);
    if (!catOf(state, p.categoryId)) throw new DomainError('cat_required', 'เลือกหมวดหมู่ก่อน');
  }
  function checkCode(state, code, selfId) {
    if (state.products.some((x) => x.id !== selfId && x.code === code)) throw new DomainError('code_dup', `รหัสนี้ใช้แล้ว: ${code}`);
  }

  function addProduct(state, input, actor) {
    checkProduct(state, input, null);
    const ini = input.initial;
    if (ini) { assertWarehouseOpen(state, ini.whId); validateQty(ini.qty, input.unit); } // ตรวจก่อนสร้าง จะได้ไม่เหลือสินค้าครึ่งๆ กลางๆ
    const code = String(input.code ?? '').trim();
    if (code) checkCode(state, code, null);
    const id = nextId(state, 'P');
    const product = {
      id, code: code || id, name: String(input.name).trim(), brand: input.brand || '', model: input.model || '',
      unit: input.unit, categoryId: input.categoryId, reorderPoint: input.reorderPoint ?? 0,
      image: input.image ?? null, createdAt: new Date().toISOString(),
    };
    state.products.push(product);
    const receipt = ini ? receive(state, { whId: ini.whId, lines: [{ productId: id, qty: ini.qty }] }, actor) : null;
    return { product, receipt };
  }

  const openPRs = (state, whId) => state.prs.filter((r) => r.status === 'open' && (!whId || r.whId === whId));

  function applyPR(state, pr, qty) {
    pr.received += qty;
    if (pr.received >= pr.qty) pr.status = 'done';
  }

  function postReceipt(state, doc) {
    for (const l of doc.lines) {
      const k = stockKey(l.productId, doc.whId);
      state.stock[k] = (state.stock[k] || 0) + l.qty;
      const pr = l.prId && state.prs.find((r) => r.id === l.prId);
      if (pr) applyPR(state, pr, l.qty);
    }
  }

  function receive(state, input, actor) {
    const { whId, lines, note } = input;
    if (!lines || !lines.length) throw new DomainError('lines_empty', 'เพิ่มของอย่างน้อย 1 รายการ');
    assertWarehouseOpen(state, whId);
    for (const l of lines) {
      const p = state.products.find((x) => x.id === l.productId);
      if (!p) throw new DomainError('prod_missing', 'ไม่พบสินค้า');
      validateQty(l.qty, p.unit);
      if (l.prId) {
        const pr = state.prs.find((r) => r.id === l.prId);
        if (!pr || pr.productId !== l.productId || pr.whId !== whId)
          throw new DomainError('pr_mismatch', 'รายการต้องซื้อไม่ตรงกับสินค้าหรือคลัง');
      }
    }
    const doc = {
      id: nextId(state, 'RC'), type: 'receive', status: actor.role === 'engineer' ? 'pending' : 'posted', whId,
      lines: lines.map((l) => ({ ...l })), note: note ?? '', by: actor.id, at: new Date().toISOString(),
    };
    if (doc.status === 'posted') postReceipt(state, doc);
    state.docs.push(doc);
    return doc;
  }

  function confirmReceipt(state, docId, actor, accept) {
    if (actor.role === 'engineer') throw new DomainError('forbidden', 'บัญชีนี้ยืนยันยอดไม่ได้ ให้ Store หรือหัวหน้ายืนยัน');
    const doc = state.docs.find((d) => d.id === docId);
    if (!doc || doc.type !== 'receive' || doc.status !== 'pending') throw new DomainError('doc_not_pending', 'เอกสารนี้ไม่ได้รอยืนยัน');
    if (accept) { assertWarehouseOpen(state, doc.whId); postReceipt(state, doc); }
    doc.status = accept ? 'posted' : 'rejected';
    return doc;
  }

  function updateProduct(state, id, patch) {
    const p = state.products.find((x) => x.id === id);
    if (!p) throw new DomainError('prod_missing', 'ไม่พบสินค้านี้');
    const { id: _ignored, ...rest } = patch;
    const next = { ...p, ...rest };
    if ('name' in rest) next.name = String(rest.name).trim();
    checkProduct(state, next, id);
    if ('code' in rest) { next.code = String(rest.code ?? '').trim() || id; checkCode(state, next.code, id); }
    return Object.assign(p, next);
  }

  const Domain = {
    DomainError, unitAbbr, formatQty, validateQty, stockKey, qtyOf, totalQty,
    stockStatus, nextId, currentUser, assertWarehouseOpen, parseSaved,
    categoryPath, descendantIds, searchProducts, tabCounts, kpis, warehouseOptions, imageOf, categoryImage,
    addCategory, updateCategory, deleteCategory, productCounts, findSimilar, addProduct, updateProduct,
    receive, confirmReceipt, openPRs,
  };
  root.Domain = Domain;
  if (typeof module !== 'undefined') module.exports = Domain;
})(typeof window !== 'undefined' ? window : globalThis);
