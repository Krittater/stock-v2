const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../mockup/js/domain.js');
const Seed = require('../mockup/js/seed.js');

function mini() {
  return {
    version: 1,
    counters: { P: 0, REQ: 0, PR: 0, RC: 0, CC: 0, ADJ: 0, J: 0, C: 0 },
    settings: { requireApproval: false },
    currentUserId: 'U-1',
    users: [
      { id: 'U-1', name: 'หัวหน้า', title: 'หัวหน้าคลัง', role: 'head' },
      { id: 'U-2', name: 'สโตร์', title: 'เจ้าหน้าที่คลัง', role: 'store' },
      { id: 'U-3', name: 'วิศวกร', title: 'วิศวกรหน้างาน', role: 'engineer' },
    ],
    warehouses: [
      { id: 'W-BN', name: 'คลังหลัก บางนา', location: 'บางนา', countId: null },
      { id: 'W-A', name: 'คลัง A', location: 'A', countId: null },
    ],
    categories: [],
    products: [{ id: 'P-0001', code: 'P-0001', name: 'สายไฟ', brand: '', model: '', unit: 'เมตร', categoryId: null, reorderPoint: 100, createdAt: '2026-01-01T00:00:00.000Z', image: null }],
    stock: { 'P-0001|W-BN': 1250, 'P-0001|W-A': 50 },
    jobs: [], docs: [], prs: [], counts: [],
    cart: { lines: [], whId: 'W-BN', jobId: '', note: '' },
  };
}

test('formatQty', () => {
  assert.equal(D.formatQty(1250, 'เมตร'), '1,250 ม.');
  assert.equal(D.formatQty(12.5, 'เมตร'), '12.5 ม.');
  assert.equal(D.formatQty(3.1, 'ตัว'), '3.1 ตัว');
  assert.equal(D.formatQty(0, 'ม้วน'), '0 ม้วน');
  assert.equal(D.formatQty(1250), '1,250');
});
test('validateQty', () => {
  assert.doesNotThrow(() => D.validateQty(12.5, 'เมตร'));
  assert.throws(() => D.validateQty(2.5, 'ตัว'), { code: 'qty_integer', message: 'ตัวต้องเป็นจำนวนเต็ม' });
  assert.throws(() => D.validateQty(0, 'เมตร'), { code: 'qty_invalid', message: 'ใส่จำนวนที่มากกว่า 0' });
  assert.throws(() => D.validateQty(1.234, 'เมตร'), { code: 'qty_invalid' });
});
test('qty and status', () => {
  const s = mini(); const p = s.products[0];
  assert.equal(D.qtyOf(s, 'P-0001', 'W-B'), 0);
  assert.equal(D.totalQty(s, 'P-0001'), 1300);
  assert.equal(D.stockStatus(s, p, 'W-BN'), 'in');
  assert.equal(D.stockStatus(s, p, 'W-A'), 'low');
  assert.equal(D.stockStatus(s, p, null), 'in');
  s.stock['P-0001|W-A'] = 0; assert.equal(D.stockStatus(s, p, 'W-A'), 'out');
});
test('nextId formats', () => {
  const s = mini();
  assert.equal(D.nextId(s, 'REQ'), 'REQ-690001');
  assert.equal(D.nextId(s, 'REQ'), 'REQ-690002');
  assert.equal(D.nextId(s, 'P'), 'P-0001');
  assert.equal(D.nextId(s, 'CC'), 'CC-0001');
  assert.equal(D.nextId(s, 'J'), 'J-26-001');
  assert.equal(D.nextId(s, 'C'), 'C-001');
  assert.equal(D.nextId(s, 'PR'), 'PR-690001');
  assert.equal(D.nextId(s, 'RC'), 'RC-690001');
  assert.equal(D.nextId(s, 'ADJ'), 'ADJ-690001');
});
test('currentUser and unitAbbr', () => {
  assert.equal(D.currentUser(mini()).role, 'head');
  assert.equal(D.unitAbbr('เมตร'), 'ม.');
  assert.equal(D.unitAbbr('ตัว'), 'ตัว');
});
test('assertWarehouseOpen', () => {
  const s = mini();
  assert.doesNotThrow(() => D.assertWarehouseOpen(s, 'W-BN'));
  s.warehouses[0].countId = 'CC-0001';
  assert.throws(() => D.assertWarehouseOpen(s, 'W-BN'), { code: 'wh_counting', message: 'คลังนี้กำลังตรวจนับ รอให้นับเสร็จก่อน' });
});
test('parseSaved rejects garbage and old versions', () => {
  assert.equal(D.parseSaved(null), null);
  assert.equal(D.parseSaved('{bad'), null);
  assert.equal(D.parseSaved('null'), null);
  assert.equal(D.parseSaved('{"version":0}'), null);
  assert.equal(D.parseSaved(JSON.stringify(mini())).version, 1);
});

const S = Seed.build();
test('multi-token search', () => {
  const r = D.searchProducts(S, { text: 'thw 1.5', whId: 'W-BN' });
  assert.ok(r.length >= 2);
  assert.equal(r[0].id, 'P-0001');
  assert.ok(r.every(p => /THW/i.test(p.name + p.model) && /1\.5/.test(p.name + p.model)));
});
test('category filter includes sub-categories', () => {
  const wire = S.categories.find(c => c.name === 'สายไฟ' && !c.parentId);
  const r = D.searchProducts(S, { categoryId: wire.id, whId: 'W-BN' });
  assert.ok(r.length > 0 && r.every(p => D.categoryPath(S, p.categoryId).startsWith('สายไฟ ›')));
});
test('tabs add up', () => {
  const c = D.tabCounts(S, { whId: 'W-BN' });
  assert.deepEqual(c, { all: 2000, in: 1985, low: 12, out: 3 });
});
test('kpis', () => assert.deepEqual(D.kpis(S, 'W-BN'), { low: 12, out: 3, pendingApprovals: 7, openPRs: 18 }));
test('search over 2,000 stays fast', () => {
  const t = performance.now();
  for (let i = 0; i < 20; i++) D.searchProducts(S, { text: 'สาย', tab: 'in', whId: 'W-BN' });
  assert.ok((performance.now() - t) / 20 < 25);
});
test('warehouseOptions marks counting warehouses', () => {
  const s = Seed.build(); s.warehouses[1].countId = 'CC-0009';
  const o = D.warehouseOptions(s, s.cart.lines);
  assert.equal(o.at(-1).short, 'counting');
  assert.equal(o.find(x => x.wh.id === 'W-BN').short, 'full');
});
test('warehouseOptions partial/none ordering and counts', () => {
  const s = Seed.build({ products: 50 });
  const o = D.warehouseOptions(s, [{ productId: 'P-0001', qty: 1e9 }]);
  assert.ok(o.every(x => x.total === 1 && ['none', 'partial'].includes(x.short)));
  assert.ok(o.every(x => x.missing === 1));
});
test('search index follows product edits', () => {
  const s = Seed.build({ products: 50 });
  const p = s.products[0];
  assert.equal(D.searchProducts(s, { text: 'zzqq', whId: 'W-BN' }).length, 0);
  p.brand = 'ZZQQ';
  assert.equal(D.searchProducts(s, { text: 'zzqq', whId: 'W-BN' })[0].id, p.id);
});
test('imageOf falls back product → sub-category → parent → null', () => {
  const s = Seed.build({ products: 50 }); const p = s.products[0];
  const sub = s.categories.find(c => c.id === p.categoryId); const parent = s.categories.find(c => c.id === sub.parentId);
  p.image = null; sub.image = null; parent.image = 'img/a.jpg'; assert.equal(D.imageOf(s, p), 'img/a.jpg');
  sub.image = 'img/b.jpg'; assert.equal(D.imageOf(s, p), 'img/b.jpg');
  p.image = 'img/c.jpg'; assert.equal(D.imageOf(s, p), 'img/c.jpg');
  parent.image = sub.image = p.image = null; assert.equal(D.imageOf(s, p), null);
});

test('custom category rules', () => {
  const s = Seed.build({ products: 50 });
  const c = D.addCategory(s, { name: '  งานประปา ' });
  assert.equal(c.name, 'งานประปา'); assert.equal(c.icon, 'pi-tag'); assert.equal(c.color, '#82d2b3'); assert.equal(c.image, null);
  assert.throws(() => D.addCategory(s, { name: 'งานประปา' }), { code: 'cat_dup' });
  const sub = D.addCategory(s, { name: 'ข้อต่อ PVC', parentId: c.id });
  assert.throws(() => D.addCategory(s, { name: 'x', parentId: sub.id }), { code: 'cat_depth' });
  assert.throws(() => D.addCategory(s, { name: '  ' }), { code: 'cat_name' });
  assert.throws(() => D.updateCategory(s, sub.id, { name: ' ' }), { code: 'cat_name' });
  assert.equal(D.updateCategory(s, sub.id, { name: 'ข้อต่อ', color: '#fff' }).color, '#fff');
  assert.throws(() => D.updateCategory(s, c.id, { name: 'สายไฟ' }), { code: 'cat_dup' });
  assert.doesNotThrow(() => D.updateCategory(s, c.id, { name: 'งานประปา' }));
});
test('delete category in use is blocked unless moved', () => {
  const s = Seed.build({ products: 50 });
  const sub = s.categories.find(c => c.name === 'สายไฟ THW');
  const target = s.categories.find(c => c.name === 'สายไฟ VAF');
  const n = s.products.filter(p => p.categoryId === sub.id).length;
  assert.throws(() => D.deleteCategory(s, sub.id), { code: 'cat_in_use' });
  assert.throws(() => D.deleteCategory(s, sub.id, { moveTo: sub.id }), { code: 'cat_move_invalid' });
  assert.deepEqual(D.deleteCategory(s, sub.id, { moveTo: target.id }), { movedProducts: n });
  assert.ok(s.products.every(p => s.categories.some(c => c.id === p.categoryId)));
  const top = s.categories.find(c => c.name === 'สายไฟ');
  assert.throws(() => D.deleteCategory(s, top.id, { moveTo: target.id + 'x' }), { code: 'cat_move_invalid' });
  const m = D.deleteCategory(s, top.id, { moveTo: s.categories.find(c => c.name === 'กล่องและตู้').id });
  assert.equal(m.movedProducts, 0);
  assert.equal(s.categories.find(c => c.name === 'สายไฟ VAF').parentId, s.categories.find(c => c.name === 'กล่องและตู้').id);
  assert.ok(s.categories.every(c => !c.parentId || s.categories.some(x => x.id === c.parentId)));
  const e = D.addCategory(s, { name: 'ว่าง' }); D.deleteCategory(s, e.id);
  assert.ok(!s.categories.some(c => c.id === e.id));
});
test('productCounts rolls up to parents', () => {
  const s = Seed.build({ products: 50 });
  const m = D.productCounts(s);
  const top = s.categories.find(c => c.name === 'สายไฟ');
  assert.equal(m.get(top.id), s.products.filter(p => D.descendantIds(s, top.id).has(p.categoryId)).length);
});
test('addProduct validation', () => {
  const s = Seed.build({ products: 50 }); const head = s.users.find(u => u.role === 'head');
  const cat = s.categories.find(c => c.name === 'สายไฟ THW').id;
  assert.throws(() => D.addProduct(s, { name: '', unit: '', categoryId: cat }, head), { code: 'prod_required' });
  assert.throws(() => D.addProduct(s, { name: 'x', unit: 'ตัว', categoryId: 'nope' }, head), { code: 'cat_required' });
  assert.throws(() => D.addProduct(s, { name: 'สายไฟ thw 1.5 SQ.MM สีดำ', unit: 'เมตร', categoryId: cat }, head), { code: 'prod_dup' });
  assert.throws(() => D.addProduct(s, { name: 'y', unit: 'ตัว', categoryId: cat, initial: { whId: 'W-BN', qty: 1 } }, head), { code: 'initial_unsupported' });
  const { product, receipt } = D.addProduct(s, { name: 'น็อตสแตนเลส M8', unit: 'ตัว', categoryId: cat }, head);
  assert.equal(product.id, 'P-0051'); assert.equal(product.code, 'P-0051'); assert.equal(receipt, null);
  assert.equal(product.reorderPoint, 0); assert.equal(product.image, null); assert.ok(s.products.includes(product));
  assert.throws(() => D.addProduct(s, { name: 'z', code: 'P-0051', unit: 'ตัว', categoryId: cat }, head), { code: 'code_dup' });
  assert.ok(D.findSimilar(s, 'สายไฟ THW 1.5').length > 0);
  assert.ok(D.findSimilar(s, 'สายไฟ THW 1.5').length <= 5);
  assert.equal(D.updateProduct(s, product.id, { brand: 'B', id: 'X' }).id, 'P-0051');
  assert.throws(() => D.updateProduct(s, product.id, { name: 'สายไฟ thw 1.5 SQ.MM สีดำ' }), { code: 'prod_dup' });
  assert.doesNotThrow(() => D.updateProduct(s, product.id, { name: 'น็อตสแตนเลส M8' }));
});
