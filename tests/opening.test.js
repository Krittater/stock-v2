const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./_load.js');
const Seed = require('../mockup/js/seed.js');

const base = () => {
  const s = Seed.build({ products: 50 });
  const U = (r) => s.users.find((u) => u.role === r);
  return { s, eng: U('engineer'), store: U('store'), head: U('head'), cat: s.categories.find((c) => c.parentId).id };
};
let n = 0;
const mk = (b, over = {}, who = b.head) => D.addProduct(b.s, { name: 'ตั้งต้น ' + ++n, unit: 'ตัว', categoryId: b.cat, ...over }, who);
const mkNA = (b) => { const { product } = mk(b); D.updateProduct(b.s, product.id, { needsApproval: true }, b.head); return product; };
const W = 'W-BN';
const msg = (m) => ({ message: m });
const JOB = 'J-25-010';

test('OS-AC1 store creates with stock: posted at once on ทั่วไป', () => {
  const b = base();
  const r = mk(b, { initial: { whId: W, qty: 24 } }, b.store);
  assert.equal(D.qtyAt(b.s, r.product.id, W, 'ทั่วไป'), 24);
  assert.match(r.opening.message, /ลงยอด 24 ตัว เข้าคลังแล้ว/);
  assert.ok(r.opening.message.startsWith('สร้าง ' + r.product.id + ' แล้ว'));
});
test('OS-AC2 engineer: stock not in, CC to store, store notified, pendingOpening', () => {
  const b = base();
  const r = mk(b, { initial: { whId: W, qty: 24 } }, b.eng);
  assert.equal(D.qtyOf(b.s, r.product.id, W), 0);
  assert.match(r.opening.message, /ส่งให้ Store ยืนยันยอด \(CC-\d+\)/);
  assert.equal(r.opening.cc.stage, 'store');
  assert.ok(b.s.notifs.some((x) => x.to === b.store.id));
  assert.equal(D.pendingOpening(b.s, r.product.id, W), 24);
});
test('OS-AC3 store confirm posts, notifies submitter, reserves for waiting issue', () => {
  const b = base();
  const r = mk(b, { initial: { whId: W, qty: 24 } }, b.eng);
  const doc = D.issue(b.s, { whId: W, jobId: JOB, lines: [{ productId: r.product.id, qty: 10 }] }, b.eng).doc;
  D.confirmOpening(b.s, r.opening.cc.id, b.store, true);
  assert.equal(D.qtyAt(b.s, r.product.id, W, 'ทั่วไป'), 24);
  assert.equal(r.opening.cc.stage, 'done');
  assert.ok(b.s.notifs.some((x) => x.to === b.eng.id && /อนุมัติ|ยืนยัน/.test(x.text)));
  assert.equal(doc.lines[0].reserved, 10); assert.equal(doc.fill, 'ready');
  assert.equal(D.pendingOpening(b.s, r.product.id, W), 0);
});
test('OS-AC4 reject needs a reason, stock stays out, product stays, reason in notice', () => {
  const b = base();
  const r = mk(b, { initial: { whId: W, qty: 24 } }, b.eng);
  assert.throws(() => D.confirmOpening(b.s, r.opening.cc.id, b.store, false, '  '), { code: 'reason_required' });
  D.confirmOpening(b.s, r.opening.cc.id, b.store, false, 'ไม่เจอของ');
  assert.equal(r.opening.cc.stage, 'rejected'); assert.equal(D.qtyOf(b.s, r.product.id, W), 0);
  assert.ok(b.s.products.includes(r.product));
  assert.ok(b.s.notifs.some((x) => x.to === b.eng.id && x.text.includes('ไม่เจอของ')));
  assert.equal(D.pendingOpening(b.s, r.product.id, W), 0);
});
test('OS-AC5 needsApproval: store submit waits for head; engineer -> store -> head', () => {
  const b = base(); const p = mkNA(b);
  const a = D.submitOpening(b.s, { productId: p.id, whId: W, qty: 5, kind: 'found' }, b.store);
  assert.equal(a.cc.stage, 'head'); assert.equal(D.qtyOf(b.s, p.id, W), 0);
  assert.match(a.message, /รอหัวหน้าอนุมัติยอด \(CC-/);
  assert.throws(() => D.confirmOpening(b.s, a.cc.id, b.store, true), msg(D.FORBIDDEN));
  D.confirmOpening(b.s, a.cc.id, b.head, true); assert.equal(D.qtyOf(b.s, p.id, W), 5);
  const e = D.submitOpening(b.s, { productId: p.id, whId: W, qty: 3, kind: 'found' }, b.eng);
  assert.equal(e.cc.stage, 'store');
  D.confirmOpening(b.s, e.cc.id, b.store, true);
  assert.equal(e.cc.stage, 'head'); assert.equal(D.qtyOf(b.s, p.id, W), 5);
  assert.ok(b.s.notifs.some((x) => x.to === b.head.id));
  const h = D.submitOpening(b.s, { productId: p.id, whId: W, qty: 2, kind: 'found' }, b.head);
  assert.equal(h.cc, null); assert.equal(D.qtyOf(b.s, p.id, W), 7);
});
test('OS-AC6 roll lengths become rolls on ทั่วไป', () => {
  const b = base();
  const r = mk(b, { isRoll: true, unit: 'เมตร', initial: { whId: W, rollLengths: [85, 40] } }, b.store);
  const rolls = b.s.rolls.filter((x) => x.productId === r.product.id);
  assert.equal(rolls.length, 2); assert.ok(rolls.every((x) => x.shelf === 'ทั่วไป'));
  assert.equal(D.qtyOf(b.s, r.product.id, W), 125);
  assert.throws(() => mk(b, { isRoll: true, initial: { whId: W, rollLengths: [85, 0] } }, b.store), msg('ใส่ความยาวของทุกม้วน (มากกว่า 0)'));
});
test('OS-AC7 non-metre unit must be integer; nothing is left behind', () => {
  const b = base(); const np = b.s.products.length, pc = b.s.counters.P, cc = b.s.counters.CC, na = b.s.audit.length;
  assert.throws(() => mk(b, { initial: { whId: W, qty: 2.5 } }, b.store), msg('ตัวต้องเป็นจำนวนเต็ม'));
  assert.throws(() => mk(b, { initial: { whId: W, qty: 0 } }, b.eng), msg('ใส่จำนวนที่มีอยู่ (มากกว่า 0)'));
  assert.throws(() => mk(b, { initial: { whId: '', qty: 1 } }, b.eng), msg('เลือกคลังที่มีของ'));
  b.s.warehouses[0].countId = 'CC-0009';
  assert.throws(() => mk(b, { initial: { whId: W, qty: 1 } }, b.store), { code: 'wh_counting' });
  assert.equal(b.s.products.length, np); assert.equal(b.s.counters.P, pc); assert.equal(b.s.counters.CC, cc); assert.equal(b.s.audit.length, na);
});
test('OS-AC8 CSV: unknown code row is flagged, import refused until the bad row is cut', () => {
  const b = base(); const p = b.s.products[1];
  const csv = `code,warehouse,location,qty,roll_no,roll_initial,batch\n${p.code},${W},,5,,,\nNOPE-1,${W},,5,,,\n`;
  const { rows } = D.parseOpeningCsv(b.s, csv);
  assert.deepEqual(rows[0].errors, []); assert.deepEqual(rows[1].errors, ['ไม่พบรหัสสินค้าในระบบ (สร้างรหัสก่อน)']);
  assert.throws(() => D.importOpening(b.s, rows, b.head), msg('ตัดแถวที่ผิดก่อน'));
  const before = D.qtyOf(b.s, p.id, W);
  D.importOpening(b.s, rows.filter((r) => !r.errors.length), b.head);
  assert.equal(D.qtyOf(b.s, p.id, W), before + 5);
});
test('OS-AC9 approvalItems: store sees only its CCs + engineer receipts; engineer nothing', () => {
  const b = base();
  const r = mk(b, { initial: { whId: W, qty: 3 } }, b.eng);
  const na = mkNA(b); D.submitOpening(b.s, { productId: na.id, whId: W, qty: 1, kind: 'found' }, b.store);
  b.s.settings.requireApproval = true;
  D.issue(b.s, { whId: W, jobId: JOB, lines: [{ productId: 'P-0002', qty: 1 }] }, b.eng);
  const rc = D.receive(b.s, { whId: W, lines: [{ productId: 'P-0002', qty: 1 }] }, b.eng);
  const st = D.approvalItems(b.s, b.store);
  assert.deepEqual(st.ccs.map((c) => c.id), [r.opening.cc.id]); assert.deepEqual(st.issues, []); assert.deepEqual(st.receipts.map((d) => d.id), [rc.id]);
  const hd = D.approvalItems(b.s, b.head);
  assert.equal(hd.ccs.length, 2); assert.ok(hd.issues.length >= 1); assert.equal(hd.receipts.length, 1);
  assert.deepEqual(D.approvalItems(b.s, b.eng), { issues: [], receipts: [], ccs: [] });
});
test('OS-G2 found stock for an existing product posts at once for store', () => {
  const b = base(); const before = D.qtyOf(b.s, 'P-0004', W);
  const r = D.submitOpening(b.s, { productId: 'P-0004', whId: W, qty: 4, kind: 'found' }, b.store);
  assert.equal(r.cc, null); assert.equal(D.qtyOf(b.s, 'P-0004', W), before + 4);
});
test('OS-G3 found may pick a shelf; opening always lands on ทั่วไป', () => {
  const b = base(); const a0 = D.qtyAt(b.s, 'P-0004', W, 'A-02');
  D.submitOpening(b.s, { productId: 'P-0004', whId: W, shelf: 'A-02', qty: 2, kind: 'found' }, b.store);
  assert.equal(D.qtyAt(b.s, 'P-0004', W, 'A-02'), a0 + 2);
  const p = mk(b).product;
  D.submitOpening(b.s, { productId: p.id, whId: W, shelf: 'A-02', qty: 2, kind: 'opening' }, b.store);
  assert.equal(D.qtyAt(b.s, p.id, W, 'ทั่วไป'), 2); assert.equal(D.qtyAt(b.s, p.id, W, 'A-02'), 0);
  assert.throws(() => D.submitOpening(b.s, { productId: p.id, whId: W, shelf: 'QC', qty: 2, kind: 'found' }, b.store), { code: 'shelf_invalid' });
});
test('OS-G4 CSV import: head only, locked, bypasses needsApproval', () => {
  const b = base(); const p = mkNA(b);
  const csv = `code,warehouse,location,qty,roll_no,roll_initial,batch\n${p.code},${W},A-01,7,,,L1\n`;
  const { rows } = D.parseOpeningCsv(b.s, csv);
  assert.throws(() => D.importOpening(b.s, rows, b.store), msg(D.FORBIDDEN));
  D.setOpeningLock(b.s, true, b.head);
  assert.throws(() => D.importOpening(b.s, rows, b.head), msg('ยอดยกมาถูกล็อกแล้ว'));
  assert.throws(() => D.setOpeningLock(b.s, false, b.store), msg(D.FORBIDDEN));
  D.setOpeningLock(b.s, false, b.head);
  D.importOpening(b.s, rows, b.head);
  assert.equal(D.qtyAt(b.s, p.id, W, 'A-01'), 7);
  assert.ok(b.s.audit.some((a) => a.action === 'opening.import'));
});
test('CSV bad rows: non-integer, closed warehouse, duplicate rows, roll rules', () => {
  const b = base(); const p = b.s.products.find((x) => !x.isRoll && x.unit === 'ตัว'), roll = b.s.products.find((x) => x.isRoll);
  const h = 'code,warehouse,location,qty,roll_no,roll_initial,batch\n';
  const e = (txt) => D.parseOpeningCsv(b.s, h + txt).rows.map((r) => r.errors);
  assert.deepEqual(e(`${p.code},${W},,2.5,,,`), [['ตัวต้องเป็นจำนวนเต็ม']]);
  b.s.warehouses[2].active = false; b.s.warehouses[1].countId = 'CC-9';
  assert.deepEqual(e(`${p.code},W-B,,1,,,`), [['คลังไซต์งาน B ปิดใช้งานอยู่']]);
  assert.equal(e(`${p.code},W-A,,1,,,`)[0].length, 1);
  assert.deepEqual(e(`${p.code},${W},,1,,,\n${p.code},${W},,1,,,`), [[], ['ข้อมูลซ้ำในไฟล์']]);
  assert.deepEqual(e(`${roll.code},${W},,50,,,`), [['สินค้าติดตามรายม้วนต้องมีเลขม้วน']]);
  assert.deepEqual(e(`${roll.code},${W},,50,${b.s.rolls[0].id},,`), [['เลขม้วนซ้ำกับในระบบ']]);
  assert.deepEqual(e(`${p.code},${W},Z-99,1,,,`), [['ไม่พบตำแหน่ง']]);
  assert.deepEqual(e(`${p.code},ZZ,,1,,,`), [['ไม่พบคลัง']]);
  assert.deepEqual(e(`,${W},,1,,,`), [['ไม่มีรหัสสินค้า']]);
  assert.deepEqual(e(`${p.code},${W},,0,,,`), [['จำนวนไม่ถูกต้อง']]);
  const ok = D.parseOpeningCsv(b.s, h + `${roll.code},${W},,50,R-900001,100,\n`);
  D.importOpening(b.s, ok.rows, b.head);
  assert.ok(b.s.rolls.some((r) => r.id === 'R-900001' && r.length === 50 && r.opened));
});
test('IF20/25 pending opening covers the shortfall of a waiting issue; reject opens PRs', () => {
  const b = base();
  const r = mk(b, { initial: { whId: W, qty: 10 } }, b.eng);
  const out = D.issue(b.s, { whId: W, jobId: JOB, lines: [{ productId: r.product.id, qty: 15 }] }, b.head);
  assert.equal(out.prs.length, 1); assert.equal(out.prs[0].qty, 5);
  D.confirmOpening(b.s, r.opening.cc.id, b.store, false, 'ไม่มีของ');
  const prs = b.s.prs.filter((x) => x.reqId === out.doc.id);
  assert.equal(prs.reduce((a, x) => a + x.qty, 0), 15);
  assert.ok(b.s.notifs.some((x) => x.to === b.head.id && x.text.includes(out.doc.id)));
});
test('IF20/25 confirmed opening reserves for the waiting issue and leaves no extra PR', () => {
  const b = base();
  const r = mk(b, { initial: { whId: W, qty: 10 } }, b.eng);
  const out = D.issue(b.s, { whId: W, jobId: JOB, lines: [{ productId: r.product.id, qty: 10 }] }, b.head);
  assert.equal(out.prs.length, 0);
  D.confirmOpening(b.s, r.opening.cc.id, b.store, true);
  assert.equal(out.doc.lines[0].reserved, 10); assert.equal(b.s.prs.filter((x) => x.reqId === out.doc.id).length, 0);
});
test('PD-AC8 count adjustments of needsApproval products wait for head', () => {
  const b = base(); const p = mkNA(b);
  D.submitOpening(b.s, { productId: p.id, whId: W, qty: 10, kind: 'found' }, b.head);
  const plain = 'P-0004';
  const run = (counted, who) => {
    const c = D.startCount(b.s, { whId: W }, b.store);
    D.setCounted(b.s, c.id, p.id, counted); D.setCounted(b.s, c.id, plain, D.qtyOf(b.s, plain, W) + 1);
    return D.closeCount(b.s, c.id, who);
  };
  const p0 = D.qtyOf(b.s, plain, W);
  run(7, b.store);
  assert.equal(D.qtyOf(b.s, p.id, W), 10); assert.equal(D.qtyOf(b.s, plain, W), p0 + 1);
  const cc = b.s.ccs.find((x) => x.kind === 'count' && x.stage === 'head');
  assert.equal(cc.diff, -3);
  assert.ok(D.approvalItems(b.s, b.head).ccs.includes(cc)); assert.ok(!D.approvalItems(b.s, b.store).ccs.includes(cc));
  assert.equal(D.pendingOpening(b.s, p.id, W), 0);
  D.confirmOpening(b.s, cc.id, b.head, true); assert.equal(D.qtyOf(b.s, p.id, W), 7);
  run(9, b.store);
  const up = b.s.ccs.find((x) => x.kind === 'count' && x.stage === 'head');
  assert.equal(up.diff, 2); D.confirmOpening(b.s, up.id, b.head, false, 'นับผิด');
  assert.equal(D.qtyOf(b.s, p.id, W), 7);
  run(5, b.head); assert.equal(D.qtyOf(b.s, p.id, W), 5);
});
