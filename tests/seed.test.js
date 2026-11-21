const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./_load.js');
const Seed = require('../mockup/js/seed.js');

const s = Seed.build();
const s50 = Seed.build({ products: 50 });

test('size and uniqueness', () => {
  assert.equal(s.products.length, 2000);
  assert.equal(new Set(s.products.map(p => p.id)).size, 2000);
  assert.equal(new Set(s.products.map(p => p.code)).size, 2000);
  assert.equal(new Set(s.products.map(p => p.name)).size, 2000);
  assert.equal(s.counters.P, 2000);
});
test('every product sits in an existing sub-category', () => {
  const byId = Object.fromEntries(s.categories.map(c => [c.id, c]));
  for (const p of s.products) assert.ok(byId[p.categoryId]?.parentId, p.id);
});
test('image rows exist with image values', () => {
  const p = s.products.find(x => x.code === 'EL-WR-THW-0015-BK');
  assert.equal(p.name, 'สายไฟ THW 1.5 sq.mm สีดำ');
  assert.equal(D.qtyOf(s, p.id, 'W-BN'), 1250);
  assert.equal(D.stockStatus(s, s.products.find(x => x.id === 'P-0006'), 'W-BN'), 'out');
});
test('W-BN KPI numbers match the image', () => {
  const st = s.products.map(p => D.stockStatus(s, p, 'W-BN'));
  assert.equal(st.filter(x => x === 'low').length, 12);
  assert.equal(st.filter(x => x === 'out').length, 3);
  assert.equal(s.docs.filter(d => d.type === 'issue' && d.status === 'pending').length, 7);
  assert.equal(s.prs.filter(p => p.status === 'open').length, 18);
});
test('deterministic', () => assert.deepEqual(Seed.build().products.slice(0, 50), s.products.slice(0, 50)));
test('cart matches image', () => assert.deepEqual(s.cart.lines.map(l => l.qty), [100, 10, 30]));

test('categories: 10 tops with 2-4 subs, mandatory subs', () => {
  const tops = s.categories.filter(c => !c.parentId);
  assert.equal(tops.length, 10);
  assert.equal(new Set(tops.map(c => c.color)).size, 10);
  for (const t of tops) {
    const n = s.categories.filter(c => c.parentId === t.id).length;
    assert.ok(n >= 2 && n <= 4, t.name);
  }
  const sub = (top, name) => s.categories.find(c => c.name === name && s.categories.find(t => t.id === c.parentId)?.name === top);
  for (const [t, n] of [['สายไฟ', 'สายไฟ THW'], ['สายไฟ', 'สายไฟ VAF'], ['สายไฟ', 'สายไฟ VCT'], ['กล่องและตู้', 'กล่องพักสาย'],
    ['ท่อและราง', 'ท่อ EMT'], ['สวิตช์และเต้ารับ', 'เต้ารับ'], ['อุปกรณ์ไฟฟ้า', 'เซอร์กิตเบรกเกอร์'], ['วัสดุสิ้นเปลือง', 'เทปพันสายไฟ']]) {
    assert.ok(sub(t, n), `${t} > ${n}`);
  }
  assert.ok(s.products.every(p => p.image === null));
  assert.equal(s.counters.C, s.categories.length);
});
test('THW products carry THW + size; no name starts with THW', () => {
  const thw = s.categories.find(c => c.name === 'สายไฟ THW').id;
  for (const p of s.products.filter(p => p.categoryId === thw)) {
    const hay = p.name + ' ' + p.model;
    assert.ok(hay.includes('THW'), p.id);
    assert.ok(/\d/.test(hay), p.id);
  }
  assert.ok(s.products.every(p => !p.name.startsWith('THW')));
  assert.ok(s.products.length > 0 && s.products[0].id === 'P-0001');
});
test('fixed users, warehouses, jobs, counters', () => {
  assert.equal(s.currentUserId, 'U-ENG');
  assert.deepEqual(s.users.map(u => u.id), ['U-ENG', 'U-STORE', 'U-HEAD']);
  assert.deepEqual(s.warehouses.map(w => w.id), ['W-BN', 'W-A', 'W-B', 'W-C']);
  assert.ok(s.warehouses.every(w => w.countId === null));
  assert.equal(s.jobs.filter(j => j.open).length, 5);
  assert.equal(s.jobs.filter(j => !j.open).length, 1);
  assert.ok(s.docs.filter(d => d.status === 'posted').length >= 18);
  assert.equal(s.counters.REQ, s.docs.filter(d => d.type === 'issue').length);
  assert.equal(s.counters.RC, s.docs.filter(d => d.type === 'receive').length);
  assert.equal(s.counters.PR, 18);
});
test('products:50 is valid and references only P-0001..P-0040', () => {
  assert.equal(s50.products.length, 50);
  assert.equal(s50.counters.P, 50);
  assert.equal(new Set(s50.products.map(p => p.name)).size, 50);
  const ok = id => +id.slice(2) <= 40;
  for (const d of s50.docs) for (const l of d.lines) assert.ok(ok(l.productId), d.id);
  for (const p of s50.prs) assert.ok(ok(p.productId), p.id);
  for (const l of s50.cart.lines) assert.ok(ok(l.productId));
  const st = s50.products.map(p => [p.id, D.stockStatus(s50, p, 'W-BN')]);
  assert.equal(st.filter(x => x[1] === 'low').length, 12);
  assert.equal(st.filter(x => x[1] === 'out').length, 3);
  for (const [id, k] of st) if (k !== 'in') assert.ok(ok(id), id);
  assert.equal(s50.docs.filter(d => d.type === 'issue' && d.status === 'pending').length, 7);
  assert.equal(s50.prs.length, 18);
});

test('v3 shape: shelves, rolls, new fields', () => {
  assert.equal(s.version, 3);
  for (const w of s.warehouses) {
    assert.deepEqual(w.shelves.map(x => x.code), ['ทั่วไป', 'A-01', 'A-02', 'A-03', 'B-01', 'B-02', 'B-03', 'C-01', 'QC']);
    assert.equal(w.shelves.find(x => x.qc).code, 'QC');
    assert.equal(w.shelves.find(x => x.code === 'C-01').active, w.id !== 'W-B');
  }
  assert.ok(s.products.every(p => p.active === true && p.needsApproval === false && Array.isArray(p.photos) && p.buyFactor === 1));
  assert.ok(s.categories.every(c => c.needsApproval === false));
  assert.deepEqual([s.notifs, s.audit, s.returns], [[], [], []]);
  assert.equal(s.settings.openingLocked, false);
  assert.equal(s.counters.R, s.rolls.length); assert.equal(s.counters.RT, 0);
  assert.ok(s.jobs.every(j => 'ownerId' in j && 'closedAt' in j && j.note === ''));
});
test('cable products are rolls; meter stock split into rolls with unchanged totals', () => {
  const rollP = s.products.filter(p => p.isRoll);
  assert.ok(rollP.length > 300 && rollP.every(p => p.unit === 'เมตร' && [100, 305].includes(p.rollSize) && p.scrapMin === 3));
  assert.ok(s.products.filter(p => !p.isRoll).every(p => p.scrapMin === 0));
  assert.equal(s.products.find(p => p.code === 'EL-LAN-CAT6').rollSize, 305);
  assert.equal(s.products.find(p => p.id === 'P-0001').rollSize, 100);
  assert.equal(s.products.find(p => p.id === 'P-0003').isRoll, false); // ท่อ EMT หน่วยเมตรแต่ไม่ใช่สายม้วน
  assert.ok(s.rolls.every(r => r.length > 0 && r.length <= s.products.find(p => p.id === r.productId).rollSize));
  assert.ok(Object.keys(s.stock).every(k => !s.products.find(p => p.id === k.split('|')[0]).isRoll));
  // P-0001 W-BN 1250 = 12 ม้วน x 100 + 50
  const p1 = s.rolls.filter(r => r.productId === 'P-0001' && r.whId === 'W-BN').map(r => r.length);
  assert.deepEqual(p1, [...Array(12).fill(100), 50]);
  // ยอดต่อสินค้าต่อคลังเท่ากับยอดเมตรเดิม (ก่อนแตกม้วน): ตรวจจากยอดรวมใน baseline ของ P-0001
  assert.equal(D.totalQty(s, 'P-0001'), 1672);
  assert.equal(D.totalQty(s, 'P-0012'), 484);
  for (const r of s.rolls) assert.equal(r.shelf, 'ทั่วไป');
});
