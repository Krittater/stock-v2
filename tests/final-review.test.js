// แก้ตามผลรีวิวรอบสุดท้ายของทั้ง branch (ดู .superpowers/sdd/2026-11-21-core-screens/final-fix-report.md)
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./_load.js');
const Seed = require('../mockup/js/seed.js');

const W = 'W-BN', JOB = 'J-25-010';
function mk() {
  const s = Seed.build({ products: 50 });
  const U = (r) => s.users.find((u) => u.role === r);
  const cat = s.categories.find((c) => c.parentId && !c.needsApproval).id;
  const b = { s, eng: U('engineer'), store: U('store'), head: U('head'), cat };
  b.prod = (name, extra = {}) => D.addProduct(s, { name, unit: 'ตัว', categoryId: cat, ...extra }, b.head).product;
  b.wait = (p, qty = 10) => D.issue(s, { whId: W, jobId: JOB, lines: [{ productId: p.id, qty }] }, b.eng).doc;
  return b;
}
const openQty = (s, docId, pid) => s.prs.filter((r) => r.reqId === docId && r.productId === pid && r.status === 'open').reduce((a, r) => a + r.qty - r.received, 0);

test('#1 อนุมัติใบเบิกรออนุมัติของ seed ได้ทุกใบ ไม่พังกลางทาง', () => {
  const { s, head } = mk();
  const pend = s.docs.filter((d) => d.type === 'issue' && d.status === 'pending');
  assert.equal(pend.length, 7);
  assert.ok(pend.every((d) => Array.isArray(d.prIds)));
  for (const d of pend) {
    const r = D.approveIssue(s, d.id, head, true);
    assert.equal(r.doc.status, 'posted', d.id);
  }
  assert.equal(s.docs.filter((d) => d.status === 'pending').length, 0);
});

test('#1 ใบเก่าที่ไม่มี prIds ก็อนุมัติได้ · ตรวจก่อนตัด ถ้าล้มไม่ตัดยอดเลย', () => {
  const b = mk(), { s } = b;
  const p = b.prod('ทดสอบ prIds'); D.putStock(s, { productId: p.id, whId: W, qty: 3 });
  s.settings.requireApproval = true;
  const d = D.issue(s, { whId: W, jobId: JOB, lines: [{ productId: p.id, qty: 5 }] }, b.eng).doc;
  delete d.prIds;
  D.approveIssue(s, d.id, b.head, true);
  assert.equal(d.fill, 'partial'); assert.equal(d.prIds.length, 1);
  // สินค้าเลิกใช้ระหว่างรออนุมัติ → ล้มก่อนแตะยอด และอนุมัติซ้ำไม่ตัดซ้ำ
  const q = b.prod('ทดสอบเลิกใช้'); D.putStock(s, { productId: q.id, whId: W, qty: 4 });
  const e = D.issue(s, { whId: W, jobId: JOB, lines: [{ productId: q.id, qty: 2 }] }, b.eng).doc;
  q.active = false;
  const before = D.qtyOf(s, q.id, W);
  assert.throws(() => D.approveIssue(s, e.id, b.head, true), { code: 'prod_inactive' });
  assert.throws(() => D.approveIssue(s, e.id, b.head, true), { code: 'prod_inactive' });
  assert.equal(D.qtyOf(s, q.id, W), before); assert.equal(e.status, 'pending');
});

test('#2 นับเจอน้อยกว่าที่กันไว้: releaseExcess ลดที่กัน ใบ ready กลับไปรอ PR เปิดใหม่ จ่ายได้', () => {
  const b = mk(), { s } = b;
  const p = b.prod('ทดสอบนับ');
  const d = b.wait(p);
  D.receive(s, { whId: W, lines: [{ productId: p.id, qty: 10, prId: d.prIds[0] }] }, b.store);
  assert.equal(d.fill, 'ready');
  const c = D.startCount(s, { whId: W }, b.store); D.setCounted(s, c.id, p.id, 4); D.closeCount(s, c.id, b.store);
  assert.equal(D.qtyOf(s, p.id, W), 4); assert.equal(D.reservedAt(s, p.id, W), 4);
  assert.equal(d.fill, 'waiting'); assert.equal(openQty(s, d.id, p.id), 6);
  assert.ok(s.audit.some((a) => a.action === 'hold.release' && a.ref === d.id));
  D.pickReserved(s, d.id, b.store);
  assert.equal(d.lines[0].issued, 4); assert.equal(d.lines[0].waiting, 6);
});

test('#2 releaseExcess ลดจากใบใหม่สุดก่อน และไม่แตะเมื่อไม่เกิน', () => {
  const b = mk(), { s } = b;
  const p = b.prod('ทดสอบสองใบ');
  const a1 = b.wait(p, 6); const a2 = b.wait(p, 6);
  a1.at = '2026-01-01T00:00:00.000Z'; a2.at = '2026-01-02T00:00:00.000Z';
  D.receive(s, { whId: W, lines: [{ productId: p.id, qty: 12 }] }, b.store);
  assert.equal(a1.fill, 'ready'); assert.equal(a2.fill, 'ready');
  assert.deepEqual(D.releaseExcess(s, p.id, W), []);
  s.stock[D.stockKey(p.id, W)] = 8; // ของหายไปเฉยๆ
  D.releaseExcess(s, p.id, W);
  assert.equal(a1.lines[0].reserved, 6); assert.equal(a2.lines[0].reserved, 2);
  assert.equal(a1.fill, 'ready'); assert.equal(a2.fill, 'waiting');
  assert.equal(openQty(s, a2.id, p.id), 4);
});

test('#2 count cc ของสินค้าต้องอนุมัติที่หัวหน้าอนุมัติลบ ก็ปล่อยที่กันเกิน', () => {
  const b = mk(), { s } = b;
  const p = b.prod('ต้องอนุมัติ', { needsApproval: true });
  const d = b.wait(p);
  D.receive(s, { whId: W, lines: [{ productId: p.id, qty: 10, prId: d.prIds[0] }] }, b.store);
  const c = D.startCount(s, { whId: W }, b.store); D.setCounted(s, c.id, p.id, 3);
  const r = D.closeCount(s, c.id, b.store);
  assert.equal(r.pending.length, 1); assert.equal(D.qtyOf(s, p.id, W), 10);
  D.confirmOpening(s, r.pending[0].id, b.head, true);
  assert.equal(D.qtyOf(s, p.id, W), 3); assert.equal(D.reservedAt(s, p.id, W), 3);
  assert.equal(d.fill, 'waiting'); assert.equal(openQty(s, d.id, p.id), 7);
});

test('#3 pickReserved ไม่ได้ขณะคลังกำลังนับ', () => {
  const b = mk(), { s } = b;
  const p = b.prod('ทดสอบล็อก');
  const d = b.wait(p, 5);
  D.receive(s, { whId: W, lines: [{ productId: p.id, qty: 5, prId: d.prIds[0] }] }, b.store);
  const c = D.startCount(s, { whId: W }, b.store);
  const snap = JSON.stringify(s.stock);
  assert.throws(() => D.pickReserved(s, d.id, b.store), { code: 'wh_counting' });
  assert.equal(JSON.stringify(s.stock), snap);
  D.cancelCount(s, c.id, b.store);
  assert.equal(D.pickReserved(s, d.id, b.store).fill, 'full');
});

test('#4 ส่งใบเบิกรออนุมัติลง audit (issue.submit)', () => {
  const b = mk(), { s } = b;
  s.settings.requireApproval = true;
  const n = s.audit.length;
  const r = D.issue(s, { whId: W, jobId: JOB, lines: [{ productId: 'P-0001', qty: 1 }] }, b.eng);
  assert.equal(r.outcome, 'pending');
  const a = s.audit.slice(n);
  assert.equal(a.length, 1); assert.equal(a[0].action, 'issue.submit'); assert.equal(a[0].ref, r.doc.id); assert.equal(a[0].by, b.eng.id);
});

test('#5 stockStatus byAvailable: ของที่กันไว้หมด = out ส่วนค่าเริ่มต้น (KPI) ยังใช้ยอดจริง', () => {
  const b = mk(), { s } = b;
  const p = b.prod('ทดสอบสถานะ', { reorderPoint: 1 });
  const d = b.wait(p, 10);
  D.receive(s, { whId: W, lines: [{ productId: p.id, qty: 10, prId: d.prIds[0] }] }, b.store);
  assert.equal(D.available(s, p.id, W), 0);
  assert.equal(D.stockStatus(s, p, W), 'in');
  assert.equal(D.stockStatus(s, p, W, { byAvailable: true }), 'out');
});

test('#6 เลิกใช้สินค้าไม่ได้ขณะมี cc (ยอดตั้งต้น/ของที่เจอ/ปรับยอดนับ) รอ · เบิกสินค้าเลิกใช้ไม่ได้', () => {
  const b = mk(), { s } = b;
  const p = b.prod('ทดสอบเลิกใช้ 2');
  for (const kind of ['opening', 'found']) {
    const r = D.submitOpening(s, { productId: p.id, whId: W, qty: 5, kind }, b.eng);
    assert.throws(() => D.setProductActive(s, p.id, false, b.head), { code: 'prod_pending' }, kind);
    D.confirmOpening(s, r.cc.id, b.store, false, 'ไม่ผ่าน');
  }
  const q = b.prod('ทดสอบนับรอ', { needsApproval: true });
  D.putStock(s, { productId: q.id, whId: W, qty: 5 });
  const c = D.startCount(s, { whId: W }, b.store); D.setCounted(s, c.id, q.id, 4); D.closeCount(s, c.id, b.store);
  assert.equal(s.ccs.filter((x) => x.kind === 'count' && x.stage === 'head').length, 1);
  assert.throws(() => D.setProductActive(s, q.id, false, b.head), { code: 'prod_pending' });
  // ไม่มี cc ค้าง ของเป็น 0 → เลิกใช้ได้ แล้วเบิกไม่ได้
  assert.equal(D.setProductActive(s, p.id, false, b.head).active, false);
  assert.throws(() => D.issue(s, { whId: W, jobId: JOB, lines: [{ productId: p.id, qty: 1 }] }, b.eng), { code: 'prod_inactive', message: /เลิกใช้/ });
});

test('#7 ปิดใบเบิกข้าม PR ที่ใบรับรอยืนยันอ้างอยู่ — Store ยืนยันทีหลังไม่ติด pr_closed', () => {
  const b = mk(), { s } = b;
  const p = b.prod('ทดสอบ PR ถูกอ้าง');
  const d = b.wait(p, 10);
  const rc = D.receive(s, { whId: W, lines: [{ productId: p.id, qty: 10, prId: d.prIds[0] }] }, b.eng);
  assert.equal(rc.status, 'pending');
  assert.deepEqual(D.openPRsOf(s, [d]), []); assert.equal(D.heldPRsOf(s, [d]).length, 1);
  assert.equal(D.closeJobCheck(s, JOB).heldPRs.some((r) => r.id === d.prIds[0]), true);
  const r = D.closeIssue(s, d.id, b.head);
  assert.deepEqual(r.cancelledPRs, []);
  assert.equal(s.prs.find((x) => x.id === d.prIds[0]).status, 'open');
  assert.doesNotThrow(() => D.confirmReceipt(s, rc.id, b.store, true));
  assert.equal(D.qtyOf(s, p.id, W), 10);
});

test('#8 confirmReceipt: เหตุผลรับเกินไม่ถูกบันทึกถ้าตรวจไม่ผ่าน', () => {
  const b = mk(), { s } = b;
  const p = b.prod('ทดสอบเหตุผล');
  const d = b.wait(p, 5);
  const rc = D.receive(s, { whId: W, lines: [{ productId: p.id, qty: 5, prId: d.prIds[0] }] }, b.eng);
  s.warehouses.find((w) => w.id === W).countId = 'CC-X';
  assert.throws(() => D.confirmReceipt(s, rc.id, b.store, true, 'เหตุผลใหม่'), { code: 'wh_counting' });
  assert.ok(!rc.overReason); assert.equal(rc.status, 'pending');
  s.warehouses.find((w) => w.id === W).countId = null;
  // ระหว่างรอ มีใบรับอื่นลดยอดค้างรับ → ตอนยืนยันกลายเป็นรับเกิน
  D.receive(s, { whId: W, lines: [{ productId: p.id, qty: 3, prId: d.prIds[0] }] }, b.store);
  assert.throws(() => D.confirmReceipt(s, rc.id, b.store, true, ''), { code: 'over_receive' });
  assert.ok(!rc.overReason);
  D.confirmReceipt(s, rc.id, b.store, true, 'ผู้ขายส่งเกิน');
  assert.equal(rc.overReason, 'ผู้ขายส่งเกิน');
});

test('#9 ตัวช่วยร่วม: OPEN_FILL, canCloseIssue/canCancelIssue, ccQty, countLineHeld, returnMatches, isLegacyReturn', () => {
  assert.deepEqual(D.OPEN_FILL, ['partial', 'waiting', 'ready']);
  assert.ok(D.isOpenFill('ready') && !D.isOpenFill('full') && !D.isOpenFill('closed'));
  const doc = (o) => ({ status: 'posted', fill: 'waiting', lines: [{ issued: 0 }], ...o });
  assert.ok(D.canCloseIssue(doc())); assert.ok(!D.canCloseIssue(doc({ fill: 'full' }))); assert.ok(!D.canCloseIssue(doc({ status: 'pending', fill: undefined })));
  assert.ok(D.canCancelIssue(doc())); assert.ok(!D.canCancelIssue(doc({ fill: 'partial', lines: [{ issued: 2 }] })));
  assert.ok(D.canCancelIssue(doc({ status: 'pending', fill: undefined })));
  assert.equal(D.ccQty({ kind: 'count', diff: -3 }), -3); assert.equal(D.ccQty({ rollLengths: [10, 5.5] }), 15.5); assert.equal(D.ccQty({ qty: 7 }), 7);
  const b = mk(), { s } = b;
  const p = b.prod('ต้องอนุมัติ 2', { needsApproval: true });
  const line = { productId: p.id, system: 5, counted: 4 };
  assert.ok(D.isCountDiff(line) && !D.isCountDiff({ ...line, counted: 5 }) && !D.isCountDiff({ ...line, counted: null }));
  assert.ok(D.countLineHeld(s, b.store, line)); assert.ok(!D.countLineHeld(s, b.head, line));
  assert.ok(D.isLegacyReturn('ตัว', 2.5, 2.5)); assert.ok(!D.isLegacyReturn('ตัว', 3, 3)); assert.ok(!D.isLegacyReturn('เมตร', 2.5, 2.5));
  const x = D.returnable(s, b.head, '')[0];
  assert.ok(D.returnMatches(s, x, x.doc.id)); assert.ok(D.returnMatches(s, x, '')); assert.ok(!D.returnMatches(s, x, 'ไม่มีทางตรงกัน-zzz'));
  assert.equal(D.returnable(s, b.head, 'ไม่มีทางตรงกัน-zzz').length, 0);
});

test('#13 parseSaved ต้องมี settings/stock/rolls/prs/jobs/counters', () => {
  const s = Seed.build({ products: 50 });
  assert.ok(D.parseSaved(JSON.stringify(s)));
  for (const k of ['settings', 'stock', 'rolls', 'prs', 'jobs', 'counters']) { const t = { ...s }; delete t[k]; assert.equal(D.parseSaved(JSON.stringify(t)), null, k); }
});

test('#14 สลับ requireApproval ลง audit เฉพาะหัวหน้า และเมื่อค่าเปลี่ยน', () => {
  const b = mk(), { s } = b;
  const n = s.audit.length;
  assert.throws(() => D.setRequireApproval(s, true, b.store), { code: 'forbidden' });
  D.setRequireApproval(s, true, b.head); D.setRequireApproval(s, true, b.head); D.setRequireApproval(s, false, b.head);
  const a = s.audit.slice(n);
  assert.deepEqual(a.map((x) => x.action), ['setting.approval', 'setting.approval']); assert.equal(a[0].by, b.head.id);
  assert.equal(s.settings.requireApproval, false);
});

test('#15 CSV กันสูตร: ขึ้นต้นด้วย = + - @ tab หรือ CR ได้เครื่องหมาย \'', () => {
  const b = mk(), { s } = b;
  D.issue(s, { whId: W, jobId: JOB, lines: [{ productId: 'P-0001', qty: 1 }] }, b.head);
  s.products[0].name = '\tabc';
  assert.ok(D.jobUsageCsv(s, JOB).includes("'\tabc"));
  s.products[0].name = '\rabc';
  assert.ok(D.jobUsageCsv(s, JOB).includes('"\'\rabc"'));
  s.products[0].name = '=1+1';
  assert.ok(D.jobUsageCsv(s, JOB).includes("'=1+1"));
});

test('#16 สร้างสินค้า: product.add ลงก่อน opening · ล้มแล้วไม่เหลือ audit', () => {
  const b = mk(), { s } = b;
  const n = s.audit.length;
  const r = D.addProduct(s, { name: 'มียอดตั้งต้น', unit: 'ตัว', categoryId: b.cat, initial: { whId: W, qty: 3 } }, b.head);
  assert.deepEqual(s.audit.slice(n).map((a) => a.action), ['product.add', 'opening.post']); assert.ok(r.product);
  const m = s.audit.length;
  assert.throws(() => D.addProduct(s, { name: 'ยอดผิด', unit: 'ตัว', categoryId: b.cat, initial: { whId: W, qty: 0 } }, b.head));
  assert.equal(s.audit.length, m); assert.ok(!s.products.some((p) => p.name === 'ยอดผิด'));
});

test('#17 vendorCode ซ้ำกับรหัส/id ของสินค้าอื่นไม่ได้', () => {
  const b = mk(), { s } = b;
  const other = s.products[1];
  assert.throws(() => b.prod('บาร์โค้ดชนรหัส', { vendorCode: other.code }), { code: 'vendor_dup' });
  assert.throws(() => b.prod('บาร์โค้ดชน id', { vendorCode: other.id }), { code: 'vendor_dup' });
  const p = b.prod('บาร์โค้ดปกติ', { vendorCode: 'VC-UNIQUE-1' });
  assert.throws(() => D.updateProduct(s, p.id, { vendorCode: other.code }, b.head), { code: 'vendor_dup' });
});
