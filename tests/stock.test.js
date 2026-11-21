const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./_load.js');

const SHELVES = [{ code: 'ทั่วไป', active: true }, { code: 'A-01', active: true }, { code: 'QC', active: true, qc: true }];
function mini() {
  return {
    version: 3,
    counters: { P: 0, REQ: 0, PR: 0, RC: 0, CC: 0, ADJ: 0, J: 0, C: 0, RT: 0, R: 0 },
    settings: { requireApproval: false },
    currentUserId: 'U-1',
    users: [{ id: 'U-1', name: 'หัวหน้า', title: 'หัวหน้า', role: 'head' }, { id: 'U-2', name: 'สโตร์', title: 'Store', role: 'store' }],
    warehouses: ['W-BN', 'W-A'].map((id) => ({ id, name: id, location: '', countId: null, shelves: SHELVES.map((s) => ({ ...s })) })),
    categories: [],
    products: [
      { id: 'P-0001', code: 'P-0001', name: 'สายไฟ', unit: 'เมตร', categoryId: null, reorderPoint: 100, isRoll: false },
      { id: 'P-0002', code: 'P-0002', name: 'สายแลน', unit: 'เมตร', categoryId: null, reorderPoint: 100, isRoll: true, rollSize: 100, scrapMin: 3 },
      { id: 'P-0003', code: 'P-0003', name: 'น็อต', unit: 'ตัว', categoryId: null, reorderPoint: 10, isRoll: false },
    ],
    stock: { 'P-0001|W-BN|ทั่วไป': 1250, 'P-0001|W-A|ทั่วไป': 50 },
    rolls: [], notifs: [], audit: [], returns: [],
    jobs: [], docs: [], prs: [], counts: [],
    cart: { lines: [], whId: 'W-BN', jobId: '', note: '' },
  };
}
const roll = (s, id, length, extra = {}) => s.rolls.push({ id, productId: 'P-0002', whId: 'W-BN', shelf: 'ทั่วไป', length, opened: false, batch: '', fromRollId: null, ...extra });
const store = (s) => s.users[1];

test('ชั้นรอตรวจไม่นับใน qtyOf/kpis แต่เห็นใน qcStock', () => {
  const s = mini(); s.stock['P-0001|W-BN|QC'] = 9;
  assert.equal(D.qtyOf(s, 'P-0001', 'W-BN'), 1250);
  assert.equal(D.totalQty(s, 'P-0001'), 1300);
  assert.deepEqual(D.qcStock(s, 'W-BN').map((x) => x.qty), [9]);
  assert.equal(D.qcShelf(s, 'W-BN').code, 'QC');
  assert.deepEqual(D.shelves(s, 'W-BN'), ['ทั่วไป', 'A-01']);
  assert.deepEqual(D.shelves(s, 'W-BN', { qc: true }), ['ทั่วไป', 'A-01', 'QC']);
  s.stock['P-0003|W-BN|QC'] = 5; // ของอยู่แต่ชั้นรอตรวจอย่างเดียว ยังนับเป็น "ไม่มีของ"
  assert.equal(D.stockStatus(s, s.products[2], 'W-BN'), 'out');
});
test('ม้วนบนชั้นรอตรวจไม่นับ แต่เห็นใน qcStock พร้อม rollId', () => {
  const s = mini(); roll(s, 'R-000001', 100); roll(s, 'R-000002', 40, { shelf: 'QC' });
  assert.equal(D.qtyOf(s, 'P-0002', 'W-BN'), 100);
  assert.deepEqual(D.qcStock(s).map((x) => [x.rollId, x.qty]), [['R-000002', 40]]);
});
test('qtyAt แยกชั้น', () => {
  const s = mini(); s.stock['P-0001|W-BN|A-01'] = 7;
  assert.equal(D.qtyAt(s, 'P-0001', 'W-BN', 'A-01'), 7);
  assert.equal(D.qtyAt(s, 'P-0001', 'W-BN'), 1250);
  assert.equal(D.qtyOf(s, 'P-0001', 'W-BN'), 1257);
});
test('stockOut ตัดม้วนที่สั้นสุดที่พอ แล้วเก็บ cuts', () => {
  const s = mini(); roll(s, 'R-1', 100); roll(s, 'R-2', 40); roll(s, 'R-3', 305);
  const r = D.stockOut(s, { productId: 'P-0002', whId: 'W-BN', qty: 35 });
  assert.deepEqual(r.cuts, [{ rollId: 'R-2', cut: 35, left: 5 }]);
  assert.deepEqual(r.shelves, [{ shelf: 'ทั่วไป', qty: 35 }]);
  assert.equal(D.qtyOf(s, 'P-0002', 'W-BN'), 410);
});
test('stockOut ไม่มีม้วนเดียวที่พอ ไล่จากม้วนยาวสุด และไม่ตัดเกินที่มี', () => {
  const s = mini(); roll(s, 'R-1', 100); roll(s, 'R-2', 40);
  const r = D.stockOut(s, { productId: 'P-0002', whId: 'W-BN', qty: 120 });
  assert.deepEqual(r.cuts, [{ rollId: 'R-1', cut: 100, left: 0 }, { rollId: 'R-2', cut: 20, left: 20 }]);
  assert.throws(() => D.stockOut(s, { productId: 'P-0002', whId: 'W-BN', qty: 21 }), { code: 'stock_short' });
});
test('stockOut ของไม่ใช่ม้วนตัดตามลำดับชั้น ข้ามชั้นรอตรวจ', () => {
  const s = mini(); s.stock['P-0003|W-BN|A-01'] = 4; s.stock['P-0003|W-BN|ทั่วไป'] = 5; s.stock['P-0003|W-BN|QC'] = 50;
  const r = D.stockOut(s, { productId: 'P-0003', whId: 'W-BN', qty: 7 });
  assert.deepEqual(r.shelves, [{ shelf: 'ทั่วไป', qty: 5 }, { shelf: 'A-01', qty: 2 }]);
  assert.equal(D.qtyOf(s, 'P-0003', 'W-BN'), 2); assert.equal(s.stock['P-0003|W-BN|QC'], 50);
});
test('stockIn ตรวจก่อน apply แล้วค่อยลงยอด', () => {
  const s = mini();
  const r = D.stockIn(s, { productId: 'P-0002', whId: 'W-BN', rollLengths: [100, 50.5], batch: 'LOT1' });
  assert.equal(r.amount, 150.5); assert.deepEqual(r.rollIds, ['R-000001', 'R-000002']);
  assert.equal(s.rolls.length, 0); r.apply();
  assert.deepEqual(s.rolls.map((x) => [x.id, x.length, x.batch, x.shelf]), [['R-000001', 100, 'LOT1', 'ทั่วไป'], ['R-000002', 50.5, 'LOT1', 'ทั่วไป']]);
  assert.equal(s.counters.R, 2);
  D.stockIn(s, { productId: 'P-0003', whId: 'W-BN', shelf: 'A-01', qty: 3 }).apply();
  assert.equal(D.qtyAt(s, 'P-0003', 'W-BN', 'A-01'), 3);
  assert.throws(() => D.stockIn(s, { productId: 'P-0003', whId: 'W-BN', qty: 1.5 }), { code: 'qty_integer' });
  assert.throws(() => D.stockIn(s, { productId: 'P-0003', whId: 'W-BN', shelf: 'Z-99', qty: 1 }), { code: 'shelf_missing' });
  s.warehouses[0].shelves[1].active = false;
  assert.throws(() => D.stockIn(s, { productId: 'P-0003', whId: 'W-BN', shelf: 'A-01', qty: 1 }), { code: 'shelf_inactive' });
  s.warehouses[0].countId = 'CC-1';
  assert.throws(() => D.stockIn(s, { productId: 'P-0003', whId: 'W-BN', qty: 1 }), { code: 'wh_counting' });
});
test('closeCount สายม้วนนับขาด 20 ม. ตัดออกจากม้วน ไม่มีม้วนติดลบ', () => {
  const s = mini(); roll(s, 'R-1', 100); roll(s, 'R-2', 15);
  const c = D.startCount(s, { whId: 'W-BN' }, store(s));
  D.setCounted(s, c.id, 'P-0002', 95);
  D.closeCount(s, c.id, store(s));
  assert.equal(D.qtyOf(s, 'P-0002', 'W-BN'), 95);
  assert.ok(s.rolls.every((r) => r.length > 0));
});
test('closeCount สายม้วนนับเกิน → ม้วนใหม่จากการนับ', () => {
  const s = mini(); roll(s, 'R-000001', 100); s.counters.R = 1;
  const c = D.startCount(s, { whId: 'W-BN' }, store(s));
  D.setCounted(s, c.id, 'P-0002', 130); D.closeCount(s, c.id, store(s));
  assert.equal(D.qtyOf(s, 'P-0002', 'W-BN'), 130);
  assert.deepEqual(s.rolls.filter((r) => r.batch === 'จากการนับ').map((r) => [r.length, r.shelf]), [[30, 'ทั่วไป']]);
});
test('closeCount สินค้า 2 ชั้นนับเกิน 5 ลงที่ ทั่วไป ยอดรวม = ที่นับ', () => {
  const s = mini(); s.stock['P-0003|W-BN|A-01'] = 4; s.stock['P-0003|W-BN|ทั่วไป'] = 3;
  const c = D.startCount(s, { whId: 'W-BN' }, store(s));
  D.setCounted(s, c.id, 'P-0003', 12); D.closeCount(s, c.id, store(s));
  assert.equal(D.qtyAt(s, 'P-0003', 'W-BN', 'ทั่วไป'), 8); assert.equal(D.qtyAt(s, 'P-0003', 'W-BN', 'A-01'), 4);
  assert.equal(D.qtyOf(s, 'P-0003', 'W-BN'), 12);
});
test('closeCount สินค้า 2 ชั้นนับขาด ไม่มีชั้นติดลบ ยอดรวม = ที่นับ', () => {
  const s = mini(); s.stock['P-0003|W-BN|A-01'] = 4; s.stock['P-0003|W-BN|ทั่วไป'] = 3;
  const c = D.startCount(s, { whId: 'W-BN' }, store(s));
  D.setCounted(s, c.id, 'P-0003', 2); D.closeCount(s, c.id, store(s));
  assert.equal(D.qtyOf(s, 'P-0003', 'W-BN'), 2);
  assert.ok(Object.values(s.stock).every((q) => q >= 0));
});
test('parseSaved ปฏิเสธ version 2', () => {
  assert.equal(D.parseSaved(JSON.stringify({ version: 2 })), null);
  assert.equal(D.parseSaved(JSON.stringify({ version: 3 })).version, 3);
});
test('similarity สายไฟ THW 2.5 กับ สายไฟ THW 2.5 sq.mm สีดำ ≥ 0.35', () => {
  assert.ok(D.similarity('สายไฟ THW 2.5', 'สายไฟ THW 2.5 sq.mm สีดำ') >= 0.35);
  assert.equal(D.similarity('abc', 'abc'), 1); assert.equal(D.similarity('', 'abc'), 0);
});
test('log / auditFor / notify / unread / FORBIDDEN', () => {
  const s = mini();
  D.log(s, s.users[0], 'x', 'REQ-1', 'ทำ'); D.log(s, 'U-2', 'y', 'REQ-2', 'ทำ');
  assert.deepEqual(D.auditFor(s, 'REQ-1').map((a) => [a.by, a.action, a.ref, a.text]), [['U-1', 'x', 'REQ-1', 'ทำ']]);
  D.notify(s, ['U-1', 'U-2'], 'info', 'สวัสดี', '#/approvals');
  assert.equal(D.unread(s, 'U-1'), 1); s.notifs[0].read = true; assert.equal(D.unread(s, 'U-1'), 0); assert.equal(D.unread(s, 'U-2'), 1);
  assert.equal(D.FORBIDDEN, 'คุณทำรายการนี้ไม่ได้ ให้หัวหน้าทำแทน หรือขอให้หัวหน้าเปิดสิทธิ์');
});
test('postIssue เก็บ cuts / shelves ในบรรทัด', () => {
  const s = mini(); roll(s, 'R-1', 100); s.stock['P-0003|W-BN|ทั่วไป'] = 5;
  s.jobs.push({ id: 'J-1', name: 'งาน', open: true });
  const { doc } = D.issue(s, { whId: 'W-BN', jobId: 'J-1', lines: [{ productId: 'P-0002', qty: 30 }, { productId: 'P-0003', qty: 2 }] }, s.users[0]);
  assert.deepEqual(doc.lines[0].cuts, [{ rollId: 'R-1', cut: 30, left: 70 }]);
  assert.deepEqual(doc.lines[1].shelves, [{ shelf: 'ทั่วไป', qty: 2 }]);
  assert.equal(s.audit.length, 1);
});
