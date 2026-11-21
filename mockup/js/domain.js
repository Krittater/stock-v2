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

  const DEFAULT_SHELF = 'ทั่วไป';
  const stockKey = (productId, whId, shelf = DEFAULT_SHELF) => `${productId}|${whId}|${shelf}`;
  const shelfList = (state, whId) => {
    const w = state.warehouses.find((x) => x.id === whId);
    return (w && w.shelves) || [{ code: DEFAULT_SHELF, active: true }];
  };
  // ชั้นที่ไม่ใช่ชั้นรอตรวจ (รวมชั้นที่เลิกใช้แล้ว เพราะของอาจยังค้าง) / รหัสชั้นรอตรวจ
  const plainShelves = (state, whId) => shelfList(state, whId).filter((s) => !s.qc).map((s) => s.code);
  const qcCodes = (state, whId) => shelfList(state, whId).filter((s) => s.qc).map((s) => s.code);
  const qcShelf = (state, whId) => shelfList(state, whId).find((s) => s.qc) || null;
  // ชั้นที่เลือกวางของได้ (เปิดอยู่); qc: true รวมชั้นรอตรวจ
  const shelves = (state, whId, { qc = false } = {}) =>
    shelfList(state, whId).filter((s) => s.active !== false && (qc || !s.qc)).map((s) => s.code);

  // ดัชนีม้วนต่อสินค้า (kpis/รายการสินค้าเรียก qtyOf ทีละสินค้า ถ้าไล่ทุกม้วนจะช้า) — สร้างใหม่เมื่อจำนวนม้วนหรือ rollRev เปลี่ยน
  // ผู้ที่เพิ่ม/ลบม้วนต้องเรียก touchRolls(state); แก้ r.length ตรง ๆ ไม่ต้อง
  const NO_ROLLS = [];
  const rollIdx = new WeakMap();
  const touchRolls = (state) => { state.rollRev = (state.rollRev || 0) + 1; };
  function rollsOfProduct(state, productId) {
    const rs = state.rolls;
    if (!rs || !rs.length) return NO_ROLLS;
    const sig = rs.length + ':' + (state.rollRev || 0);
    let e = rollIdx.get(rs);
    if (!e || e.sig !== sig) {
      e = { sig, map: new Map() };
      for (const r of rs) { let a = e.map.get(r.productId); if (!a) e.map.set(r.productId, (a = [])); a.push(r); }
      rollIdx.set(rs, e);
    }
    return e.map.get(productId) || NO_ROLLS;
  }

  const qtyAt = (state, productId, whId, shelf = DEFAULT_SHELF) => {
    let t = state.stock[stockKey(productId, whId, shelf)] || 0;
    for (const r of rollsOfProduct(state, productId)) if (r.whId === whId && r.shelf === shelf) t += r.length;
    return +t.toFixed(2);
  };
  // ยอดที่ใช้ได้จริง = ทุกชั้นยกเว้นชั้นรอตรวจ (รวมความยาวม้วน)
  const qtyOf = (state, productId, whId) => {
    let t = 0;
    for (const code of plainShelves(state, whId)) t += state.stock[stockKey(productId, whId, code)] || 0;
    const qc = qcCodes(state, whId);
    for (const r of rollsOfProduct(state, productId)) if (r.whId === whId && !qc.includes(r.shelf)) t += r.length;
    return +t.toFixed(2);
  };
  // ยอดที่เบิกได้ = ยอดจริง − ของที่กันไว้ให้ใบเบิกที่รอ
  const RESERVING = new Set(['partial', 'waiting', 'ready']);
  const reservedAt = (state, productId, whId) => {
    let t = 0;
    for (const d of state.docs) {
      if (d.type !== 'issue' || d.status !== 'posted' || d.whId !== whId || !RESERVING.has(d.fill)) continue;
      for (const l of d.lines) if (l.productId === productId) t += l.reserved || 0;
    }
    return +t.toFixed(2);
  };
  const available = (state, productId, whId) => Math.max(0, +(qtyOf(state, productId, whId) - reservedAt(state, productId, whId)).toFixed(2));
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
    RT: ['RT-', '69', 4], R: ['R-', '', 6],
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
      return s && s.version === 3 ? s : null;
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
  const imageOf = (state, product) => (product.photos && product.photos[0]) || product.image || categoryImage(state, product.categoryId);

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
      if (p.active === false && !q.includeInactive) continue;
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

  function kpis(state, whId, { includeInactive = false } = {}) {
    let low = 0, out = 0;
    for (const p of state.products) {
      if (p.active === false && !includeInactive) continue;
      const s = stockStatus(state, p, whId);
      if (s === 'low') low++; else if (s === 'out') out++;
    }
    return {
      low, out,
      pendingApprovals: state.docs.filter((d) => d.type === 'issue' && d.status === 'pending').length,
      openPRs: state.prs.filter((r) => r.status === 'open').length,
    };
  }

  function warehouseOptions(state, allLines) {
    const inactive = new Set(state.products.filter((p) => p.active === false).map((p) => p.id));
    const lines = allLines.filter((l) => !inactive.has(l.productId));
    const RANK = { full: 0, partial: 1, none: 2, counting: 3 };
    return state.warehouses.map((wh, i) => {
      const total = lines.length;
      let missing = 0, zero = 0;
      for (const l of lines) {
        const have = available(state, l.productId, wh.id);
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

  function addCategory(state, { name, parentId = null, icon, color, image } = {}, actor) {
    if (parentId) {
      const p = catOf(state, parentId);
      if (!p || p.parentId) throw new DomainError('cat_depth', 'หมวดย่อยซ้อนได้ชั้นเดียว');
    }
    const n = checkCatName(state, name, parentId);
    const order = Math.max(0, ...state.categories.filter((c) => (c.parentId || null) === (parentId || null)).map((c) => c.order || 0)) + 1;
    const cat = { id: nextId(state, 'C'), name: n, parentId: parentId || null, icon: icon || 'pi-tag', color: color || '#82d2b3', order, image: image ?? null };
    state.categories.push(cat);
    Domain.log(state, actor, 'category.add', cat.id, 'สร้างหมวด ' + cat.name);
    return cat;
  }

  function updateCategory(state, id, patch, actor) {
    const c = catOf(state, id);
    if (!c) throw new DomainError('cat_missing', 'ไม่พบหมวดนี้');
    const flag = 'needsApproval' in patch && !!patch.needsApproval !== !!c.needsApproval;
    if (flag && !(actor && actor.role === 'head')) throw new DomainError('forbidden', Domain.FORBIDDEN);
    if ('name' in patch) c.name = checkCatName(state, patch.name, c.parentId, c.id);
    for (const k of ['icon', 'color', 'order', 'image']) if (k in patch) c[k] = patch[k];
    let ticked = 0;
    if (flag) {
      c.needsApproval = !!patch.needsApproval;
      // ติ๊กแล้วสินค้าในหมวด (รวมหมวดย่อย) ติ๊กตาม; เอาติ๊กออกไม่ปลดสินค้า จะได้ไม่ถอนการควบคุมเงียบ ๆ
      if (c.needsApproval) { const ids = descendantIds(state, id); for (const p of state.products) if (ids.has(p.categoryId) && !p.needsApproval) { p.needsApproval = true; ticked++; } }
    }
    if (Object.keys(patch).some((k) => k !== 'order')) Domain.log(state, actor, 'category.update', id, 'แก้ไขหมวด ' + c.name + (flag ? ` ต้องอนุมัติ=${c.needsApproval ? 'เปิด' : 'ปิด'}${ticked ? ` (ติ๊กสินค้า ${ticked} รายการ)` : ''}` : '')); // สลับลำดับอย่างเดียวไม่บันทึก
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

  function deleteCategory(state, id, opts = {}, actor) {
    const c = catOf(state, id);
    if (!c) throw new DomainError('cat_missing', 'ไม่พบหมวดนี้');
    const subs = state.categories.filter((x) => x.parentId === id);
    const prods = state.products.filter((p) => p.categoryId === id);
    const n = (productCounts(state).get(id) || 0), m = subs.length;
    if (!n && !m) { state.categories.splice(state.categories.indexOf(c), 1); Domain.log(state, actor, 'category.delete', id, 'ลบหมวด ' + c.name); return { movedProducts: 0 }; }
    const to = opts.moveTo && catOf(state, opts.moveTo);
    if (!opts.moveTo) throw new DomainError('cat_in_use', `หมวดนี้มีสินค้า ${n} รายการ และหมวดย่อย ${m} หมวด เลือกหมวดที่จะย้ายไปก่อน`);
    if (!to || descendantIds(state, id).has(to.id)) throw new DomainError('cat_move_invalid', 'เลือกหมวดปลายทางอื่น');
    // สินค้าของหมวดย่อยที่ถูก reparent ยังอยู่กับหมวดย่อยนั้น; เฉพาะสินค้าตรงของหมวดนี้ที่ย้าย
    prods.forEach((p) => { p.categoryId = to.id; });
    subs.forEach((s) => { s.parentId = to.parentId || to.id; });
    state.categories.splice(state.categories.indexOf(c), 1);
    Domain.log(state, actor, 'category.delete', id, 'ลบหมวด ' + c.name + ' ย้ายสินค้า ' + prods.length + ' รายการ');
    return { movedProducts: prods.length };
  }

  // ponytail: Dice บน bigram พอสำหรับเตือนชื่อคล้าย ถ้าต้องแม่นกว่านี้ค่อยเปลี่ยนเป็น trigram/ตัดคำไทย
  function similarity(a, b) {
    const grams = (x) => { const t = norm(x).replace(/ /g, ''); const g = []; for (let i = 0; i < t.length - 1; i++) g.push(t.slice(i, i + 2)); return g; };
    const A = grams(a), B = grams(b);
    if (!A.length || !B.length) return 0;
    const pool = B.slice(); let hit = 0;
    for (const g of A) { const i = pool.indexOf(g); if (i >= 0) { hit++; pool.splice(i, 1); } }
    return (2 * hit) / (A.length + B.length);
  }
  // คืนรายการที่คล้าย (ไม่รวมชื่อเดียวกันเป๊ะ) เรียงจากคล้ายสุด ไม่เกิน 5
  function similarByName(items, name, min) {
    const q = norm(name);
    if (q.length < 3) return [];
    return items.filter((p) => norm(p.name) !== q && norm(p.name).length >= 3)
      .map((p) => [p, similarity(p.name, name)]).filter((x) => x[1] >= min)
      .sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => x[0]);
  }
  // สินค้าที่ชื่อคล้าย (ไม่รวมที่เลิกใช้): ชื่อเดียวกัน (exact) ก่อน แล้วเรียงตามความคล้ายมากไปน้อย ≥ 35% ไม่เกิน 5
  function findSimilar(state, name) {
    const q = norm(name);
    if (!q) return [];
    const out = [];
    for (const p of state.products) {
      if (p.active === false) continue;
      const n = norm(p.name);
      if (n === q) { out.push({ product: p, pct: 100, exact: true }); continue; }
      if (q.length < 3 || n.length < 3) continue;
      const pct = Math.round(similarity(p.name, name) * 100);
      if (pct >= 35) out.push({ product: p, pct, exact: false });
    }
    return out.sort((a, b) => (b.exact - a.exact) || b.pct - a.pct).slice(0, 5);
  }
  const similarJobs = (state, name) => similarByName(state.jobs.filter((j) => j.open), name, 0.45);

  function addJob(state, { name, customer } = {}, actor) {
    const n = String(name ?? '').trim().replace(/\s+/g, ' ');
    if (!n) throw new DomainError('job_name', 'ใส่ชื่องานก่อน');
    const job = {
      id: nextId(state, 'J'), name: n, customer: customer || '', open: true,
      ownerId: null, site: '', start: null, due: null, closedAt: null, note: '',
    };
    state.jobs.push(job);
    Domain.log(state, actor, 'job.add', job.id, 'สร้างงาน ' + job.name);
    return job;
  }

  const openPRs = (state, whId) => state.prs.filter((r) => r.status === 'open' && (!whId || r.whId === whId));

  function applyPR(state, pr, qty) {
    pr.received += qty;
    if (pr.received >= pr.qty) pr.status = 'done';
  }

  // ตรวจบรรทัดรับผ่าน stockIn (ชั้นมี/เปิดอยู่ ม้วนถูกต้อง) และความยาวม้วนรวมต้องเท่าจำนวนที่รับ
  function checkReceiveLine(state, whId, l) {
    const ins = Domain.stockIn(state, { productId: l.productId, whId, shelf: l.shelf, qty: l.qty, rollLengths: l.rollLengths, batch: l.batch });
    if (Math.abs(ins.amount - l.qty) > 0.005) throw new DomainError('roll_sum', 'ความยาวม้วนรวมไม่เท่ากับจำนวนที่รับ');
    return ins;
  }

  function postReceipt(state, doc, actor) {
    const ins = doc.lines.map((l) => checkReceiveLine(state, doc.whId, l)); // ตรวจครบก่อนลงยอด
    for (const [i, l] of doc.lines.entries()) {
      ins[i].apply();
      const pr = l.prId && state.prs.find((r) => r.id === l.prId);
      if (pr) applyPR(state, pr, l.qty);
    }
    for (const id of new Set(doc.lines.map((l) => l.productId))) Domain.reserveForWaiting(state, id, doc.whId);
    Domain.log(state, actor, 'receive', doc.id, 'รับของเข้าคลัง ' + doc.whId);
  }

  function receive(state, input, actor) {
    const { whId, lines, note } = input;
    if (!lines || !lines.length) throw new DomainError('lines_empty', 'เพิ่มของอย่างน้อย 1 รายการ');
    assertWarehouseOpen(state, whId);
    for (const l of lines) {
      const p = state.products.find((x) => x.id === l.productId);
      if (!p) throw new DomainError('prod_missing', 'ไม่พบสินค้า');
      validateQty(l.qty, p.unit);
      checkReceiveLine(state, whId, l);
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
    if (doc.status === 'posted') postReceipt(state, doc, actor);
    state.docs.push(doc);
    return doc;
  }

  function confirmReceipt(state, docId, actor, accept) {
    if (actor.role === 'engineer') throw new DomainError('forbidden', 'บัญชีนี้ยืนยันยอดไม่ได้ ให้ Store หรือหัวหน้ายืนยัน');
    const doc = state.docs.find((d) => d.id === docId);
    if (!doc || doc.type !== 'receive' || doc.status !== 'pending') throw new DomainError('doc_not_pending', 'เอกสารนี้ไม่ได้รอยืนยัน');
    if (accept) { assertWarehouseOpen(state, doc.whId); postReceipt(state, doc, actor); }
    doc.status = accept ? 'posted' : 'rejected';
    if (!accept) Domain.log(state, actor, 'receive.reject', doc.id, 'ไม่รับใบรับ');
    return doc;
  }

  const needsApproval = (state, actor) => !!state.settings.requireApproval && actor.role !== 'head';

  // ตัดยอดตามที่มีจริง ส่วนขาดเปิด PR; ตรวจครบแล้วก่อนเรียก จึงไม่ throw กลางทาง
  function postIssue(state, doc, actor) {
    const prs = [];
    let short = 0, got = 0;
    for (const l of doc.lines) {
      l.issued = Math.min(l.qty, available(state, l.productId, doc.whId));
      if (l.issued > 0) { const o = Domain.stockOut(state, { productId: l.productId, whId: doc.whId, qty: l.issued }); l.cuts = o.cuts; l.shelves = o.shelves; got++; }
      l.waiting = +(l.qty - l.issued).toFixed(2); l.reserved = 0;
      if (l.issued < l.qty) {
        short++;
        const pr = { id: nextId(state, 'PR'), productId: l.productId, whId: doc.whId, qty: +(l.qty - l.issued).toFixed(2), received: 0, status: 'open', reqId: doc.id };
        state.prs.push(pr); doc.prIds.push(pr.id); prs.push(pr);
      }
    }
    doc.status = 'posted';
    doc.fill = !short ? 'full' : got ? 'partial' : 'waiting';
    Domain.log(state, actor, 'issue', doc.id, 'เบิกของ ' + doc.lines.length + ' รายการ');
    return { doc, outcome: !short ? 'full' : got ? 'partial' : 'waiting', prs };
  }

  function issue(state, input, actor) {
    const { whId, jobId, lines, note } = input;
    if (!lines || !lines.length) throw new DomainError('lines_empty', 'เพิ่มของอย่างน้อย 1 รายการ');
    if (!whId) throw new DomainError('wh_required', 'เลือกคลังที่เบิกของก่อน');
    const job = jobId && state.jobs.find((j) => j.id === jobId);
    if (!job) throw new DomainError('job_required', 'เลือกงาน / โครงการก่อน');
    if (!job.open) throw new DomainError('job_closed', 'งานนี้ปิดแล้ว เลือกงานอื่น');
    assertWarehouseOpen(state, whId);
    for (const l of lines) {
      const p = state.products.find((x) => x.id === l.productId);
      if (!p) throw new DomainError('prod_missing', 'ไม่พบสินค้า');
      validateQty(l.qty, p.unit);
    }
    const pending = needsApproval(state, actor);
    const doc = {
      id: nextId(state, 'REQ'), type: 'issue', status: pending ? 'pending' : 'posted', whId, jobId,
      lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })), note: note ?? '', by: actor.id,
      at: new Date().toISOString(), prIds: [],
    };
    state.docs.push(doc);
    return pending ? { doc, outcome: 'pending', prs: [] } : postIssue(state, doc, actor);
  }

  function approveIssue(state, docId, actor, approve) {
    if (actor.role !== 'head') throw new DomainError('forbidden', 'เฉพาะหัวหน้าอนุมัติได้');
    const doc = state.docs.find((d) => d.id === docId);
    if (!doc || doc.type !== 'issue' || doc.status !== 'pending') throw new DomainError('doc_not_pending', 'เอกสารนี้ไม่ได้รอยืนยัน');
    if (!approve) { doc.status = 'rejected'; Domain.log(state, actor, 'issue.reject', doc.id, 'ไม่อนุมัติใบเบิก'); return { doc, outcome: 'rejected', prs: [] }; }
    assertWarehouseOpen(state, doc.whId);
    return postIssue(state, doc, actor);
  }

  const diffOf = (l) => +(l.counted - l.system).toFixed(2);

  function startCount(state, { whId, categoryId = null } = {}, actor) {
    if (actor.role === 'engineer') throw new DomainError('forbidden', 'เฉพาะ Store หรือหัวหน้าเปิดรอบนับได้');
    const wh = state.warehouses.find((w) => w.id === whId);
    if (!wh) throw new DomainError('wh_required', 'เลือกคลังที่จะนับก่อน');
    assertWarehouseOpen(state, whId);
    const cats = categoryId ? descendantIds(state, categoryId) : null;
    const count = {
      id: nextId(state, 'CC'), whId, categoryId: categoryId ?? null, status: 'open', by: actor.id, at: new Date().toISOString(),
      lines: state.products.filter((p) => !cats || cats.has(p.categoryId))
        .map((p) => ({ productId: p.id, system: qtyOf(state, p.id, whId), counted: null })),
    };
    state.counts.push(count);
    wh.countId = count.id;
    Domain.log(state, actor, 'count.start', count.id, 'เปิดรอบนับ ' + whId);
    return count;
  }

  function openCount(state, countId) {
    const c = state.counts.find((x) => x.id === countId);
    if (!c) throw new DomainError('count_missing', 'ไม่พบรอบนับ');
    if (c.status !== 'open') throw new DomainError('count_closed', 'รอบนับนี้ปิดแล้ว');
    return c;
  }

  function setCounted(state, countId, productId, qty) {
    const c = openCount(state, countId);
    const line = c.lines.find((l) => l.productId === productId);
    if (!line) throw new DomainError('prod_missing', 'ไม่พบสินค้า');
    if (qty !== null) {
      if (Number.isFinite(qty) && qty < 0) throw new DomainError('qty_invalid', 'จำนวนที่นับต้องไม่ติดลบ');
      if (qty !== 0) validateQty(qty, state.products.find((p) => p.id === productId).unit);
    }
    line.counted = qty;
  }

  function countSummary(count) {
    const done = count.lines.filter((l) => l.counted !== null);
    const diffs = done.map(diffOf).filter((d) => d !== 0);
    return {
      total: count.lines.length, counted: done.length, diffLines: diffs.length,
      diffPlus: +diffs.filter((d) => d > 0).reduce((a, d) => a + d, 0).toFixed(2),
      diffMinus: +diffs.filter((d) => d < 0).reduce((a, d) => a - d, 0).toFixed(2),
    };
  }

  function closeCount(state, countId, actor) {
    if (actor.role === 'engineer') throw new DomainError('forbidden', 'เฉพาะ Store หรือหัวหน้าปิดรอบนับได้');
    const count = openCount(state, countId);
    const changed = count.lines.filter((l) => l.counted !== null && diffOf(l) !== 0);
    let adjust = null;
    // ตรวจส่วนต่างติดลบทุกบรรทัดก่อนแตะยอด จะได้ไม่ค้างครึ่งทาง
    for (const l of changed) {
      if (diffOf(l) < 0 && -diffOf(l) > qtyOf(state, l.productId, count.whId) + 1e-9) throw new DomainError('stock_short', 'ยอดในคลังเปลี่ยนไป ปิดรอบนับไม่ได้');
    }
    if (changed.length) {
      for (const l of changed) {
        const d = diffOf(l);
        if (d > 0) {
          const roll = state.products.find((p) => p.id === l.productId).isRoll;
          Domain.putStock(state, { productId: l.productId, whId: count.whId, qty: d, rollLengths: roll ? [d] : undefined, batch: 'จากการนับ' });
        } else Domain.stockOut(state, { productId: l.productId, whId: count.whId, qty: -d });
      }
      adjust = {
        id: nextId(state, 'ADJ'), type: 'adjust', status: 'posted', whId: count.whId,
        lines: changed.map((l) => ({ productId: l.productId, qty: diffOf(l) })),
        note: 'ปรับยอดจากรอบนับ ' + count.id, by: actor.id, at: new Date().toISOString(),
      };
      state.docs.push(adjust);
      for (const l of changed) if (diffOf(l) > 0) Domain.reserveForWaiting(state, l.productId, count.whId);
    }
    Domain.log(state, actor, 'count.close', count.id, 'ปิดรอบนับ ปรับ ' + changed.length + ' รายการ');
    state.warehouses.find((w) => w.id === count.whId).countId = null;
    count.status = 'closed';
    return { count, adjust };
  }

  function cancelCount(state, countId, actor) {
    if (actor.role === 'engineer') throw new DomainError('forbidden', 'เฉพาะ Store หรือหัวหน้าปิดรอบนับได้');
    const count = openCount(state, countId);
    state.warehouses.find((w) => w.id === count.whId).countId = null;
    count.status = 'cancelled';
    Domain.log(state, actor, 'count.cancel', count.id, 'ยกเลิกรอบนับ');
    return count;
  }

  const Domain = {
    DomainError, unitAbbr, formatQty, validateQty, stockKey, qtyAt, qtyOf, available, totalQty,
    shelves, plainShelves, qcCodes, qcShelf, similarity, touchRolls,
    stockStatus, nextId, currentUser, assertWarehouseOpen, parseSaved,
    categoryPath, descendantIds, catOf, norm, searchProducts, tabCounts, kpis, warehouseOptions, imageOf, categoryImage,
    addCategory, updateCategory, deleteCategory, productCounts, findSimilar,
    receive, confirmReceipt, openPRs, needsApproval, issue, approveIssue, addJob, similarJobs,
    startCount, setCounted, countSummary, closeCount, cancelCount,
  };
  root.Domain = Domain;
  if (typeof module !== 'undefined') module.exports = Domain;
})(typeof window !== 'undefined' ? window : globalThis);
