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
      { id: 'P-0001', code: 'P-0001', name: 'น็อต', unit: 'ตัว', categoryId: null, reorderPoint: 1, isRoll: false },
      { id: 'P-0002', code: 'P-0002', name: 'สายแลน', unit: 'เมตร', categoryId: null, reorderPoint: 1, isRoll: true, rollSize: 100, scrapMin: 3 },
    ],
    stock: { 'P-0001|W-BN|ทั่วไป': 100 },
    rolls: [{ id: 'R-000120', productId: 'P-0002', whId: 'W-BN', shelf: 'ทั่วไป', length: 100, opened: false, batch: '', fromRollId: null }],
    notifs: [], audit: [], returns: [],
    jobs: [{ id: 'J-1', name: 'งานไลน์ 1', open: true }], docs: [], prs: [], counts: [],
    cart: { lines: [], whId: 'W-BN', jobId: '', note: '' },
  };
}
const [head, store, engA, engB] = mini().users;
const iss = (s, who, lines, jobId = 'J-1') => D.issue(s, { whId: 'W-BN', jobId, lines }, who).doc;
const snap = (s) => JSON.stringify([s.stock, s.rolls, s.docs, s.returns]);
const rt = (s, doc, lines, who = engA, extra = {}) => D.returnItems(s, { docId: doc.id, whId: 'W-BN', lines, ...extra }, who);

test('RT-AC1 returnable: วิศวกรเห็นเฉพาะใบตัวเอง ใหม่สุดก่อน · Store เห็นทั้งหมด · ค้นได้', () => {
  const s = mini();
  const a = iss(s, engA, [{ productId: 'P-0001', qty: 2 }]); a.at = '2026-01-01T00:00:00Z';
  const b = iss(s, engB, [{ productId: 'P-0001', qty: 2 }]); b.at = '2026-01-02T00:00:00Z';
  const c = iss(s, engA, [{ productId: 'P-0001', qty: 2 }]); c.at = '2026-01-03T00:00:00Z';
  assert.deepEqual(D.returnable(s, engA).map((x) => x.doc.id), [c.id, a.id]);
  const all = D.returnable(s, store);
  assert.deepEqual(all.map((x) => x.doc.id), [c.id, b.id, a.id]);
  assert.equal(all[1].by.id, 'U-4');
  assert.equal(D.returnable(s, store, 'งานไลน์').length, 3);
  assert.equal(D.returnable(s, store, 'น็อต').length, 3);
  assert.equal(D.returnable(s, store, 'ไม่มีแน่').length, 0);
});

test('RT-AC2/3/4 เกินที่คืนได้ / ทศนิยมผิดหน่วย → ไม่ลงยอด', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0001', qty: 5 }]);
  rt(s, a, [{ productId: 'P-0001', qty: 2, condition: 'ok' }]);
  const l = D.returnable(s, engA)[0].lines[0];
  assert.deepEqual([l.issued, l.returned, l.left], [5, 2, 3]);
  const before = snap(s);
  assert.throws(() => rt(s, a, [{ productId: 'P-0001', qty: 4, condition: 'ok' }]), { code: 'over_return', message: 'น็อต คืนได้ไม่เกิน 3 ตัว (ยอดที่เบิกไปหักที่คืนแล้ว)' });
  assert.throws(() => rt(s, a, [{ productId: 'P-0001', qty: 1.5, condition: 'ok' }]), { code: 'qty_integer' });
  assert.equal(snap(s), before);
});

test('RT-AC5 คืนครบ → ยอดชั้นที่เลือกเพิ่ม ใบหายจากรายการ + log + เลข RT', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0001', qty: 5 }]);
  const rec = rt(s, a, [{ productId: 'P-0001', qty: 5, condition: 'ok' }], engA, { shelf: 'A-01' });
  assert.match(rec.id, /^RT-69\d{4}$/);
  assert.equal(D.qtyAt(s, 'P-0001', 'W-BN', 'A-01'), 5);
  assert.equal(a.lines[0].returned, 5);
  assert.equal(D.returnable(s, engA).length, 0);
  assert.ok(D.auditFor(s, rec.id).length);
  assert.equal(s.returns.length, 1);
});

test('RT-AC6 สายม้วน: ม้วนใหม่ อ้างม้วนเดิม ไม่ต่อกลับ', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0002', qty: 30 }]);
  assert.equal(a.lines[0].cuts[0].rollId, 'R-000120');
  const rec = rt(s, a, [{ productId: 'P-0002', qty: 12.5, condition: 'ok' }]);
  const nr = s.rolls.find((r) => r.id === rec.lines[0].newRollId);
  assert.equal(nr.length, 12.5); assert.equal(nr.fromRollId, 'R-000120');
  assert.equal(s.rolls.find((r) => r.id === 'R-000120').length, 70);
  assert.equal(rec.lines[0].fromRollId, 'R-000120');
  assert.throws(() => rt(s, a, [{ productId: 'P-0002', qty: 1, condition: 'ok', rollId: 'R-999' }]), { code: 'roll_not_cut' });
});

test('RT-AC7 เสียหาย→QC · ของเสีย→ไม่เพิ่มยอด · ทั้งคู่นับคืนแล้ว · Q8', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0001', qty: 6 }, { productId: 'P-0002', qty: 30 }]);
  const before = D.qtyOf(s, 'P-0001', 'W-BN');
  const rec = rt(s, a, [
    { productId: 'P-0001', qty: 2, condition: 'damaged', shelf: 'A-01', photo: 'x.jpg' },
    { productId: 'P-0002', qty: 10, condition: 'scrap' },
  ]);
  assert.equal(D.qtyOf(s, 'P-0001', 'W-BN'), before);
  assert.equal(s.stock['P-0001|W-BN|QC'], 2);
  assert.equal(rec.lines[0].shelf, 'QC');
  assert.equal(rec.lines[1].newRollId, null);
  assert.equal(s.rolls.length, 1);
  assert.deepEqual([a.lines[0].returned, a.lines[1].returned, a.lines[1].scrapped], [2, 10, 10]);
  const u = D.jobUsage(s, 'J-1');
  assert.deepEqual(u.find((x) => x.productId === 'P-0001'), { productId: 'P-0001', issued: 6, returned: 2, scrapped: 0, used: 4 });
  assert.deepEqual(u.find((x) => x.productId === 'P-0002'), { productId: 'P-0002', issued: 30, returned: 10, scrapped: 10, used: 30 });
});

test('RT-AC8 คลังปิด/กำลังนับ = ปฏิเสธ · คืนคลังอื่นได้', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0001', qty: 5 }]);
  const wa = s.warehouses[1]; wa.active = false;
  const before = snap(s);
  assert.throws(() => D.returnItems(s, { docId: a.id, whId: 'W-A', lines: [{ productId: 'P-0001', qty: 1, condition: 'ok' }] }, engA), { code: 'wh_inactive', message: 'W-A ปิดใช้งานอยู่ — คืนของไม่ได้ (เปิดใช้อีกครั้งก่อน)' });
  wa.active = true; s.warehouses[0].countId = 'CC-1';
  assert.throws(() => rt(s, a, [{ productId: 'P-0001', qty: 1, condition: 'ok' }]), { code: 'wh_counting', message: 'W-BN ถูกล็อกเพื่อตรวจนับ (CC-1) — คืนของไม่ได้จนกว่าจะปลดล็อก' });
  assert.equal(snap(s), before);
  D.returnItems(s, { docId: a.id, whId: 'W-A', lines: [{ productId: 'P-0001', qty: 1, condition: 'ok' }] }, engA);
  assert.equal(D.qtyAt(s, 'P-0001', 'W-A'), 1);
});

test('RT-AC9 รูปติดเฉพาะสภาพเสียหาย', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0001', qty: 4 }]);
  const rec = rt(s, a, [{ productId: 'P-0001', qty: 1, condition: 'ok', photo: 'x' }, { productId: 'P-0001', qty: 1, condition: 'damaged', photo: 'y' }]);
  assert.deepEqual(rec.lines.map((l) => l.photo), [null, 'y']);
});

test('RT-AC10 คืนของใช้ได้ → ใบเบิกที่รอถูกกันของให้ + แจ้งเตือน', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0001', qty: 100 }]);
  const w = iss(s, engB, [{ productId: 'P-0001', qty: 3 }]);
  assert.equal(w.fill, 'waiting');
  s.notifs = [];
  rt(s, a, [{ productId: 'P-0001', qty: 3, condition: 'ok' }]);
  assert.equal(w.fill, 'ready'); assert.equal(w.lines[0].reserved, 3);
  assert.equal(D.unread(s, 'U-4'), 1);
});

test('Review Focus 3: หลายบรรทัด 1 บรรทัดผิด = ไม่ลงยอดเลย', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0001', qty: 5 }, { productId: 'P-0002', qty: 30 }]);
  const before = snap(s);
  assert.throws(() => rt(s, a, [{ productId: 'P-0001', qty: 2, condition: 'ok' }, { productId: 'P-0002', qty: 31, condition: 'ok' }]), { code: 'over_return' });
  assert.throws(() => rt(s, a, [{ productId: 'P-0001', qty: 2, condition: 'ok' }, { productId: 'P-0001', qty: 2, condition: 'ok', shelf: 'ไม่มีชั้น' }]), { code: 'shelf_missing' });
  assert.throws(() => rt(s, a, [{ productId: 'P-0001', qty: 2, condition: 'ok' }, { productId: 'P-0001', qty: 1.5, condition: 'ok' }]), { code: 'qty_integer' });
  assert.equal(snap(s), before); assert.equal(s.counters.RT, 0);
  assert.throws(() => rt(s, a, [{ productId: 'P-0001', qty: 0, condition: 'ok' }, { productId: 'P-0002', qty: '', condition: 'ok' }]), { message: 'ยังไม่ได้กรอกจำนวนที่คืน' });
});

test('คืนต่อสินค้า = รวมทุกบรรทัดของสินค้านั้นในใบ (3+2 → 5 ได้ 6 ไม่ได้)', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0001', qty: 3 }, { productId: 'P-0001', qty: 2 }]);
  const before = snap(s);
  assert.throws(() => rt(s, a, [{ productId: 'P-0001', qty: 6, condition: 'ok' }]), (e) => /ไม่เกิน 5/.test(e.message));
  assert.equal(snap(s), before);
  assert.equal(D.returnable(s, engA)[0].lines.length, 1);
  rt(s, a, [{ productId: 'P-0001', qty: 4, condition: 'scrap' }]);
  assert.deepEqual(a.lines.map((l) => [l.returned, l.scrapped]), [[3, 3], [1, 1]]);
  rt(s, a, [{ productId: 'P-0001', qty: 1, condition: 'ok' }]);
  assert.deepEqual(a.lines.map((l) => l.returned), [3, 2]);
});

test('ข้อมูลเก่าทศนิยม: คืนเท่ายอดคงเหลือได้ แต่เศษอื่นไม่ได้', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0001', qty: 5 }]);
  a.lines[0].issued = 2.5;
  assert.throws(() => rt(s, a, [{ productId: 'P-0001', qty: 1.5, condition: 'ok' }]), { code: 'qty_integer' });
  rt(s, a, [{ productId: 'P-0001', qty: 2.5, condition: 'ok' }]);
  assert.equal(a.lines[0].returned, 2.5);
});

test('RT-G1 วิศวกรคืนใบคนอื่นไม่ได้ · Store คืนแทนได้', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0001', qty: 5 }]);
  assert.throws(() => rt(s, a, [{ productId: 'P-0001', qty: 1, condition: 'ok' }], engB), (e) => e.code === 'forbidden' && e.message === D.FORBIDDEN);
  rt(s, a, [{ productId: 'P-0001', qty: 1, condition: 'ok' }], store);
  assert.equal(a.lines[0].returned, 1);
});

test('RT-G2 returnLoose: Store/หัวหน้า ต้องมีเหตุผล · ม้วนใหม่', () => {
  const s = mini();
  const p = { productId: 'P-0002', whId: 'W-BN', shelf: 'ทั่วไป', qty: 7, condition: 'ok', reason: 'เหลือหน้างาน', jobId: 'J-1' };
  assert.throws(() => D.returnLoose(s, p, engA), { code: 'forbidden' });
  assert.throws(() => D.returnLoose(s, { ...p, reason: ' ' }, store), { code: 'reason_required' });
  assert.throws(() => D.returnLoose(s, { ...p, jobId: 'J-X' }, store), { code: 'job_missing' });
  const rec = D.returnLoose(s, p, store);
  assert.equal(rec.docId, null); assert.equal(rec.jobId, 'J-1');
  assert.equal(s.rolls.find((r) => r.id === rec.lines[0].newRollId).length, 7);
  const rec2 = D.returnLoose(s, { productId: 'P-0001', whId: 'W-BN', qty: 2, condition: 'damaged', reason: 'x' }, head);
  assert.equal(s.stock['P-0001|W-BN|QC'], 2); assert.ok(rec2.id);
});

test('RT-G4 qcDecide: restock / scrap', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0001', qty: 6 }, { productId: 'P-0002', qty: 30 }]);
  rt(s, a, [{ productId: 'P-0001', qty: 5, condition: 'damaged' }, { productId: 'P-0002', qty: 10, condition: 'damaged' }]);
  const qr = D.qcStock(s, 'W-BN').find((x) => x.rollId);
  assert.throws(() => D.qcDecide(s, { whId: 'W-BN', productId: 'P-0001', qty: 1, decision: 'restock' }, engA), { code: 'forbidden' });
  assert.throws(() => D.qcDecide(s, { whId: 'W-BN', productId: 'P-0001', qty: 2, decision: 'scrap' }, store), { code: 'reason_required' });
  D.qcDecide(s, { whId: 'W-BN', productId: 'P-0001', qty: 3, decision: 'restock', shelf: 'A-01' }, store);
  assert.equal(D.qtyAt(s, 'P-0001', 'W-BN', 'A-01'), 3); assert.equal(s.stock['P-0001|W-BN|QC'], 2);
  D.qcDecide(s, { whId: 'W-BN', productId: 'P-0001', qty: 2, decision: 'scrap', reason: 'หัก' }, store);
  assert.equal(s.stock['P-0001|W-BN|QC'], 0);
  assert.throws(() => D.qcDecide(s, { whId: 'W-BN', productId: 'P-0001', qty: 1, decision: 'scrap', reason: 'x' }, store), { code: 'qc_short' });
  D.qcDecide(s, { whId: 'W-BN', productId: 'P-0002', rollId: qr.rollId, qty: 10, decision: 'restock' }, head);
  assert.equal(s.rolls.find((r) => r.id === qr.rollId).shelf, 'ทั่วไป');
  assert.equal(D.qcStock(s, 'W-BN').filter((x) => x.productId === 'P-0002').length, 0);
  assert.ok(s.audit.filter((x) => /^qc/.test(x.action)).length >= 3);
});

test('RT-G4 qcDecide restock เรียก reserveForWaiting', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0001', qty: 100 }]);
  const w = iss(s, engB, [{ productId: 'P-0001', qty: 2 }]);
  rt(s, a, [{ productId: 'P-0001', qty: 2, condition: 'damaged' }]);
  assert.equal(w.fill, 'waiting');
  D.qcDecide(s, { whId: 'W-BN', productId: 'P-0001', qty: 2, decision: 'restock' }, store);
  assert.equal(w.fill, 'ready');
});

test('RT-G6 แยกชั้นต่อบรรทัด', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0001', qty: 6 }]);
  rt(s, a, [{ productId: 'P-0001', qty: 2, condition: 'ok', shelf: 'A-01' }, { productId: 'P-0001', qty: 3, condition: 'ok' }], engA, { shelf: 'ทั่วไป' });
  assert.equal(D.qtyAt(s, 'P-0001', 'W-BN', 'A-01'), 2);
});

test('RT-G7 reverseReturn: หัวหน้าเท่านั้น · ถอนยอดและใบเบิก · ถ้าใช้ไปแล้วปฏิเสธ', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0001', qty: 6 }, { productId: 'P-0002', qty: 30 }]);
  const rollsBefore = s.rolls.length;
  const rec = rt(s, a, [{ productId: 'P-0001', qty: 4, condition: 'ok' }, { productId: 'P-0002', qty: 10, condition: 'ok' }]);
  assert.throws(() => D.reverseReturn(s, rec.id, store), { code: 'forbidden' });
  D.reverseReturn(s, rec.id, head);
  assert.equal(rec.reversed, true);
  assert.deepEqual(a.lines.map((l) => l.returned), [0, 0]);
  assert.equal(s.rolls.length, rollsBefore);
  assert.equal(D.qtyOf(s, 'P-0001', 'W-BN'), 94);
  assert.throws(() => D.reverseReturn(s, rec.id, head), { code: 'return_reversed' });
  // ม้วนใหม่ถูกตัดไปแล้ว
  const rec2 = rt(s, a, [{ productId: 'P-0002', qty: 10, condition: 'ok' }]);
  D.stockOut(s, { productId: 'P-0002', whId: 'W-BN', qty: 75 });
  const nr = s.rolls.find((r) => r.id === rec2.lines[0].newRollId);
  assert.ok(!nr || nr.length < 10);
  const before = snap(s);
  assert.throws(() => D.reverseReturn(s, rec2.id, head), { message: 'ของจากการคืนนี้ถูกใช้ไปแล้ว กลับรายการไม่ได้' });
  assert.equal(snap(s), before);
  // ยอดชั้นถูกใช้ไปแล้ว
  const rec3 = rt(s, a, [{ productId: 'P-0001', qty: 2, condition: 'ok', shelf: 'A-01' }]);
  s.stock['P-0001|W-BN|A-01'] = 1;
  assert.throws(() => D.reverseReturn(s, rec3.id, head), { code: 'return_used' });
});

test('Q9 returnHint', () => {
  const s = mini();
  assert.deepEqual(D.returnHint(s, 'P-0002', 2), { short: true, scrapMin: 3 });
  assert.deepEqual(D.returnHint(s, 'P-0002', 5), { short: false, scrapMin: 3 });
  assert.equal(D.returnHint(s, 'P-0001', 1).short, false);
  const a = iss(s, engA, [{ productId: 'P-0002', qty: 30 }]);
  assert.ok(rt(s, a, [{ productId: 'P-0002', qty: 1, condition: 'ok' }]).id); // เตือนอย่างเดียว ไม่บล็อก
});

test('returnable รวมใบที่งานปิดแล้ว', () => {
  const s = mini(); iss(s, engA, [{ productId: 'P-0001', qty: 2 }]);
  s.jobs[0].open = false;
  assert.equal(D.returnable(s, engA).length, 1);
  assert.deepEqual(D.returnable(s, engA)[0].lines[0].cuts, []);
});

test('reverse: ม้วนเสียหายที่ตัดสินเก็บเข้าชั้นแล้ว กลับรายการไม่ได้', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0002', qty: 30 }]);
  const rec = rt(s, a, [{ productId: 'P-0002', qty: 10, condition: 'damaged' }]);
  D.qcDecide(s, { whId: 'W-BN', productId: 'P-0002', rollId: rec.lines[0].newRollId, qty: 10, decision: 'restock' }, store);
  const before = snap(s);
  assert.throws(() => D.reverseReturn(s, rec.id, head), { code: 'return_used' });
  assert.equal(snap(s), before);
});

test('reverse: ของที่ถูกกันไว้ให้ใบเบิกที่รอ กลับรายการไม่ได้', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0001', qty: 100 }]);
  const w = iss(s, engB, [{ productId: 'P-0001', qty: 3 }]);
  const rec = rt(s, a, [{ productId: 'P-0001', qty: 3, condition: 'ok' }]);
  assert.equal(w.lines[0].reserved, 3); assert.equal(w.fill, 'ready');
  const before = snap(s);
  assert.throws(() => D.reverseReturn(s, rec.id, head), { code: 'return_used' });
  assert.equal(snap(s), before);
});

test('qcDecide restock ม้วน ต้องย้ายทั้งม้วน', () => {
  const s = mini(); const a = iss(s, engA, [{ productId: 'P-0002', qty: 30 }]);
  const rec = rt(s, a, [{ productId: 'P-0002', qty: 10, condition: 'damaged' }]);
  assert.throws(() => D.qcDecide(s, { whId: 'W-BN', productId: 'P-0002', rollId: rec.lines[0].newRollId, qty: 4, decision: 'restock' }, store), { code: 'qc_roll_whole' });
  assert.equal(s.rolls.find((r) => r.id === rec.lines[0].newRollId).shelf, 'QC');
});
