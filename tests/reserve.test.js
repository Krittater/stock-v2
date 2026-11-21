const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./_load.js');

const SHELVES = [{ code: 'ทั่วไป', active: true }, { code: 'QC', active: true, qc: true }];
function mini(qty = 0) {
  return {
    version: 3,
    counters: { P: 0, REQ: 0, PR: 0, RC: 0, CC: 0, ADJ: 0, J: 0, C: 0, RT: 0, R: 0 },
    settings: { requireApproval: false },
    currentUserId: 'U-1',
    users: [
      { id: 'U-1', name: 'หัวหน้า', role: 'head' }, { id: 'U-2', name: 'สโตร์', role: 'store' },
      { id: 'U-3', name: 'วิศวกร ก', role: 'engineer' }, { id: 'U-4', name: 'วิศวกร ข', role: 'engineer' },
    ],
    warehouses: [{ id: 'W-BN', name: 'BN', location: '', countId: null, shelves: SHELVES.map((s) => ({ ...s })) }],
    categories: [],
    products: [{ id: 'P-0001', code: 'P-0001', name: 'สายไฟ', unit: 'ตัว', categoryId: null, reorderPoint: 1, isRoll: false }],
    stock: qty ? { 'P-0001|W-BN|ทั่วไป': qty } : {},
    rolls: [], notifs: [], audit: [], returns: [],
    jobs: [{ id: 'J-1', name: 'งาน', open: true }], docs: [], prs: [], counts: [],
    cart: { lines: [], whId: 'W-BN', jobId: '', note: '' },
  };
}
const [head, store, engA, engB] = mini().users;
const req = (s, who, qty) => D.issue(s, { whId: 'W-BN', jobId: 'J-1', lines: [{ productId: 'P-0001', qty }] }, who).doc;
const recv = (s, qty) => D.receive(s, { whId: 'W-BN', lines: [{ productId: 'P-0001', qty }] }, store);

test('ใบเบิกที่ขาดของ: waiting/reserved/fill', () => {
  const s = mini(3);
  const a = req(s, engA, 10);
  assert.equal(a.fill, 'partial');
  assert.deepEqual([a.lines[0].issued, a.lines[0].waiting, a.lines[0].reserved], [3, 7, 0]);
  assert.equal(req(s, engA, 5).fill, 'waiting');
  assert.equal(req(mini(5), engA, 5).fill, 'full');
});

test('ของเข้า → ใบที่รอได้ reserved + แจ้งผู้เบิก ใบเก่าสุดก่อน', () => {
  const s = mini();
  const a = req(s, engA, 5), b = req(s, engB, 5);
  recv(s, 7);
  assert.equal(a.lines[0].reserved, 5); assert.equal(a.fill, 'ready');
  assert.equal(b.lines[0].reserved, 2); assert.equal(b.fill, 'waiting');
  assert.equal(D.available(s, 'P-0001', 'W-BN'), 0);
  assert.equal(D.qtyOf(s, 'P-0001', 'W-BN'), 7);
  assert.equal(D.unread(s, 'U-3'), 1); assert.equal(D.unread(s, 'U-4'), 0);
  assert.equal(s.notifs[0].text, `ของที่รอสำหรับ ${a.id} เข้าแล้ว ระบบกันไว้ให้แล้ว`);
  recv(s, 3);
  assert.equal(b.fill, 'ready'); assert.equal(D.unread(s, 'U-4'), 1);
  assert.equal(D.unread(s, 'U-3'), 1); // ไม่แจ้งซ้ำ
});

test('Review Focus 4: ใบ B เบิกของที่กันให้ใบ A ไม่ได้', () => {
  const s = mini();
  const a = req(s, engA, 5);
  recv(s, 5);
  const b = req(s, engB, 3);
  assert.equal(b.fill, 'waiting'); assert.equal(b.lines[0].issued, 0);
  assert.equal(D.qtyOf(s, 'P-0001', 'W-BN'), 5);
  assert.equal(a.lines[0].reserved, 5);
  const opts = D.warehouseOptions(s, [{ productId: 'P-0001', qty: 1 }]);
  assert.equal(opts[0].short, 'none');
});

test('ของจากการนับเกิน reserve ด้วย', () => {
  const s = mini(); const a = req(s, engA, 2);
  const c = D.startCount(s, { whId: 'W-BN' }, head); D.setCounted(s, c.id, 'P-0001', 2); D.closeCount(s, c.id, head);
  assert.equal(a.fill, 'ready');
});

test('pickReserved: จ่ายของที่กันไว้ → full + สิทธิ์ + แจ้งผู้เบิก', () => {
  const s = mini();
  const a = req(s, engA, 5); recv(s, 5);
  assert.throws(() => D.pickReserved(s, a.id, engB), (e) => e.code === 'forbidden' && e.message === D.FORBIDDEN);
  s.notifs = [];
  D.pickReserved(s, a.id, store);
  assert.equal(a.fill, 'full');
  assert.deepEqual([a.lines[0].issued, a.lines[0].waiting, a.lines[0].reserved], [5, 0, 0]);
  assert.equal(D.qtyOf(s, 'P-0001', 'W-BN'), 0);
  assert.equal(D.unread(s, 'U-3'), 1);
  assert.ok(D.auditFor(s, a.id).some((x) => x.action === 'issue.pick'));
  assert.throws(() => D.pickReserved(s, a.id, store), (e) => e.code === 'nothing_reserved');
});

test('pickReserved: วิศวกรจ่ายใบตัวเองได้ บางส่วน → partial', () => {
  const s = mini();
  const a = req(s, engA, 5); recv(s, 2);
  assert.equal(a.fill, 'waiting');
  D.pickReserved(s, a.id, engA);
  assert.equal(a.fill, 'partial'); assert.equal(a.lines[0].waiting, 3);
});

const addP2 = (s) => s.products.push({ id: 'P-0002', code: 'P-0002', name: 'สายแลน', unit: 'เมตร', categoryId: null, reorderPoint: 1, isRoll: true, rollSize: 100, scrapMin: 3 });
const snap = (s) => JSON.stringify([s.stock, s.rolls]);

test('ขาดหลังนับลด: pickReserved ไม่ตัดอะไรครึ่งทาง', () => {
  const s = mini(); addP2(s);
  const a = D.issue(s, { whId: 'W-BN', jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 5 }, { productId: 'P-0002', qty: 50 }] }, engA).doc;
  recv(s, 5); D.receive(s, { whId: 'W-BN', lines: [{ productId: 'P-0002', qty: 50, rollLengths: [50] }] }, store);
  assert.equal(a.fill, 'ready');
  const c = D.startCount(s, { whId: 'W-BN' }, head); D.setCounted(s, c.id, 'P-0002', 20); D.closeCount(s, c.id, head);
  const before = snap(s), lines = JSON.stringify(a.lines);
  assert.throws(() => D.pickReserved(s, a.id, store), { code: 'stock_short' });
  assert.equal(snap(s), before); assert.equal(JSON.stringify(a.lines), lines); assert.equal(a.fill, 'ready');
});

test('pickReserved หลายบรรทัด', () => {
  const s = mini(); addP2(s);
  const a = D.issue(s, { whId: 'W-BN', jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 5 }, { productId: 'P-0002', qty: 50 }] }, engA).doc;
  recv(s, 5); D.receive(s, { whId: 'W-BN', lines: [{ productId: 'P-0002', qty: 50, rollLengths: [50] }] }, store);
  D.pickReserved(s, a.id, store);
  assert.equal(a.fill, 'full');
  assert.deepEqual(a.lines.map((l) => [l.issued, l.waiting, l.reserved]), [[5, 0, 0], [50, 0, 0]]);
  assert.equal(D.qtyOf(s, 'P-0001', 'W-BN'), 0); assert.equal(D.qtyOf(s, 'P-0002', 'W-BN'), 0);
});

test('pickReserved สินค้าม้วน: cuts และดัชนีม้วนถูกต้อง', () => {
  const s = mini(); addP2(s);
  const a = D.issue(s, { whId: 'W-BN', jobId: 'J-1', lines: [{ productId: 'P-0002', qty: 120 }] }, engA).doc;
  D.receive(s, { whId: 'W-BN', lines: [{ productId: 'P-0002', qty: 150, rollLengths: [100, 50] }] }, store);
  assert.equal(a.lines[0].reserved, 120);
  D.pickReserved(s, a.id, store);
  assert.equal(a.lines[0].cuts.reduce((t, c) => t + c.cut, 0), 120);
  assert.equal(a.fill, 'full'); assert.equal(D.qtyOf(s, 'P-0002', 'W-BN'), 30);
  assert.equal(s.rolls.reduce((t, r) => t + r.length, 0), 30);
  assert.equal(D.qtyAt(s, 'P-0002', 'W-BN'), 30);
});

test('markRead', () => {
  const s = mini(); D.notify(s, ['U-3'], 'info', 'x', '#/'); D.notify(s, ['U-3'], 'info', 'y', '#/');
  D.markRead(s, 'U-3', 'N-1'); assert.equal(D.unread(s, 'U-3'), 1);
  D.markRead(s, 'U-3'); assert.equal(D.unread(s, 'U-3'), 0);
});
