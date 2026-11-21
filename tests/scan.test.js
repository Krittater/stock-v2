const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./_load.js');

const st = {
  docs: [{ id: 'REQ-690001', type: 'issue' }, { id: 'RC-690001', type: 'receive' }],
  rolls: [{ id: 'R-000001' }],
  jobs: [{ id: 'J-25-010' }],
  products: [
    { id: 'P-0001', code: 'BC-111', vendorCode: 'V-9', active: true },
    { id: 'P-0002', code: 'BC-222', vendorCode: 'V-8', active: false },
  ],
};

test('parseScan: 5 แบบรหัส', () => {
  assert.deepEqual(D.parseScan(st, 'REQ-690001'), { kind: 'req', id: 'REQ-690001' });
  assert.deepEqual(D.parseScan(st, 'R-000001'), { kind: 'roll', id: 'R-000001' });
  assert.deepEqual(D.parseScan(st, 'P-0001'), { kind: 'product', id: 'P-0001' });
  assert.deepEqual(D.parseScan(st, 'BC-111'), { kind: 'product', id: 'P-0001' });
  assert.deepEqual(D.parseScan(st, 'V-9'), { kind: 'product', id: 'P-0001' });
  assert.deepEqual(D.parseScan(st, 'J-25-010'), { kind: 'job', id: 'J-25-010' });
});
test('parseScan: ไม่พบ / เลิกใช้ = null', () => {
  assert.equal(D.parseScan(st, 'REQ-999999'), null);
  assert.equal(D.parseScan(st, 'RC-690001'), null);
  assert.equal(D.parseScan(st, 'P-0002'), null);
  assert.equal(D.parseScan(st, 'BC-222'), null);
  assert.equal(D.parseScan(st, 'V-8'), null);
  assert.equal(D.parseScan(st, ''), null);
  assert.equal(D.parseScan(st, null), null);
});
test('parseScan: ไม่สนตัวพิมพ์/ช่องว่าง', () => {
  assert.deepEqual(D.parseScan(st, '  req-69 0001 '), { kind: 'req', id: 'REQ-690001' });
  assert.deepEqual(D.parseScan(st, 'bc-111'), { kind: 'product', id: 'P-0001' });
  assert.deepEqual(D.parseScan(st, 'j-25-010'), { kind: 'job', id: 'J-25-010' });
});

test('parseScan: kinds ระบุแล้ว prefix ที่ไม่อยู่ใน kinds ตกไปหา vendorCode สินค้า', () => {
  const s2 = { ...st, rolls: [{ id: 'R-000001' }], products: [{ id: 'P-1', code: 'X1', vendorCode: 'R-000001', active: true }, { id: 'P-2', code: 'X2', vendorCode: 'J-25-010', active: true }, { id: 'P-3', code: 'X3', vendorCode: 'REQ-690001', active: true }] };
  assert.deepEqual(D.parseScan(s2, 'R-000001'), { kind: 'roll', id: 'R-000001' });
  assert.deepEqual(D.parseScan(s2, 'R-000001', ['product']), { kind: 'product', id: 'P-1' });
  assert.deepEqual(D.parseScan(s2, 'J-25-010', ['product']), { kind: 'product', id: 'P-2' });
  assert.deepEqual(D.parseScan(s2, 'REQ-690001', ['product']), { kind: 'product', id: 'P-3' });
});
