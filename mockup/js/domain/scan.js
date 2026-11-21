// แปลงรหัสที่สแกน/พิมพ์เป็น { kind, id } — โหลดหลัง js/domain/returns.js
(function (root) {
  const D = root.Domain || require('../domain.js');
  const clean = (s) => String(s ?? '').replace(/\s+/g, '').toUpperCase();

  function parseScan(state, code) {
    const c = clean(code);
    if (!c) return null;
    const hit = (kind, list) => { const x = (list || []).find((y) => clean(y.id) === c); return x && { kind, id: x.id }; };
    const byPrefix = c.startsWith('REQ-') ? hit('req', (state.docs || []).filter((d) => d.type === 'issue'))
      : c.startsWith('R-') ? hit('roll', state.rolls) : c.startsWith('J-') ? hit('job', state.jobs) : null;
    if (byPrefix) return byPrefix;
    const p = state.products.find((x) => x.active !== false && (clean(x.id) === c || clean(x.code) === c || (x.vendorCode && clean(x.vendorCode) === c)));
    return p ? { kind: 'product', id: p.id } : null; // บาร์โค้ดสินค้าที่ขึ้นต้นเหมือนใบเบิก/ม้วนก็ยังหาเจอ
  }

  Object.assign(D, { parseScan });
  if (typeof module !== 'undefined') module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
