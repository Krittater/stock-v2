// สินค้า: สร้าง/แก้ (สิทธิ์ ล็อกหน่วย) · เลิกใช้ · รูป — โหลดหลัง js/domain/scan.js
(function (root) {
  const D = root.Domain || require('../domain.js');
  const { DomainError, nextId, norm, catOf, formatQty, log } = D;
  const r2 = (n) => +n.toFixed(2);
  const isHead = (a) => !!a && a.role === 'head';
  const isStaff = (a) => !!a && (a.role === 'head' || a.role === 'store');
  const forbidden = () => new DomainError('forbidden', D.FORBIDDEN);
  const MSG_PHOTO_MAX = 'ใส่รูปได้ไม่เกิน 3 รูปต่อสินค้า';
  const MSG_PHOTO_MORE = 'เพิ่มรูปที่ 2-3 ได้เฉพาะคลังสินค้าและหัวหน้า';

  const productOf = (state, id) => {
    const p = state.products.find((x) => x.id === id);
    if (!p) throw new DomainError('prod_missing', 'ไม่พบสินค้านี้');
    return p;
  };

  // ยอดของสินค้านี้ทุกคลัง ทุกชั้น (รวมชั้นรอตรวจ และความยาวม้วน)
  function stockAnywhere(state, id) {
    let t = 0;
    for (const [k, q] of Object.entries(state.stock)) if (k.startsWith(id + '|')) t += q;
    for (const r of state.rolls) if (r.productId === id) t += r.length;
    return r2(t);
  }

  // มีประวัติ = ใบเบิก/รับ/ปรับ, คืนของ, ม้วน, รายการต้องซื้อ, รอบนับ (รวมรอบยืนยันยอดตั้งต้น) อ้างถึงสินค้านี้
  function hasHistory(state, id) {
    const inLines = (list) => (list || []).some((x) => (x.lines || []).some((l) => l.productId === id));
    return inLines(state.docs) || inLines(state.returns) || inLines(state.counts)
      || state.rolls.some((r) => r.productId === id) || state.prs.some((r) => r.productId === id)
      || (state.ccs || []).some((c) => c.productId === id);
  }

  function catApproval(state, categoryId) {
    const c = catOf(state, categoryId);
    return !!c && (!!c.needsApproval || (!!c.parentId && catApproval(state, c.parentId)));
  }

  // ---- ตรวจค่า ----
  function checkName(state, name, selfId) {
    if (!norm(name)) throw new DomainError('prod_required', 'กรุณาระบุชื่อสินค้า');
    const dup = state.products.find((x) => x.id !== selfId && norm(x.name) === norm(name));
    if (dup) throw new DomainError('prod_dup', `มีสินค้าชื่อนี้แล้ว: ${dup.id}`);
  }
  function checkVendor(state, vendorCode, selfId) {
    const v = norm(vendorCode);
    const dup = v && state.products.find((x) => x.id !== selfId && norm(x.vendorCode) === v);
    if (dup) throw new DomainError('vendor_dup', `บาร์โค้ดนี้เป็นของ ${dup.id} ${dup.name}`);
  }
  function checkCode(state, code, selfId) {
    if (state.products.some((x) => x.id !== selfId && x.code === code)) throw new DomainError('code_dup', `รหัสนี้ใช้แล้ว: ${code}`);
  }
  const bad = (msg) => new DomainError('num_invalid', msg);
  // ตรวจเฉพาะ key ที่ระบุ (แก้สินค้าเดิมไม่ไปติดข้อมูลเก่าที่ไม่เกี่ยว)
  function checkNums(n, keys) {
    if (keys.includes('rollSize') && n.isRoll && !(n.rollSize > 0)) throw bad('ความยาวม้วนต้องมากกว่า 0');
    if (keys.includes('scrapMin') && !(n.scrapMin >= 0)) throw bad('เศษม้วนที่ถือเป็นของเสียต้องไม่ติดลบ');
    if (keys.includes('buyFactor') && !(n.buyFactor >= 1)) throw bad('1 หน่วยสั่งซื้อต้องเท่ากับอย่างน้อย 1 หน่วย');
    if (keys.includes('reorderPoint') && !(n.reorderPoint >= 0)) throw bad('จุดสั่งซื้อต้องไม่ติดลบ');
  }

  function addProduct(state, input, actor) {
    checkName(state, input.name);
    const isRoll = !!input.isRoll;
    const unit = isRoll ? 'เมตร' : String(input.unit ?? '').trim();
    if (!unit) throw new DomainError('prod_required', 'กรุณาเลือกหน่วย');
    if (!catOf(state, input.categoryId)) throw new DomainError('cat_required', 'กรุณาเลือกหมวดหมู่');
    const vendorCode = String(input.vendorCode ?? '').trim();
    checkVendor(state, vendorCode, null);
    const code = String(input.code ?? '').trim();
    if (code) checkCode(state, code, null);
    const photos = (input.photos || []).filter(Boolean);
    if (photos.length > 3) throw new DomainError('photo_max', MSG_PHOTO_MAX);
    if (photos.length > 1 && !isStaff(actor)) throw new DomainError('forbidden', MSG_PHOTO_MORE);
    const id = nextId(state, 'P');
    const product = {
      id, code: code || id, name: String(input.name).trim().replace(/\s+/g, ' '), brand: String(input.brand ?? '').trim(), model: String(input.model ?? '').trim(),
      unit, categoryId: input.categoryId, reorderPoint: input.reorderPoint ?? 0,
      image: input.image ?? null, createdAt: new Date().toISOString(),
      isRoll, rollSize: input.rollSize ?? 100, scrapMin: isRoll ? (input.scrapMin ?? 3) : 0,
      active: true, needsApproval: catApproval(state, input.categoryId) || (isHead(actor) && input.needsApproval === true),
      vendorCode, note: String(input.note ?? '').trim(), buyUnit: input.buyUnit || unit, buyFactor: input.buyFactor ?? 1, photos,
    };
    try { checkNums(product, ['rollSize', 'scrapMin', 'buyFactor', 'reorderPoint']); } catch (e) { state.counters.P--; throw e; }
    state.products.push(product);
    let opening = null;
    const ini = input.initial;
    if (ini) {
      // submitOpening ตรวจครบก่อนแตะข้อมูล; ไม่ผ่าน = ถอยสินค้าและเลข P ไม่เหลืออะไร
      try { opening = D.submitOpening(state, { productId: id, whId: ini.whId, qty: ini.qty, rollLengths: ini.rollLengths, kind: 'opening' }, actor); }
      catch (e) { state.products.pop(); state.counters.P--; throw e; }
    }
    log(state, actor, 'product.add', id, 'สร้างสินค้า ' + product.name);
    return { product, opening };
  }

  const STORE_FIELDS = new Set(['name', 'brand', 'model', 'vendorCode', 'note']);
  const BOOL = new Set(['isRoll', 'needsApproval']);
  const LABEL = {
    name: 'ชื่อ', brand: 'ยี่ห้อ', model: 'รุ่น', vendorCode: 'บาร์โค้ด', note: 'หมายเหตุ', code: 'รหัส', unit: 'หน่วย', categoryId: 'หมวด',
    needsApproval: 'ต้องอนุมัติ', buyUnit: 'หน่วยสั่งซื้อ', buyFactor: 'อัตราหน่วยสั่งซื้อ', reorderPoint: 'จุดสั่งซื้อ', isRoll: 'สายม้วน', rollSize: 'ความยาวม้วน', scrapMin: 'เศษม้วน',
  };

  function updateProduct(state, id, patch, actor) {
    const p = productOf(state, id);
    if (!isStaff(actor)) throw forbidden();
    // photos/active มีทางของตัวเอง (addPhoto/setProductActive) ไม่ให้ลอดผ่าน patch
    const { id: _id, photos: _ph, active: _ac, ...rest } = patch;
    const ch = {};
    for (const [k, raw] of Object.entries(rest)) {
      const v = BOOL.has(k) ? !!raw : typeof raw === 'string' ? (k === 'name' ? raw.trim().replace(/\s+/g, ' ') : raw.trim()) : raw;
      const cur = BOOL.has(k) ? !!p[k] : p[k];
      if (v !== cur && !(v === '' && cur == null)) ch[k] = v;
    }
    if (actor.role === 'store' && Object.keys(ch).some((k) => !STORE_FIELDS.has(k))) throw forbidden();
    if ('name' in ch) checkName(state, ch.name, id);
    if ('vendorCode' in ch) checkVendor(state, ch.vendorCode, id);
    if ('code' in ch) { ch.code = ch.code || id; if (ch.code !== p.code) checkCode(state, ch.code, id); else delete ch.code; }
    if ('categoryId' in ch && !catOf(state, ch.categoryId)) throw new DomainError('cat_required', 'กรุณาเลือกหมวดหมู่');
    if ('unit' in ch && !ch.unit) throw new DomainError('prod_required', 'กรุณาเลือกหน่วย');
    const next = { ...p, ...ch };
    if (next.isRoll && 'isRoll' in ch && !('unit' in ch)) ch.unit = next.unit = 'เมตร'; // เปิดสายม้วนโดยไม่ระบุหน่วย = ใช้เมตร
    if (next.unit === p.unit) delete ch.unit;
    if ((('unit' in ch) || ('isRoll' in ch)) && (stockAnywhere(state, id) > 0 || hasHistory(state, id)))
      throw new DomainError('unit_locked', 'เปลี่ยนหน่วยไม่ได้ เพราะมีของหรือมีประวัติแล้ว');
    if (next.isRoll && next.unit !== 'เมตร') throw new DomainError('roll_unit', 'สายม้วนต้องใช้หน่วยเมตร');
    if ('buyUnit' in ch && !ch.buyUnit) { ch.buyUnit = next.unit; if (ch.buyUnit === p.buyUnit) delete ch.buyUnit; } // ว่าง = ใช้หน่วยหลัก
    // ย้ายเข้าหมวดที่ต้องอนุมัติ = ติ๊กตาม; ย้ายออกไม่ปลด (เหมือนตอนติ๊กหมวด)
    if ('categoryId' in ch && catApproval(state, ch.categoryId) && !p.needsApproval) ch.needsApproval = true;
    checkNums(next, [...Object.keys(ch), ...('isRoll' in ch ? ['rollSize'] : [])]);
    const keys = Object.keys(ch);
    if (!keys.length) return p;
    const diff = keys.map((k) => `${LABEL[k] || k}: ${p[k] ?? '-'} → ${ch[k]}`).join(', ');
    Object.assign(p, ch);
    log(state, actor, 'product.update', id, `แก้ไขสินค้า ${p.name} (${diff})`);
    return p;
  }

  function setProductActive(state, id, active, actor) {
    if (!isHead(actor)) throw forbidden();
    const p = productOf(state, id);
    if (!active) {
      // ของกันไว้ให้ใบเบิกอยู่ในยอดจริงเสมอ ถ้ายอดเป็น 0 จึงไม่มีของกันค้าง
      const pend = state.docs.find((d) => d.type === 'receive' && d.status === 'pending' && d.lines.some((l) => l.productId === id));
      if (pend) throw new DomainError('prod_pending', `เลิกใช้ไม่ได้ ใบรับ ${pend.id} ยังรอยืนยัน`);
      const pr = state.prs.find((r) => r.status === 'open' && r.productId === id);
      if (pr) throw new DomainError('prod_pending', `เลิกใช้ไม่ได้ รายการต้องซื้อ ${pr.id} ยังเปิดอยู่`);
      const left = stockAnywhere(state, id);
      if (left > 0) throw new DomainError('prod_has_stock', `เลิกใช้ไม่ได้ ยังมีของเหลือ ${formatQty(left, p.unit)} ต้องใช้หรือปรับยอดให้เป็น 0 ก่อน`);
    }
    p.active = !!active;
    log(state, actor, 'product.active', id, (active ? 'เปิดใช้สินค้า ' : 'เลิกใช้สินค้า ') + p.name);
    return p;
  }

  function addPhoto(state, id, dataUrl, actor) {
    const p = productOf(state, id);
    if (!actor) throw forbidden();
    if (!dataUrl || typeof dataUrl !== 'string') throw new DomainError('photo_invalid', 'ไม่พบรูป');
    p.photos = p.photos || [];
    if (p.photos.length >= 3) throw new DomainError('photo_max', MSG_PHOTO_MAX);
    if (p.photos.length > 0 && !isStaff(actor)) throw new DomainError('forbidden', MSG_PHOTO_MORE);
    p.photos.push(dataUrl);
    log(state, actor, 'product.photo', id, `เพิ่มรูป ${p.name} (${p.photos.length}/3)`);
    return p;
  }

  function removePhoto(state, id, index, actor) {
    const p = productOf(state, id);
    if (!isStaff(actor)) throw new DomainError('forbidden', 'ลบรูปได้เฉพาะคลังสินค้าและหัวหน้า');
    if (!p.photos || !p.photos[index]) throw new DomainError('photo_invalid', 'ไม่พบรูปนี้');
    p.photos.splice(index, 1);
    log(state, actor, 'product.photo', id, `ลบรูป ${p.name} (${p.photos.length}/3)`);
    return p;
  }

  Object.assign(D, { addProduct, updateProduct, hasHistory, setProductActive, addPhoto, removePhoto });
  if (typeof module !== 'undefined') module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
