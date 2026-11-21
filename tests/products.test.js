const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./_load.js');
const Seed = require('../mockup/js/seed.js');

const base = () => {
  const s = Seed.build({ products: 50 });
  const U = (r) => s.users.find((u) => u.role === r);
  return { s, eng: U('engineer'), store: U('store'), head: U('head'), cat: s.categories.find((c) => c.parentId).id };
};
const mk = (b, over = {}, who = b.head) => D.addProduct(b.s, { name: 'ของทดสอบ ' + b.s.products.length, unit: 'ตัว', categoryId: b.cat, ...over }, who).product;
const msg = (m) => ({ message: m });

test('PD-AC1 engineer creates a product, usable at once', () => {
  const b = base();
  const { product, opening } = D.addProduct(b.s, { name: 'น็อตสแตนเลส M8', unit: 'ตัว', categoryId: b.cat }, b.eng);
  assert.equal(product.id, 'P-0051'); assert.equal(product.active, true); assert.equal(product.needsApproval, false); assert.equal(opening, null);
  assert.ok(D.searchProducts(b.s, { text: 'น็อตสแตนเลส', whId: 'W-BN' }).includes(product));
  assert.ok(b.s.audit.some((a) => a.action === 'product.add' && a.ref === 'P-0051'));
});
test('PD-AC2 missing name / unit / category are refused in Thai', () => {
  const { s, head, cat } = base();
  assert.throws(() => D.addProduct(s, { name: ' ', unit: 'ตัว', categoryId: cat }, head), msg('กรุณาระบุชื่อสินค้า'));
  assert.throws(() => D.addProduct(s, { name: 'x', unit: '', categoryId: cat }, head), msg('กรุณาเลือกหน่วย'));
  assert.throws(() => D.addProduct(s, { name: 'x', unit: 'ตัว', categoryId: null }, head), msg('กรุณาเลือกหมวดหมู่'));
});
test('PD-AC3 exact duplicate name (case/space) is refused with the code', () => {
  const { s, head, cat } = base();
  const p = s.products[0];
  assert.throws(() => D.addProduct(s, { name: '  ' + p.name.toUpperCase() + ' ', unit: 'เมตร', categoryId: cat }, head), msg('มีสินค้าชื่อนี้แล้ว: ' + p.id));
  assert.equal(D.findSimilar(s, p.name.toLowerCase())[0].exact, true);
});
test('PD-AC4 findSimilar: shape, >=35%, max 5, exact first, no inactive', () => {
  const { s, head } = base();
  const r = D.findSimilar(s, 'สายไฟ THW 1.5');
  assert.ok(r.length > 0 && r.length <= 5);
  assert.ok(r.every((x) => x.product && x.pct >= 35 && x.pct <= 100 && typeof x.exact === 'boolean'));
  assert.ok(r.every((x, i) => i === 0 || r[i - 1].pct >= x.pct || r[i - 1].exact));
  const first = r[0].product;
  first.active = false;
  assert.ok(!D.findSimilar(s, 'สายไฟ THW 1.5').some((x) => x.product.id === first.id));
});
test('PD-AC5 roll forces unit เมตร, numeric fields checked', () => {
  const b = base();
  const p = D.addProduct(b.s, { name: 'สายม้วนใหม่', unit: 'ตัว', categoryId: b.cat, isRoll: true, rollSize: 50 }, b.head).product;
  assert.equal(p.unit, 'เมตร'); assert.equal(p.rollSize, 50);
  const bad = (over) => () => D.addProduct(b.s, { name: 'พัง', unit: 'ตัว', categoryId: b.cat, ...over }, b.head);
  assert.throws(bad({ isRoll: true, rollSize: 0 }), { code: 'num_invalid' });
  assert.throws(bad({ buyFactor: 0 }), { code: 'num_invalid' });
  assert.throws(bad({ reorderPoint: -1 }), { code: 'num_invalid' });
  assert.throws(bad({ isRoll: true, scrapMin: -1 }), { code: 'num_invalid' });
  assert.equal(mk(b).buyUnit, 'ตัว');
});
test('PD-AC6 duplicate category name is refused (UI then reuses the old one)', () => {
  const { s, head } = base();
  assert.throws(() => D.addCategory(s, { name: s.categories[0].name.toUpperCase() + ' ' }, head), { code: 'cat_dup' });
});
test('PD-AC7 photo limits on create: engineer 1, store/head 3, never more than 3', () => {
  const b = base();
  const ph = (n) => Array.from({ length: n }, (_, i) => 'data:image/png;base64,' + i);
  assert.equal(mk(b, { photos: ph(1) }, b.eng).photos.length, 1);
  assert.throws(() => mk(b, { photos: ph(2) }, b.eng), msg('เพิ่มรูปที่ 2-3 ได้เฉพาะคลังสินค้าและหัวหน้า'));
  assert.equal(mk(b, { photos: ph(3) }, b.store).photos.length, 3);
  assert.throws(() => mk(b, { photos: ph(4) }, b.head), msg('ใส่รูปได้ไม่เกิน 3 รูปต่อสินค้า'));
});
test('PD-AC8 head ticks needsApproval on an existing product', () => {
  const b = base();
  assert.equal(D.updateProduct(b.s, 'P-0007', { needsApproval: true }, b.head).needsApproval, true);
});
test('PD-AC9 engineer cannot edit; first photo yes, 2nd/3rd and remove need Store/head', () => {
  const b = base(); const p = mk(b);
  assert.throws(() => D.updateProduct(b.s, p.id, { note: 'x' }, b.eng), msg(D.FORBIDDEN));
  assert.throws(() => D.updateProduct(b.s, p.id, {}, b.eng), { code: 'forbidden' });
  D.addPhoto(b.s, p.id, 'data:a', b.eng); assert.deepEqual(p.photos, ['data:a']);
  assert.throws(() => D.addPhoto(b.s, p.id, 'data:b', b.eng), msg('เพิ่มรูปที่ 2-3 ได้เฉพาะคลังสินค้าและหัวหน้า'));
  D.addPhoto(b.s, p.id, 'data:b', b.store); D.addPhoto(b.s, p.id, 'data:c', b.head);
  assert.throws(() => D.addPhoto(b.s, p.id, 'data:d', b.head), msg('ใส่รูปได้ไม่เกิน 3 รูปต่อสินค้า'));
  assert.throws(() => D.removePhoto(b.s, p.id, 0, b.eng), msg('ลบรูปได้เฉพาะคลังสินค้าและหัวหน้า'));
  D.removePhoto(b.s, p.id, 0, b.store); assert.deepEqual(p.photos, ['data:b', 'data:c']);
  assert.equal(D.imageOf(b.s, p), 'data:b');
});
test('PD-AC10 / Q5 unit and roll switch locked once there is stock or history', () => {
  const b = base(); const LOCK = 'เปลี่ยนหน่วยไม่ได้ เพราะมีของหรือมีประวัติแล้ว';
  assert.throws(() => D.updateProduct(b.s, 'P-0001', { unit: 'ม้วน' }, b.head), msg(LOCK));
  assert.throws(() => D.updateProduct(b.s, 'P-0001', { isRoll: false }, b.head), msg(LOCK));
  assert.equal(D.updateProduct(b.s, 'P-0001', { unit: 'เมตร', note: 'ก' }, b.head).unit, 'เมตร'); // ค่าเดิมไม่นับว่าเปลี่ยน
  const free = mk(b);
  assert.equal(D.hasHistory(b.s, free.id), false);
  assert.equal(D.updateProduct(b.s, free.id, { unit: 'กล่อง' }, b.head).unit, 'กล่อง');
  const hist = mk(b); // ไม่มีของ แต่มีใบเบิกอ้างถึง
  D.issue(b.s, { whId: 'W-BN', jobId: 'J-25-010', lines: [{ productId: hist.id, qty: 1 }] }, b.head);
  assert.equal(D.hasHistory(b.s, hist.id), true);
  assert.throws(() => D.updateProduct(b.s, hist.id, { unit: 'ชิ้น' }, b.head), msg(LOCK));
  const qc = mk(b); b.s.stock[`${qc.id}|W-BN|QC`] = 3; // ของบนชั้นรอตรวจก็ล็อก
  assert.throws(() => D.updateProduct(b.s, qc.id, { unit: 'ชิ้น' }, b.head), msg(LOCK));
});
test('Q4 parent category ticked: new product in a sub-category inherits; non-head cannot tick', () => {
  const b = base();
  const sub = b.s.categories.find((c) => c.parentId); const parent = b.s.categories.find((c) => c.id === sub.parentId);
  const before = mk({ ...b, cat: sub.id });
  assert.throws(() => D.updateCategory(b.s, parent.id, { needsApproval: true }, b.store), msg(D.FORBIDDEN));
  D.updateCategory(b.s, parent.id, { needsApproval: true }, b.head);
  assert.equal(before.needsApproval, true); // สินค้าเดิมในหมวดย่อยติ๊กตาม
  assert.equal(mk({ ...b, cat: sub.id }).needsApproval, true);
  D.updateCategory(b.s, parent.id, { needsApproval: false }, b.head);
  assert.equal(before.needsApproval, true); // เอาติ๊กออกไม่ปลดสินค้า
  assert.equal(mk({ ...b, cat: sub.id }).needsApproval, false);
  assert.equal(mk(b, { needsApproval: true }, b.head).needsApproval, true);
  assert.equal(mk(b, { needsApproval: true }, b.eng).needsApproval, false); // ไม่ใช่หัวหน้า = ไม่สนใจ ไม่ error
  assert.ok(b.s.audit.some((a) => a.action === 'category.update' && /ต้องอนุมัติ/.test(a.text)));
});
test('Q6 only head deactivates, only at zero stock; hidden from lists, reactivate ok', () => {
  const b = base();
  const p = mk(b, { initial: { whId: 'W-BN', qty: 5 } });
  assert.throws(() => D.setProductActive(b.s, p.id, false, b.store), msg(D.FORBIDDEN));
  assert.throws(() => D.setProductActive(b.s, p.id, false, b.head), (e) => e.code === 'prod_has_stock' && e.message.includes('5'));
  D.issue(b.s, { whId: 'W-BN', jobId: 'J-25-010', lines: [{ productId: p.id, qty: 5 }] }, b.head);
  const k0 = D.kpis(b.s, 'W-BN'), c0 = D.tabCounts(b.s, { whId: 'W-BN' }).all;
  D.setProductActive(b.s, p.id, false, b.head);
  assert.equal(p.active, false);
  assert.ok(!D.searchProducts(b.s, { whId: 'W-BN' }).includes(p));
  assert.ok(D.searchProducts(b.s, { whId: 'W-BN', includeInactive: true }).includes(p));
  assert.equal(D.tabCounts(b.s, { whId: 'W-BN' }).all, c0 - 1);
  assert.equal(D.kpis(b.s, 'W-BN').out, k0.out - 1); assert.equal(D.kpis(b.s, 'W-BN', { includeInactive: true }).out, k0.out);
  assert.equal(D.warehouseOptions(b.s, [{ productId: p.id, qty: 1 }])[0].short, 'full');
  D.setProductActive(b.s, p.id, true, b.head); assert.equal(p.active, true);
  assert.equal(b.s.audit.filter((a) => a.action === 'product.active').length, 2);
});
test('Q7 permissions: store edits text fields only, head everything, unchanged values do not count', () => {
  const b = base(); const p = mk(b, { brand: 'A' });
  const whole = { name: p.name, brand: p.brand, model: p.model, vendorCode: p.vendorCode, note: p.note, unit: p.unit, categoryId: p.categoryId, reorderPoint: p.reorderPoint, buyUnit: p.buyUnit, buyFactor: p.buyFactor, isRoll: p.isRoll, rollSize: p.rollSize, scrapMin: p.scrapMin, needsApproval: p.needsApproval };
  assert.equal(D.updateProduct(b.s, p.id, { ...whole, brand: 'B', note: 'ตู้ 3' }, b.store).brand, 'B');
  const other = { unit: 'กล่อง', categoryId: b.s.categories[0].id, needsApproval: true, buyUnit: 'ลัง', buyFactor: 5, reorderPoint: 9, isRoll: true, rollSize: 7, scrapMin: 2 };
  for (const [k, v] of Object.entries(other)) assert.throws(() => D.updateProduct(b.s, p.id, { [k]: v }, b.store), { code: 'forbidden' }, k);
  const r = D.updateProduct(b.s, p.id, { reorderPoint: 12, buyUnit: 'ลัง', buyFactor: 6 }, b.head);
  assert.equal(r.reorderPoint, 12); assert.equal(r.buyFactor, 6);
  assert.throws(() => D.updateProduct(b.s, p.id, { buyFactor: 0 }, b.head), { code: 'num_invalid' });
  const log = b.s.audit.filter((a) => a.action === 'product.update').pop();
  assert.ok(log.text.includes('จุดสั่งซื้อ') && log.text.includes('12'));
});
test('PD-G4 vendorCode duplicates are refused on add and update; name checks on update', () => {
  const b = base();
  const a = mk(b, { vendorCode: '8851234567890' });
  assert.throws(() => mk(b, { vendorCode: '8851234567890' }), msg(`บาร์โค้ดนี้เป็นของ ${a.id} ${a.name}`));
  const c = mk(b);
  assert.throws(() => D.updateProduct(b.s, c.id, { vendorCode: '8851234567890' }, b.store), msg(`บาร์โค้ดนี้เป็นของ ${a.id} ${a.name}`));
  assert.equal(D.updateProduct(b.s, a.id, { vendorCode: '8851234567890', note: 'ok' }, b.store).note, 'ok'); // ของตัวเองไม่ชน
  assert.throws(() => D.updateProduct(b.s, c.id, { name: '  ' }, b.head), msg('กรุณาระบุชื่อสินค้า'));
  assert.throws(() => D.updateProduct(b.s, c.id, { name: a.name.toUpperCase() }, b.store), msg('มีสินค้าชื่อนี้แล้ว: ' + a.id));
  assert.equal(D.parseScan(b.s, '8851234567890').id, a.id);
});
test('initial stock: engineer pending, store posted, rolls by length, bad initial leaves no product', () => {
  const b = base();
  const e = D.addProduct(b.s, { name: 'ตั้งต้น 1', unit: 'ตัว', categoryId: b.cat, initial: { whId: 'W-BN', qty: 10 } }, b.eng);
  assert.equal(e.opening.cc.stage, 'store'); assert.equal(D.qtyOf(b.s, e.product.id, 'W-BN'), 0);
  const r = D.addProduct(b.s, { name: 'สายตั้งต้น', unit: 'เมตร', isRoll: true, categoryId: b.cat, initial: { whId: 'W-BN', rollLengths: [100, 40] } }, b.store);
  assert.equal(D.qtyOf(b.s, r.product.id, 'W-BN'), 140); assert.equal(r.opening.cc, null);
  const n = b.s.products.length, pc = b.s.counters.P, nd = b.s.docs.length, rc = b.s.counters.CC, na = b.s.audit.length;
  for (const initial of [{ whId: 'W-BN', qty: 0 }, { whId: 'W-BN', qty: 1.5 }, { whId: 'W-BN', shelf: 'ไม่มี', qty: 1 }, { whId: 'nope', qty: 1 }])
    assert.throws(() => D.addProduct(b.s, { name: 'พัง', unit: 'ตัว', categoryId: b.cat, initial }, b.store), D.DomainError);
  assert.equal(b.s.products.length, n); assert.equal(b.s.counters.P, pc);
  assert.equal(b.s.docs.length, nd); assert.equal(b.s.counters.CC, rc); assert.equal(b.s.audit.length, na);
});
test('fix1: inactive products get no count line', () => {
  const b = base(); const p = mk(b);
  D.setProductActive(b.s, p.id, false, b.head);
  const c = D.startCount(b.s, { whId: 'W-BN' }, b.head);
  assert.ok(!c.lines.some((l) => l.productId === p.id));
  assert.ok(c.lines.length > 0);
});
test('fix2: deactivate refused while a pending receipt or open PR references it', () => {
  const b = base(); const p = mk(b);
  const doc = D.receive(b.s, { whId: 'W-BN', lines: [{ productId: p.id, qty: 2 }] }, b.eng);
  assert.throws(() => D.setProductActive(b.s, p.id, false, b.head), msg(`เลิกใช้ไม่ได้ ใบรับ ${doc.id} ยังรอยืนยัน`));
  D.confirmReceipt(b.s, doc.id, b.store, false);
  const q = mk(b); b.s.prs.push({ id: 'PR-X1', productId: q.id, whId: 'W-BN', qty: 1, received: 0, status: 'open' });
  assert.throws(() => D.setProductActive(b.s, q.id, false, b.head), msg('เลิกใช้ไม่ได้ รายการต้องซื้อ PR-X1 ยังเปิดอยู่'));
  b.s.prs[b.s.prs.length - 1].status = 'done';
  assert.equal(D.setProductActive(b.s, q.id, false, b.head).active, false);
});
test('fix3: update normalises name, buyUnit default, category move ticks approval', () => {
  const b = base(); const p = mk(b);
  assert.equal(D.updateProduct(b.s, p.id, { name: '  ชื่อ   ใหม่  ' }, b.head).name, 'ชื่อ ใหม่');
  assert.equal(D.updateProduct(b.s, p.id, { buyUnit: 'ลัง' }, b.head).buyUnit, 'ลัง');
  assert.equal(D.updateProduct(b.s, p.id, { buyUnit: '' }, b.head).buyUnit, 'ตัว');
  const cats = b.s.categories.filter((c) => c.parentId);
  const to = cats.find((c) => c.id !== p.categoryId);
  b.s.categories.find((c) => c.id === to.parentId).needsApproval = true; // หมวดแม่ติ๊ก
  assert.equal(p.needsApproval, false);
  assert.equal(D.updateProduct(b.s, p.id, { categoryId: to.id }, b.head).needsApproval, true);
  D.updateProduct(b.s, p.id, { categoryId: b.cat }, b.head);
  assert.equal(p.needsApproval, true); // ย้ายออกไม่ปลด
});
test('fix4: hasHistory via return, count line, PR; roll length blocks deactivate', () => {
  const b = base();
  const r = mk(b); assert.equal(D.hasHistory(b.s, r.id), false);
  D.returnLoose(b.s, { productId: r.id, whId: 'W-BN', qty: 1, condition: 'ok', reason: 'ทดสอบ' }, b.head);
  assert.equal(D.hasHistory(b.s, r.id), true);
  const c = mk(b); b.s.counts.push({ id: 'CC-X', lines: [{ productId: c.id, system: 0, counted: null }] });
  assert.equal(D.hasHistory(b.s, c.id), true);
  const q = mk(b); b.s.prs.push({ id: 'PR-X2', productId: q.id, whId: 'W-BN', qty: 1, received: 0, status: 'done' });
  assert.equal(D.hasHistory(b.s, q.id), true);
  const roll = mk(b, { unit: 'เมตร', isRoll: true });
  b.s.rolls.push({ id: 'R-X', productId: roll.id, whId: 'W-A', shelf: 'ทั่วไป', length: 7, opened: false, batch: '', fromRollId: null });
  D.touchRolls(b.s);
  assert.throws(() => D.setProductActive(b.s, roll.id, false, b.head), (e) => e.code === 'prod_has_stock' && e.message.includes('7'));
});
