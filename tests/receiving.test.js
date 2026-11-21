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
    users: [
      { id: 'U-1', name: 'หัวหน้า', role: 'head' }, { id: 'U-2', name: 'สโตร์', role: 'store' },
      { id: 'U-3', name: 'วิศวกร ก', role: 'engineer' }, { id: 'U-4', name: 'วิศวกร ข', role: 'engineer' },
    ],
    warehouses: ['W-BN', 'W-A'].map((id) => ({ id, name: id, location: '', countId: null, shelves: SHELVES.map((s) => ({ ...s })) })),
    categories: [],
    products: [
      { id: 'P-0001', code: 'P-0001', name: 'น็อต', unit: 'ตัว', buyUnit: 'กล่อง', buyFactor: 100, categoryId: null, reorderPoint: 1, isRoll: false, active: true },
      { id: 'P-0002', code: 'P-0002', name: 'สายแลน', unit: 'เมตร', categoryId: null, reorderPoint: 1, isRoll: true, rollSize: 100, scrapMin: 3, active: true },
      { id: 'P-0003', code: 'P-0003', name: 'ปลั๊ก', unit: 'ตัว', categoryId: null, reorderPoint: 1, isRoll: false, active: false },
    ],
    stock: {}, rolls: [], notifs: [], audit: [], returns: [],
    jobs: [{ id: 'J-1', name: 'งาน', open: true }], docs: [], prs: [], counts: [],
    cart: { lines: [], whId: 'W-BN', jobId: '', note: '' },
  };
}
const [head, store, engA, engB] = mini().users;
const W = 'W-BN';
const pr = (s, qty, over = {}) => { const r = { id: D.nextId(s, 'PR'), productId: 'P-0001', whId: W, qty, received: 0, status: 'open', reqId: null, ...over }; s.prs.push(r); return r; };
const rc = (s, lines, who = store, extra = {}) => D.receive(s, { whId: W, lines, ...extra }, who);
const snap = (s) => JSON.stringify(s);

test('RC-AC1 รับครบตามใบ: ยอดเพิ่ม ใบรับ "รับครบ" มีเลขใบรับ', () => {
  const s = mini(); const p = pr(s, 50);
  const d = rc(s, [{ productId: 'P-0001', prId: p.id, qty: 50 }]);
  assert.match(d.id, /^RC-/); assert.equal(d.status, 'posted');
  assert.equal(D.qtyAt(s, 'P-0001', W, 'ทั่วไป'), 50);
  assert.equal(p.status, 'done'); assert.equal(D.outstanding(p), 0);
});
test('RC-AC2 รับ 30 จาก 50: ค้าง 20 ใบยังเปิด', () => {
  const s = mini(); const p = pr(s, 50);
  rc(s, [{ productId: 'P-0001', prId: p.id, qty: 30 }]);
  assert.equal(p.status, 'open'); assert.equal(p.received, 30); assert.equal(D.outstanding(p), 20);
  assert.ok(D.openPRs(s, W).includes(p));
});
test('RC-AC3 สายม้วน: 3 ม้วน เลขม้วนใหม่ batch ติดทุกม้วน ม้วนที่ใส่ 0 ถูกข้าม', () => {
  const s = mini(); const p = pr(s, 300, { productId: 'P-0002' });
  const d = rc(s, [{ productId: 'P-0002', prId: p.id, rollLengths: [100, 0, 100, 100], batch: 'TH-1' }]);
  const l = d.lines[0];
  assert.equal(l.qty, 300); assert.equal(l.rollIds.length, 3);
  assert.deepEqual(s.rolls.map((r) => [r.id, r.length, r.batch]), [['R-000001', 100, 'TH-1'], ['R-000002', 100, 'TH-1'], ['R-000003', 100, 'TH-1']]);
  assert.equal(p.status, 'done'); assert.deepEqual(d.rollIds, l.rollIds);
});
test('RC-AC4 หน่วยซื้อ × buyFactor: 2 กล่อง = 200 ตัว', () => {
  const s = mini();
  const d = rc(s, [{ productId: 'P-0001', qty: 2, unit: 'buy' }]);
  assert.equal(d.lines[0].qty, 200); assert.equal(D.qtyOf(s, 'P-0001', W), 200);
});
test('RC-AC5 ใบเบิกที่รออยู่ถูกกันของ + แจ้งผู้เบิก + filledDocs', () => {
  const s = mini();
  const r = D.issue(s, { whId: W, jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 50 }] }, engA);
  const p = r.prs[0];
  const d = rc(s, [{ productId: 'P-0001', prId: p.id, qty: 50 }]);
  assert.equal(r.doc.lines[0].reserved, 50); assert.equal(r.doc.fill, 'ready');
  assert.ok(s.notifs.some((n) => n.to === engA.id));
  assert.deepEqual(d.filledDocs, [r.doc.id]);
});
test('RC-AC6 ใส่ 0 ทุกบรรทัด: ปฏิเสธ ไม่มีอะไรเปลี่ยน', () => {
  const s = mini(); const before = snap(s);
  assert.throws(() => rc(s, [{ productId: 'P-0001', qty: 0 }, { productId: 'P-0002', rollLengths: [0, 0] }]), { message: 'ยังไม่ได้กรอกจำนวนที่รับ' });
  assert.equal(snap(s), before);
});
test('RC-AC7 คลังปิดใช้/ถูกล็อกนับ/ชั้นปิด: ปฏิเสธด้วยข้อความตามสเปก', () => {
  const s = mini();
  s.warehouses[0].active = false;
  assert.throws(() => rc(s, [{ productId: 'P-0001', qty: 1 }]), { message: 'W-BN ปิดใช้งานอยู่ — รับของเข้าไม่ได้ (เปิดใช้อีกครั้งก่อน)' });
  s.warehouses[0].active = true; s.warehouses[0].countId = 'CC-1';
  assert.throws(() => rc(s, [{ productId: 'P-0001', qty: 1 }]), { message: 'คลังนี้ถูกล็อกเพื่อตรวจนับ รับของเข้าไม่ได้' });
  s.warehouses[0].countId = null; s.warehouses[0].shelves[1].active = false;
  assert.throws(() => rc(s, [{ productId: 'P-0001', qty: 1, shelf: 'A-01' }]), { message: 'ที่วาง A-01 ปิดใช้งานอยู่ — รับของเข้าไม่ได้ (เปิดใช้อีกครั้งก่อน)' });
  assert.throws(() => rc(s, [{ productId: 'P-0001', qty: 1, shelf: 'QC' }]), { code: 'shelf_invalid' });
});
test('RC-AC8 รับเกินที่สั่ง ต้องมีเหตุผล (Q1) ไม่กินเลขเอกสาร', () => {
  const s = mini(); const p = pr(s, 50); const c0 = JSON.stringify(s.counters);
  assert.throws(() => rc(s, [{ productId: 'P-0001', prId: p.id, qty: 60 }]), { message: 'รับเกินที่สั่ง 10 ตัว ใส่เหตุผล' });
  assert.throws(() => rc(s, [{ productId: 'P-0001', prId: p.id, qty: 60 }], store, { overReason: '  ' }), { code: 'over_receive' });
  assert.equal(JSON.stringify(s.counters), c0);
  const d = rc(s, [{ productId: 'P-0001', prId: p.id, qty: 60 }], store, { overReason: 'ผู้ขายแถม' });
  assert.equal(d.overReason, 'ผู้ขายแถม'); assert.equal(p.status, 'done'); assert.equal(D.qtyOf(s, 'P-0001', W), 60);
});
test('RC-AC9 ตัวต้องเป็นจำนวนเต็ม (รวมหลังคูณหน่วยซื้อ)', () => {
  const s = mini();
  assert.throws(() => rc(s, [{ productId: 'P-0001', qty: 2.5 }]), { message: 'ตัวต้องเป็นจำนวนเต็ม' });
  assert.equal(rc(s, [{ productId: 'P-0001', qty: 2.5, unit: 'buy' }]).lines[0].qty, 250);
});
test('RC-G2 ไม่มีใบขอซื้อ: สร้าง PR noPr/done ผูกกับบรรทัด', () => {
  const s = mini();
  const d = rc(s, [{ productId: 'P-0001', qty: 7 }]);
  const x = s.prs.find((r) => r.id === d.lines[0].prId);
  assert.deepEqual([x.noPr, x.status, x.qty, x.received, x.reqId], [true, 'done', 7, 7, null]);
  assert.equal(D.outstanding(x), 0);
});
test('PR ต้องตรงคลัง/สินค้า, ไม่มี/ปิดแล้วไม่ได้', () => {
  const s = mini(); const p = pr(s, 5); const q = pr(s, 5, { whId: 'W-A' }); const z = pr(s, 5, { status: 'done', received: 5 });
  assert.throws(() => rc(s, [{ productId: 'P-0002', qty: 1, prId: p.id }]), { code: 'pr_mismatch' });
  assert.throws(() => rc(s, [{ productId: 'P-0001', qty: 1, prId: q.id }]), { code: 'pr_mismatch' });
  assert.throws(() => rc(s, [{ productId: 'P-0001', qty: 1, prId: 'PR-x' }]), { code: 'pr_mismatch' });
  assert.throws(() => rc(s, [{ productId: 'P-0001', qty: 1, prId: z.id }]), { code: 'pr_closed' });
});
test('RC-G5 ชั้นต่อบรรทัด: ค่าเริ่ม ทั่วไป · ชั้นของใบ · ชั้นของบรรทัด', () => {
  const s = mini();
  rc(s, [{ productId: 'P-0001', qty: 1 }, { productId: 'P-0001', qty: 2, shelf: 'A-01' }]);
  assert.equal(D.qtyAt(s, 'P-0001', W, 'ทั่วไป'), 1); assert.equal(D.qtyAt(s, 'P-0001', W, 'A-01'), 2);
  rc(s, [{ productId: 'P-0001', qty: 4 }], store, { shelf: 'A-01' });
  assert.equal(D.qtyAt(s, 'P-0001', W, 'A-01'), 6);
});
test('RC-G8 ชำรุด → ชั้นรอตรวจ (ไม่นับยอดใช้ได้ แต่นับรับแล้ว) · ปฏิเสธ → ไม่ลงยอด ยังค้างรับ', () => {
  const s = mini(); const p = pr(s, 20);
  const d = rc(s, [
    { productId: 'P-0001', prId: p.id, qty: 10 }, { productId: 'P-0001', prId: p.id, qty: 4, condition: 'damaged' },
    { productId: 'P-0001', prId: p.id, qty: 3, condition: 'reject' }]);
  assert.equal(D.qtyOf(s, 'P-0001', W), 10); assert.equal(D.qtyAt(s, 'P-0001', W, 'QC'), 4);
  assert.deepEqual(D.qcStock(s, W).map((x) => x.qty), [4]);
  assert.equal(p.received, 14); assert.equal(D.outstanding(p), 6);
  assert.equal(d.lines[2].qty, 3); assert.equal(d.lines[1].shelf, 'QC');
  // ของที่ปฏิเสธไม่นับเป็นรับเกิน
  assert.doesNotThrow(() => rc(s, [{ productId: 'P-0001', prId: p.id, qty: 6 }, { productId: 'P-0001', prId: p.id, qty: 50, condition: 'reject' }]));
});
test('สินค้าเลิกใช้รับไม่ได้', () => {
  assert.throws(() => rc(mini(), [{ productId: 'P-0003', qty: 1 }]), { message: 'ปลั๊ก เลิกใช้แล้ว รับของเข้าไม่ได้' });
});
test('Review Focus 3: 3 บรรทัด บรรทัดกลางผิด → ไม่ลงยอด ไม่กินเลข ไม่เปลี่ยน PR', () => {
  const s = mini(); const p = pr(s, 50); const before = snap(s);
  assert.throws(() => rc(s, [
    { productId: 'P-0001', prId: p.id, qty: 10 }, { productId: 'P-0001', qty: 1, shelf: 'ไม่มี' }, { productId: 'P-0002', rollLengths: [50] }]), { code: 'shelf_missing' });
  assert.equal(snap(s), before);
});
test('วิศวกร → pending ไม่ลงยอด แจ้ง Store · Store ยืนยันแล้วลงยอดและ PR ทีเดียว', () => {
  const s = mini(); const p = pr(s, 50);
  const d = rc(s, [{ productId: 'P-0001', prId: p.id, qty: 50 }], engA, { invoiceNo: 'INV-1', vendor: 'ร้าน ก', note: 'x' });
  assert.equal(d.status, 'pending'); assert.equal(D.qtyOf(s, 'P-0001', W), 0); assert.equal(p.received, 0);
  assert.ok(s.notifs.some((n) => n.to === store.id));
  assert.equal(d.invoiceNo, 'INV-1'); assert.equal(d.vendor, 'ร้าน ก'); assert.equal(d.receivedAt, D.today());
  D.confirmReceipt(s, d.id, store, true);
  assert.equal(d.status, 'posted'); assert.equal(D.qtyOf(s, 'P-0001', W), 50); assert.equal(p.status, 'done');
});
test('confirmReceipt ตรวจรับเกินซ้ำตามยอดค้างตอนนั้น', () => {
  const s = mini(); const p = pr(s, 50);
  const d = rc(s, [{ productId: 'P-0001', prId: p.id, qty: 50 }], engA);
  rc(s, [{ productId: 'P-0001', prId: p.id, qty: 20 }]);
  const before = snap(s);
  assert.throws(() => D.confirmReceipt(s, d.id, store, true), { message: 'รับเกินที่สั่ง 20 ตัว ใส่เหตุผล' });
  assert.equal(snap(s), before); assert.equal(d.status, 'pending');
});

// ---- PR ต้องไม่ซื้อเกิน: ผลรวมค้างรับที่เปิดอยู่ = ส่วนขาดที่ยังไม่ครอบคลุม ----
const openRemainder = (s, pid) => s.prs.filter((r) => r.productId === pid && r.whId === W && r.status === 'open').reduce((a, r) => a + D.outstanding(r), 0);
const shortfall = (s, pid) => s.docs.filter((d) => d.type === 'issue' && d.whId === W).flatMap((d) => d.lines).filter((l) => l.productId === pid)
  .reduce((a, l) => a + Math.max(0, l.waiting - l.reserved - (l.covered || 0)), 0);
test('PR-trim (i) คืนของให้ใบเก่าที่มี PR ของตัวเอง', () => {
  const s = mini(); s.stock['P-0001|W-BN|ทั่วไป'] = 100;
  const a = D.issue(s, { whId: W, jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 20 }] }, engA).doc;
  const b = D.issue(s, { whId: W, jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 100 }] }, engB);
  assert.equal(openRemainder(s, 'P-0001'), 20);
  D.returnItems(s, { docId: a.id, whId: W, lines: [{ productId: 'P-0001', qty: 5, condition: 'ok' }] }, engA);
  assert.equal(b.doc.lines[0].reserved, 5);
  assert.equal(openRemainder(s, 'P-0001'), 15); assert.equal(openRemainder(s, 'P-0001'), shortfall(s, 'P-0001'));
  D.returnItems(s, { docId: a.id, whId: W, lines: [{ productId: 'P-0001', qty: 15, condition: 'ok' }] }, engA);
  assert.equal(openRemainder(s, 'P-0001'), 0); assert.equal(b.prs[0].status, 'cancelled'); assert.equal(b.doc.fill, 'ready');
  assert.ok(s.audit.some((x) => x.ref === b.prs[0].id));
});
test('PR-trim (ii) ของที่เจอเพิ่มยืนยัน: ใบเก่าได้ของ PR เก่าปิด ใบใหม่เปิด PR ครั้งเดียว', () => {
  const s = mini();
  const d0 = D.issue(s, { whId: W, jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 10 }] }, head);
  const e = D.submitOpening(s, { productId: 'P-0001', whId: W, qty: 10, kind: 'found' }, engA);
  const d1 = D.issue(s, { whId: W, jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 10 }] }, head);
  assert.equal(d1.doc.lines[0].covered, 10);
  D.confirmOpening(s, e.cc.id, store, true);
  assert.equal(d0.doc.lines[0].reserved, 10); assert.equal(d1.doc.lines[0].covered, 0);
  assert.equal(openRemainder(s, 'P-0001'), 10); assert.equal(openRemainder(s, 'P-0001'), shortfall(s, 'P-0001'));
  assert.equal(d0.prs[0].status, 'cancelled'); assert.equal(d0.doc.lines[0].covered, 0);
});
test('PR-trim (iii) รับของโดยไม่มี PR / ใช้ PR ของอีกใบ', () => {
  const s = mini();
  const b = D.issue(s, { whId: W, jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 5 }] }, engB);
  const a = D.issue(s, { whId: W, jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 5 }] }, engA);
  // รับ 5 ตาม PR ของใบ a: ใบ b (เก่ากว่า) ได้ของก่อน → PR ของ b ปิด และ a ต้องเปิด PR ใหม่ครั้งเดียว
  const d = rc(s, [{ productId: 'P-0001', prId: a.prs[0].id, qty: 5 }]);
  assert.equal(b.doc.lines[0].reserved, 5); assert.equal(b.prs[0].status, 'cancelled');
  assert.equal(openRemainder(s, 'P-0001'), 5); assert.equal(openRemainder(s, 'P-0001'), shortfall(s, 'P-0001'));
  assert.deepEqual(d.filledDocs, [b.doc.id]);
  rc(s, [{ productId: 'P-0001', qty: 5 }]); // ไม่มี PR
  assert.equal(a.doc.lines[0].reserved, 5); assert.equal(openRemainder(s, 'P-0001'), 0); assert.equal(shortfall(s, 'P-0001'), 0);
});
test('PR-trim: รับตาม PR ของใบเบิกเอง ไม่ตัด PR ซ้ำ · covered ล้างเมื่อกันของครบ', () => {
  const s = mini();
  const a = D.issue(s, { whId: W, jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 10 }] }, engA);
  rc(s, [{ productId: 'P-0001', prId: a.prs[0].id, qty: 4 }]);
  assert.equal(a.doc.lines[0].reserved, 4); assert.equal(openRemainder(s, 'P-0001'), 6); assert.equal(shortfall(s, 'P-0001'), 6);
  const s2 = mini(); s2.docs.push({ id: 'REQ-1', type: 'issue', status: 'posted', whId: W, fill: 'waiting', at: '2026-01-01T00:00:00Z', by: 'U-3', prIds: [], lines: [{ productId: 'P-0001', qty: 5, issued: 0, waiting: 5, reserved: 0, covered: 5 }] });
  rc(s2, [{ productId: 'P-0001', qty: 5 }]);
  assert.equal(s2.docs[0].fill, 'ready'); assert.equal(s2.docs[0].lines[0].covered, 0);
});

// ---- fix round 1 ----
const twoLine = (s, who = engA) => D.issue(s, { whId: W, jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 10 }, { productId: 'P-0001', qty: 10 }] }, who);
test('sync: ใบเดียวสินค้าเดียวสองบรรทัด · รับไม่มี PR 5', () => {
  const s = mini(); twoLine(s); rc(s, [{ productId: 'P-0001', qty: 5 }]);
  assert.equal(openRemainder(s, 'P-0001'), shortfall(s, 'P-0001')); assert.equal(openRemainder(s, 'P-0001'), 15);
});
test('sync: ใบเดียวสองบรรทัด · คืนของ 5', () => {
  const s = mini(); s.stock['P-0001|W-BN|ทั่วไป'] = 20;
  const a = D.issue(s, { whId: W, jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 20 }] }, engA).doc;
  twoLine(s, engB);
  D.returnItems(s, { docId: a.id, whId: W, lines: [{ productId: 'P-0001', qty: 5, condition: 'ok' }] }, engA);
  assert.equal(openRemainder(s, 'P-0001'), shortfall(s, 'P-0001')); assert.equal(openRemainder(s, 'P-0001'), 15);
});
test('sync: ใบเดียวสองบรรทัด · รับตาม PR บรรทัดแรก 5', () => {
  const s = mini(); const r = twoLine(s); rc(s, [{ productId: 'P-0001', qty: 5, prId: r.prs[0].id }]);
  assert.equal(openRemainder(s, 'P-0001'), shortfall(s, 'P-0001')); assert.equal(openRemainder(s, 'P-0001'), 15);
});
test('confirmReceipt รับเกินตอนยืนยัน: ใส่ overReason ตอนยืนยันได้ · PR ที่ใบรับรอยืนยันอ้างอยู่ไม่ถูกตัด', () => {
  const s = mini(); const p = pr(s, 50);
  const d = rc(s, [{ productId: 'P-0001', prId: p.id, qty: 50 }], engA);
  rc(s, [{ productId: 'P-0001', qty: 20, prId: p.id }]);
  assert.throws(() => D.confirmReceipt(s, d.id, store, true), { code: 'over_receive' });
  D.confirmReceipt(s, d.id, store, true, 'ผู้ขายส่งเกิน');
  assert.equal(d.status, 'posted'); assert.equal(d.overReason, 'ผู้ขายส่งเกิน'); assert.equal(D.qtyOf(s, 'P-0001', W), 70);
  const s2 = mini(); const a = D.issue(s2, { whId: W, jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 10 }] }, engA);
  const pend = rc(s2, [{ productId: 'P-0001', qty: 10, prId: a.prs[0].id }], engB);
  rc(s2, [{ productId: 'P-0001', qty: 10 }]); // ของไปกันให้ใบเบิกก่อน แต่ PR ที่ใบรอยืนยันอ้างอยู่ต้องคงไว้
  assert.equal(a.prs[0].status, 'open'); assert.equal(a.prs[0].qty, 10);
  assert.equal(pend.status, 'pending');
});
test('ชั้นเป็นสตริงว่าง → ใช้ชั้นของใบ/ทั่วไป', () => {
  const s = mini();
  rc(s, [{ productId: 'P-0001', qty: 1, shelf: '' }]); rc(s, [{ productId: 'P-0001', qty: 2, shelf: '' }], store, { shelf: 'A-01' });
  assert.equal(D.qtyAt(s, 'P-0001', W, 'ทั่วไป'), 1); assert.equal(D.qtyAt(s, 'P-0001', W, 'A-01'), 2);
});
test('ใบรับของวิศวกรที่รอยืนยันลง audit', () => {
  const s = mini(); const d = rc(s, [{ productId: 'P-0001', qty: 1 }], engA);
  assert.ok(s.audit.some((a) => a.action === 'receive.submit' && a.ref === d.id));
});
test('ชำรุดเข้าใบ PR แล้วตัดทิ้งจากชั้นรอตรวจ → ใบเบิกได้ PR คืน', () => {
  const s = mini(); const a = D.issue(s, { whId: W, jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 10 }] }, engA);
  rc(s, [{ productId: 'P-0001', qty: 10, prId: a.prs[0].id, condition: 'damaged' }]);
  assert.equal(a.prs[0].status, 'done');
  D.qcDecide(s, { whId: W, productId: 'P-0001', qty: 10, decision: 'scrap', reason: 'แตก' }, store);
  assert.equal(openRemainder(s, 'P-0001'), 10); assert.equal(openRemainder(s, 'P-0001'), shortfall(s, 'P-0001'));
});
test('ชำรุดในคลังที่ไม่มีชั้นรอตรวจ: ปฏิเสธ ไม่เปลี่ยนอะไร', () => {
  const s = mini(); s.warehouses[0].shelves = s.warehouses[0].shelves.filter((x) => !x.qc); const before = snap(s);
  assert.throws(() => rc(s, [{ productId: 'P-0001', qty: 1, condition: 'damaged' }]), { code: 'shelf_missing' });
  assert.equal(snap(s), before);
});

// ---- fix round 2 ----
test('ปฏิเสธใบรับที่อ้าง PR → ปล่อย PR ที่ถูกกันไว้ (ใบเบิก ready)', () => {
  const s = mini(); const a = D.issue(s, { whId: W, jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 10 }] }, engA);
  const pend = rc(s, [{ productId: 'P-0001', qty: 10, prId: a.prs[0].id }], engB);
  rc(s, [{ productId: 'P-0001', qty: 10 }]);
  assert.equal(a.doc.fill, 'ready'); assert.equal(a.prs[0].status, 'open');
  D.confirmReceipt(s, pend.id, store, false);
  assert.equal(a.prs[0].status, 'cancelled'); assert.equal(openRemainder(s, 'P-0001'), 0);
});
test('ปฏิเสธใบรับที่อ้าง PR → ปล่อย PR แม้ใบเบิกจ่ายแล้ว (full)', () => {
  const s = mini(); const a = D.issue(s, { whId: W, jobId: 'J-1', lines: [{ productId: 'P-0001', qty: 10 }] }, engA);
  const pend = rc(s, [{ productId: 'P-0001', qty: 10, prId: a.prs[0].id }], engB);
  rc(s, [{ productId: 'P-0001', qty: 10 }]);
  D.pickReserved(s, a.doc.id, store); assert.equal(a.doc.fill, 'full');
  D.confirmReceipt(s, pend.id, store, false);
  assert.equal(a.prs[0].status, 'cancelled'); assert.equal(openRemainder(s, 'P-0001'), 0);
});

test('receiveCoverage: ขาด/เกิน/reject ไม่นับ · defaultRollLengths เศษม้วนสุดท้าย', () => {
  const s = mini(); s.prs.push({ id: 'PR-1', productId: 'P-0001', whId: W, qty: 50, received: 20, status: 'open', reqId: null });
  const cov = (lines) => D.receiveCoverage(s, lines)[0];
  assert.equal(cov([{ prId: 'PR-1', qty: 20 }]).left, 10);
  assert.equal(cov([{ prId: 'PR-1', qty: 40 }]).left, -10);
  assert.equal(cov([{ prId: 'PR-1', qty: 40, condition: 'reject' }]).left, 30);
  assert.deepEqual(D.defaultRollLengths(250, 100), [100, 100, 50]);
  assert.deepEqual(D.defaultRollLengths(300, 100), [100, 100, 100]);
  assert.deepEqual(D.defaultRollLengths(0, 100), []);
});

test('confirmReceipt: ปฏิเสธเก็บ rejectReason + แจ้งผู้ส่ง · รับเกินใส่ overReason ตอนยืนยัน · overMessage', () => {
  const s = mini(); s.prs.push({ id: 'PR-1', productId: 'P-0001', whId: W, qty: 20, received: 0, status: 'open', reqId: null });
  const a = D.receive(s, { whId: W, lines: [{ productId: 'P-0001', prId: 'PR-1', qty: 10 }] }, engA);
  const n0 = s.notifs.length;
  D.confirmReceipt(s, a.id, store, false, 'ไม่มีของมาจริง');
  assert.equal(a.rejectReason, 'ไม่มีของมาจริง'); assert.ok(s.notifs.length > n0);
  assert.equal(s.notifs[s.notifs.length - 1].to, engA.id);
  const c = D.receive(s, { whId: W, lines: [{ productId: 'P-0001', prId: 'PR-1', qty: 15 }] }, engA);
  const b = D.receive(s, { whId: W, lines: [{ productId: 'P-0001', prId: 'PR-1', qty: 15 }] }, engA);
  D.confirmReceipt(s, c.id, store, true);
  assert.throws(() => D.confirmReceipt(s, b.id, store, true), { message: D.overMessage(10, 'ตัว') });
  D.confirmReceipt(s, b.id, store, true, 'แถม'); assert.equal(b.overReason, 'แถม'); assert.equal(b.status, 'posted');
});
