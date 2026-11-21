const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./_load.js');

const SHELVES = [{ code: 'ทั่วไป', active: true }, { code: 'QC', active: true, qc: true }];
const yy = String(new Date().getFullYear()).slice(-2);
const today = D.today;
function mini() {
  return {
    version: 3,
    counters: { P: 0, REQ: 0, PR: 0, RC: 0, CC: 0, ADJ: 0, J: 0, C: 0, RT: 0, R: 0 },
    settings: { requireApproval: false },
    currentUserId: 'U-1',
    users: [
      { id: 'U-1', name: 'หัวหน้า', role: 'head' }, { id: 'U-2', name: 'สโตร์', role: 'store' },
      { id: 'U-3', name: 'สมชาย', role: 'engineer' },
    ],
    warehouses: [{ id: 'W-BN', name: 'W-BN', location: '', countId: null, shelves: SHELVES.map((x) => ({ ...x })) }],
    categories: [],
    products: [{ id: 'P-0001', code: 'P-0001', name: 'น็อต', unit: 'ตัว', categoryId: null, reorderPoint: 1, isRoll: false }],
    stock: { 'P-0001|W-BN|ทั่วไป': 100 },
    rolls: [], notifs: [], audit: [], returns: [],
    jobs: [
      { id: 'J-25-010', name: 'อาคารสำนักงาน โซน A', customer: 'ก', open: true },
      { id: 'J-25-002', name: 'ซ่อมบำรุงประจำปี', customer: 'ข', open: true },
      { id: 'J-24-008', name: 'ปรับปรุงห้องควบคุม โรงงาน C', customer: 'ค', open: false },
    ],
    docs: [], prs: [], counts: [], cart: { lines: [], whId: 'W-BN', jobId: '', note: '' },
  };
}
const [head, , eng] = mini().users;
const iss = (s, qty, jobId = 'J-25-010', who = eng) => D.issue(s, { whId: 'W-BN', jobId, lines: [{ productId: 'P-0001', qty }] }, who).doc;

test('JB-AC1 สร้างงาน: รหัส J-YY-NNN รันต่อปี เจ้าของ = ผู้สร้าง เปิดอยู่ + log', () => {
  const s = mini();
  const j = D.addJob(s, { name: 'ติดตั้งแอร์ ห้องประชุม' }, eng);
  assert.equal(j.id, `J-${yy}-001`);
  assert.equal(D.addJob(s, { name: 'งานสอง' }, eng).id, `J-${yy}-002`);
  assert.deepEqual([j.ownerId, j.open, j.start], ['U-3', true, today()]);
  assert.ok(s.audit.some((a) => a.action === 'job.add' && a.ref === j.id));
});

test('JB-AC2 ชื่อคล้าย: เจอ + pct รวมงานปิดแล้ว ไม่บล็อกการบันทึก', () => {
  const s = mini();
  const r = D.similarJobs(s, 'ซ่อมบำรุงประจำปี 2');
  assert.equal(r[0].job.id, 'J-25-002'); assert.ok(r[0].pct >= 45);
  assert.equal(D.similarJobs(s, 'ปรับปรุงห้องควบคุม โรงงาน D')[0].job.id, 'J-24-008'); // งานปิดแล้วก็แสดง
  assert.deepEqual(D.similarJobs(s, 'ซ่อมบำรุงประจำปี'), []); // เหมือนเป๊ะไม่นับ
  assert.deepEqual(D.similarJobs(s, 'ab'), []);
  assert.equal(D.addJob(s, { name: 'ซ่อมบำรุงประจำปี 2' }, eng).open, true);
});

test('JB-AC3 ชื่อว่าง → ไม่สร้าง', () => {
  const s = mini(); const n = s.jobs.length;
  assert.throws(() => D.addJob(s, { name: '  ' }, eng), { message: 'กรุณาระบุชื่องาน' });
  assert.equal(s.jobs.length, n);
});

test('JB-AC4 มีใบเบิกจ่ายบางส่วน → ปิดงานไม่ได้ ข้อความมีเลขใบ', () => {
  const s = mini(); const a = iss(s, 150);
  assert.equal(a.fill, 'partial');
  assert.throws(() => D.closeJob(s, 'J-25-010', head), { message: `ยังมีใบเบิกที่ไม่ปิด ${a.id} — ปิดหรือยกเลิกก่อนปิดงาน` });
  assert.equal(s.jobs[0].open, true);
});

test('JB-AC5 ปิดใบเบิกค้างแล้วปิดงานได้ · มีวันปิด · due เติมวันนี้', () => {
  const s = mini(); const a = iss(s, 150);
  D.closeIssue(s, a.id, head);
  const { job } = D.closeJob(s, 'J-25-010', head);
  assert.equal(job.open, false); assert.ok(job.closedAt);
  assert.equal(job.due, today());
  assert.ok(s.audit.some((x) => x.action === 'job.close' && x.text.includes('ปิดโดย หัวหน้า')));
});

test('JB-AC6 เบิกเข้างานปิดแล้วไม่ได้ · คืนของจากใบเดิมยังได้', () => {
  const s = mini(); const a = iss(s, 10);
  D.closeJob(s, 'J-25-010', head);
  assert.throws(() => iss(s, 1), { message: 'งาน J-25-010 ปิดไปแล้ว เบิกเพิ่มไม่ได้ (เปิดงานอีกครั้งที่หน้างาน / โครงการ)' });
  D.returnItems(s, { docId: a.id, whId: 'W-BN', lines: [{ productId: 'P-0001', qty: 3, condition: 'ok' }] }, eng);
  assert.equal(D.jobUsage(s, 'J-25-010')[0].returned, 3);
});

test('JB-AC7 เปิดงานอีกครั้ง → เบิกได้ ลงประวัติ · clone ตั้งชื่อไม่ชน', () => {
  const s = mini(); D.closeJob(s, 'J-25-010', head);
  const j = D.reopenJob(s, 'J-25-010', head);
  assert.deepEqual([j.open, j.closedAt], [true, null]);
  assert.ok(s.audit.some((x) => x.action === 'job.reopen'));
  assert.ok(iss(s, 1));
  const n = s.audit.length; D.reopenJob(s, 'J-25-010', head); assert.equal(s.audit.length, n); // เปิดอยู่แล้ว no-op
  const c1 = D.cloneJob(s, 'J-25-010', eng), c2 = D.cloneJob(s, 'J-25-010', eng);
  assert.equal(c1.name, 'อาคารสำนักงาน โซน A (ใหม่)'); assert.equal(c2.name, 'อาคารสำนักงาน โซน A (ใหม่ 2)');
  assert.equal(c1.customer, 'ก');
});

test('JB-AC8 สรุปงาน: เบิก 10 คืน 3 ใช้จริง 7', () => {
  const s = mini(); const a = iss(s, 10);
  D.returnItems(s, { docId: a.id, whId: 'W-BN', lines: [{ productId: 'P-0001', qty: 3, condition: 'ok' }] }, eng);
  const u = D.jobUsage(s, 'J-25-010')[0];
  assert.deepEqual([u.issued, u.returned, u.used], [10, 3, 7]);
});

test('JB-AC9 closeJobCheck: ของค้างคืนไม่บล็อก (Q2) · PR ที่ received 0 ถูกยกเลิก (Q3)', () => {
  const s = mini(); const a = iss(s, 150); // partial + PR 50
  const b = iss(s, 5, 'J-25-002');
  D.closeIssue(s, a.id, head, { cancelPRs: false });
  const chk = D.closeJobCheck(s, 'J-25-010');
  assert.deepEqual(chk.unreturned, [{ productId: 'P-0001', docId: a.id, left: 100 }]);
  assert.equal(chk.openPRs.length, 1); assert.equal(chk.openDocs.length, 0);
  const r = D.closeJob(s, 'J-25-010', head); // ของยังไม่คืน ปิดได้
  assert.equal(r.job.open, false);
  assert.equal(s.prs[0].status, 'cancelled');
  assert.ok(s.audit.some((x) => x.action === 'pr.cancel' && x.ref === s.prs[0].id));
  // cancelPRs:false → PR คงเดิม
  const s2 = mini(); const c = iss(s2, 150); D.closeIssue(s2, c.id, head, { cancelPRs: false });
  D.closeJob(s2, 'J-25-010', head, { cancelPRs: false });
  assert.equal(s2.prs[0].status, 'open'); assert.ok(b);
});

test('JB-G5 ชื่อซ้ำตรงตัว (รวมงานปิด) → throw · due ก่อน start → throw · updateJob ตรวจเหมือนกัน', () => {
  const s = mini();
  assert.throws(() => D.addJob(s, { name: '  ซ่อมบำรุงประจำปี ' }, eng), { message: 'มีงานชื่อนี้แล้ว: J-25-002' });
  assert.throws(() => D.addJob(s, { name: 'ปรับปรุงห้องควบคุม โรงงาน C' }, eng), { code: 'job_dup' });
  assert.throws(() => D.addJob(s, { name: 'งานใหม่', start: '2026-02-02', due: '2026-02-01' }, eng), { message: 'กำหนดเสร็จต้องไม่ก่อนวันเริ่ม' });
  const j = D.addJob(s, { name: 'งานใหม่', start: '2026-02-02' }, eng);
  assert.throws(() => D.updateJob(s, j.id, { name: 'ซ่อมบำรุงประจำปี' }, eng), { code: 'job_dup' });
  assert.throws(() => D.updateJob(s, j.id, { due: '2026-01-01' }, eng), { code: 'job_dates' });
  D.updateJob(s, j.id, { name: 'งานใหม่', site: 'โรงงาน' }, eng); // ชื่อตัวเองไม่นับซ้ำ
  assert.ok(s.audit.some((x) => x.action === 'job.update' && x.text.includes('site')));
});

test('Review Focus 4: closeIssue ปล่อยของที่กันไว้ → available เพิ่ม ใบที่รอใบถัดไปได้ของ (ready)', () => {
  const s = mini();
  const a = iss(s, 150); // ได้ 100 รอ 50
  s.stock['P-0001|W-BN|ทั่วไป'] += 30; D.reserveForWaiting(s, 'P-0001', 'W-BN'); // กัน 30 ให้ a
  assert.equal(a.lines[0].reserved, 30); assert.equal(D.available(s, 'P-0001', 'W-BN'), 0);
  const b = iss(s, 20, 'J-25-002'); // ของไม่เหลือ → รอ
  assert.equal(b.fill, 'waiting');
  D.closeIssue(s, a.id, head);
  assert.deepEqual([a.fill, a.lines[0].reserved, a.lines[0].waiting], ['closed', 0, 0]);
  assert.equal(b.fill, 'ready'); assert.equal(b.lines[0].reserved, 20);
  assert.equal(D.available(s, 'P-0001', 'W-BN'), 10);
  assert.throws(() => D.closeIssue(s, a.id, head), { code: 'doc_not_open' });
});

test('cancelIssue: ยังไม่จ่ายเลย → cancelled + ยกเลิก PR · จ่ายแล้ว → ชี้ไปปิดใบเบิก', () => {
  const s = mini(); const a = iss(s, 150); const b = iss(s, 20, 'J-25-002'); // b รอทั้งใบ
  assert.equal(b.fill, 'waiting');
  assert.throws(() => D.cancelIssue(s, a.id, eng), { code: 'doc_issued', message: /ปิดใบเบิก/ });
  D.cancelIssue(s, b.id, eng);
  assert.equal(b.fill, 'cancelled'); assert.equal(s.prs.find((r) => r.reqId === b.id).status, 'cancelled');
  assert.equal(s.prs.find((r) => r.reqId === a.id).status, 'open');
  s.settings.requireApproval = true;
  const p = D.issue(s, { whId: 'W-BN', jobId: 'J-25-002', lines: [{ productId: 'P-0001', qty: 1 }] }, eng).doc;
  assert.equal(p.status, 'pending'); D.cancelIssue(s, p.id, eng); assert.equal(p.fill, 'cancelled');
});

test('cancelIssue ใบรออนุมัติ → rejected ออกจากคิว อนุมัติไม่ได้ · ไม่บล็อกปิดงาน', () => {
  const s = mini(); s.settings.requireApproval = true;
  const p = D.issue(s, { whId: 'W-BN', jobId: 'J-25-010', lines: [{ productId: 'P-0001', qty: 1 }] }, eng).doc;
  assert.throws(() => D.closeJob(s, 'J-25-010', head), { code: 'job_open_docs' });
  D.cancelIssue(s, p.id, eng);
  assert.deepEqual([p.status, p.fill], ['rejected', 'cancelled']);
  assert.equal(s.docs.filter((d) => d.status === 'pending').length, 0);
  assert.throws(() => D.approveIssue(s, p.id, head, true), { code: 'doc_not_pending' });
  assert.equal(D.qtyOf(s, 'P-0001', 'W-BN'), 100);
  assert.equal(D.closeJob(s, 'J-25-010', head).job.open, false);
});

test('nextJobId ตรงกับรหัสที่ addJob ให้ · jobUsageCsv มี BOM, CRLF, quote ถูก', () => {
  const s = mini();
  assert.equal(D.nextJobId(s), `J-${yy}-001`);
  const j = D.addJob(s, { name: 'งาน "A", ใหม่' }, eng);
  assert.equal(j.id, `J-${yy}-001`); assert.equal(D.nextJobId(s), `J-${yy}-002`);
  const d = iss(s, 10, j.id); D.returnItems(s, { docId: d.id, whId: 'W-BN', shelf: 'ทั่วไป', lines: [{ productId: 'P-0001', qty: 3, condition: 'ok' }] }, eng);
  const csv = D.jobUsageCsv(s, j.id);
  assert.ok(csv.startsWith('\uFEFFรหัสงาน,' + j.id + '\r\n'));
  assert.ok(csv.includes('ชื่องาน,"งาน ""A"", ใหม่"\r\n'));
  assert.ok(csv.includes('P-0001,น็อต,ตัว,10,3,7\r\n'));
});
