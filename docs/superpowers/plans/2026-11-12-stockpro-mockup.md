# StockPro HTML Mockup (ครบลูป) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clickable HTML mockup ของระบบ StockPro ที่ทำงานครบลูป — สร้างสินค้า → จัดการหมวดหมู่เอง → รับของเข้า (เติมของ) → ตรวจนับ → เบิกของ (+ อนุมัติ / รายการต้องซื้อ) — หน้าตาหน้าเบิกตรงกับรูปเป้าหมาย มีรูปสินค้าตัวอย่าง (รูปฟรีก่อน ไม่มีค่อยวาดเอง) และลื่นกับสินค้า ~2,000 รายการ

**Architecture:** ไม่มี build step: `mockup/index.html` โหลด Vue 3 + PrimeVue 4 + Tailwind 4 จาก CDN, เปิดด้วย double-click (`file://`). ตรรกะธุรกิจทั้งหมดอยู่ใน `mockup/js/domain.js` เป็นฟังก์ชันล้วน (ไม่พึ่ง Vue) ที่แก้ `state` object แล้ว return ผล — ทดสอบด้วย `node --test`. หน้าจอเป็น Vue component (template string) ต่อหน้าละไฟล์ ใช้ `reactive(state)` ตัวเดียว เก็บลง `localStorage`

**Tech Stack:** Vue 3.5.13 (global build) · PrimeVue 4.2.5 UMD + `@primevue/themes@4.2.5` Aura · PrimeIcons 7.0.0 · `@tailwindcss/browser@4.0.14` · Google Fonts (IBM Plex Sans Thai, Geist, Geist Mono) · Node 22 `node:test` สำหรับ test

**Spec:**
- หน้าตาเป้าหมาย: `docs/reference/issue-page-target.webp` (รูปที่ผู้ใช้แนบ — **ยึดรูปนี้เป๊ะสำหรับหน้าเบิกของ**)
- Requirement BA: `docs/reference/issue-page-requirements.pdf` (ข้อความดึงไว้แล้วที่ `docs/reference/issue-page-requirements.txt`) — ใช้เป็นที่มาของ สี/ฟอนต์/ขนาด, ข้อมูลตัวอย่าง, บทบาท, ข้อความแจ้งเตือน (รหัส N), ผลลัพธ์การเบิก, ฟิลด์กล่องสร้างสินค้า
- การตัดสินใจของผู้ใช้ (12 พ.ย. 2569): (1) หน้าเบิก **ตามรูปเป๊ะ** — ตารางโชว์ "คงเหลือ" ทุกแถว + ตะกร้าขวา ไม่ใช้แถบล็อก 3 ขั้น / กฎ IF48 ของ PDF; (2) Vue+PrimeVue ผ่าน CDN; (3) รับของ/นับของ แบบพื้นฐานครบลูป (ไม่ blind count, ไม่อนุมัติส่วนต่าง); (4) มีตัวสลับบทบาท หัวหน้า/Store/วิศวกร + สวิตช์ "ใบเบิกต้องให้หัวหน้าอนุมัติ"

## Global Constraints

- ไฟล์ทั้งหมดอยู่ใต้ `mockup/` (แอป) และ `tests/` (node test) เปิด `mockup/index.html` ตรง ๆ ได้ — **ห้ามใช้ ES module (`type="module"`/`import`)** เพราะ `file://` บล็อก; ทุกไฟล์ JS ประกาศ global (`window.Domain`, `window.Seed`, …) และ `domain.js`/`seed.js` ต้องมี `if (typeof module !== 'undefined') module.exports = …` ให้ node `require` ได้
- CDN URL (ตรวจแล้วตอบ 200): `https://unpkg.com/vue@3.5.13/dist/vue.global.prod.js` · `https://unpkg.com/primevue@4.2.5/umd/primevue.min.js` · `https://unpkg.com/@primevue/themes@4.2.5/umd/aura.min.js` · `https://unpkg.com/primeicons@7.0.0/primeicons.css` · `https://unpkg.com/@tailwindcss/browser@4.0.14/dist/index.global.js`
- PrimeVue globals: `PrimeVue.Config`, `PrimeVue.ToastService`, `PrimeVue.ConfirmationService`, `PrimeVue.definePreset`, `PrimeVue.Themes.Aura`, components เช่น `PrimeVue.DataTable`, `PrimeVue.Select` — register เป็น `p-datatable`, `p-select` ฯลฯ
- Theme: `definePreset(Aura, { semantic: { primary: {50:'#effaf5',100:'#d8f3e6',200:'#b4e6d0',300:'#82d2b3',400:'#4fb892',500:'#2c9c77',600:'#1f7e60',700:'#1b654f',800:'#195141',900:'#164337',950:'#0b2620'} } })` ปุ่มหลักใช้ 700 (hover 800, active 900) · `darkModeSelector: '.app-dark'` · พื้นหน้า stone-50, การ์ดขาว, เส้น stone-100..300
- ฟอนต์: `font-family: 'Geist', 'IBM Plex Sans Thai', sans-serif` น้ำหนัก 400/500/600/700 · ตัวเลข `font-variant-numeric: tabular-nums` · รหัสเอกสาร (REQ-, PR-, RC-, CC-, ADJ-, P-) ใช้ `Geist Mono`
- ขนาด: ปุ่ม/ช่องกรอก/ชิป สูง ≥ 44px · ปุ่มเบิก ≥ 48px · ตัวอักษรเล็กสุด 14px, เนื้อหา 16px · มุมโค้ง ช่องกรอก/ปุ่ม 8px, การ์ด 12px
- ภาษา UI ไทยทั้งหมด (ยกเว้นรหัสเอกสาร, sq.mm, ยี่ห้อ) — ใช้คำคนหน้างาน: เบิก ของ คลัง งาน
- ตัวเลข: คั่นหลักพันด้วย `,` · ทศนิยมไม่เกิน 2 ตำแหน่งตัดศูนย์ท้าย · มีหน่วยต่อท้ายเสมอ · หน่วย `เมตร` ย่อเป็น `ม.` ในช่องตัวเลข (ตามรูป: "1,250 ม.") แต่คอลัมน์ "หน่วย" แสดงคำเต็ม "เมตร"
- สถานะห้ามพึ่งสีอย่างเดียว: ป้ายมีจุด + คำเสมอ (`มีของ` เขียว · `ใกล้หมด` ส้ม · `ไม่มีของ` แดง · `กำลังตรวจนับ` เหลือง)
- สถานะสต็อกต่อคลัง: `out` เมื่อ qty ≤ 0 · `low` เมื่อ 0 < qty ≤ `reorderPoint` · `in` นอกนั้น
- รูปแบบเลขเอกสาร (ปี พ.ศ. 69): สินค้า `P-0001` · ใบเบิก `REQ-690001` · รายการต้องซื้อ `PR-690001` · ใบรับ `RC-690001` · รอบนับ `CC-0001` · ใบปรับยอด `ADJ-690001` · งานใหม่ `J-26-001` · หมวด `C-001`
- รองรับปริมาณ: seed 2,000 สินค้า · ตารางแบ่งหน้า 20 แถว (เลือก 20/50/100) ห้าม render ทุกแถว · ช่องค้นหา debounce 150ms
- 390px ต้องไม่มี scroll แนวนอนทั้งหน้า (ตารางเลื่อนในกรอบตัวเองได้) · ≥1280px ใช้ layout ตามรูป (sidebar 220px · เนื้อหา · ตะกร้า 340px)
- `localStorage` key `stockpro-mock-v1` · มีปุ่ม "รีเซ็ตข้อมูลตัวอย่าง" ในเมนูผู้ใช้
- รูปสินค้า (ผู้ใช้ขอเพิ่ม 12 พ.ย. 2569 — ทับข้อ "ไม่ต้องใส่รูปสินค้า" ของ PDF ข้อ 8): หารูปฟรีก่อน ถ้าไม่มีรูปที่ใช้ได้ค่อยวาด SVG เอง (Task 9) · รูปเก็บในเครื่องที่ `mockup/img/` ห้าม hotlink · ลำดับการเลือกรูป: `product.image` → รูปหมวดย่อย → รูปหมวดแม่ → ไอคอนหมวด (PrimeIcon บนพื้นสีอ่อน) · ทรงตามรูปเป้าหมาย: สี่เหลี่ยมมุมโค้งพื้นขาวในตาราง/ตะกร้า, วงกลมในแถบหมวด · `<img loading="lazy">` + `object-fit: cover` · โหลดรูปไม่ได้ (`@error`) → กลับไปใช้ไอคอน
- นอกขอบเขต (เมนูมีแต่เปิดแล้วเจอหน้า "ยังไม่อยู่ในขอบเขต mockup"): ขอซื้อ, โอนย้าย, รายงาน, ตั้งค่า›คลังสินค้า, ตั้งค่า›โครงการ/งาน, ตั้งค่า›ผู้ใช้งานและสิทธิ์ · ไม่ทำ: ติดตามม้วน (R-xxxxxx), QR/บาร์โค้ด, ออฟไลน์, ชิปสเปกสายไฟ, แท็บคืนของ

## Shared Types (ทุก task อ้างอิงชื่อเหล่านี้)

```js
// Role = 'head' | 'store' | 'engineer'
// User      { id, name, title, role }
// Warehouse { id: 'W-BN', name: 'คลังหลัก บางนา', location, countId: null|string }   // countId != null = ถูกล็อกนับ
// Category  { id: 'C-001', name, parentId: null|string, icon: 'pi-bolt', color: '#hex', order: number, image: null|string }
// Product   { id: 'P-0001', code, name, brand, model, unit, categoryId, reorderPoint, createdAt, image: null|string }
//           image = path ใต้ mockup/ เช่น 'img/photo/wire-thw.jpg' หรือ 'img/draw/junction-box.svg'
// Job       { id: 'J-25-010', name, customer, open: boolean }
// Line      { productId, qty, issued?: number }
// Doc       { id, type: 'issue'|'receive'|'adjust', status: 'posted'|'pending'|'rejected',
//             whId, jobId?: string, lines: Line[], note, by: userId, at: ISOString, prIds?: string[] }
// PR        { id: 'PR-690001', productId, whId, qty, received: number, status: 'open'|'done', reqId }
// Count     { id: 'CC-0001', whId, categoryId: null|string, status: 'open'|'closed'|'cancelled',
//             by, at, lines: [{ productId, system: number, counted: null|number }] }
// Cart      { lines: [{ productId, qty }], whId, jobId, note }
// State     { version: 1, counters: {P,REQ,PR,RC,CC,ADJ,J,C}, settings: { requireApproval: false },
//             currentUserId, users, warehouses, categories, products,
//             stock: { 'P-0001|W-BN': 1250 }, jobs, docs, prs, counts, cart }
// DomainError extends Error { code: string }  // message เป็นข้อความไทยที่โชว์ผู้ใช้ได้ทันที
```

## Review Focus

1. **คลังกำลังตรวจนับ** — เบิก/รับเข้า/สร้างสินค้าพร้อมยอดเข้าคลังที่ถูกล็อก ต้องถูกปฏิเสธด้วยข้อความ "คลังนี้กำลังตรวจนับ รอให้นับเสร็จก่อน" และ dropdown คลังแสดง "กำลังตรวจนับ" เลือกไม่ได้ (test ใน Task 5 และ 6)
2. **จำนวนทศนิยมกับของนับเป็นชิ้น** — หน่วยที่ไม่ใช่ `เมตร` รับเฉพาะจำนวนเต็ม; `2.5 ตัว` ต้อง error "ตัวต้องเป็นจำนวนเต็ม" (PDF N07 สมมติฐานข้อ 7) (test ใน Task 1 `validateQty`)
3. **ขอเบิกมากกว่าที่มี** — ไม่ใช่ error: จ่ายเท่าที่มี + สร้าง PR ส่วนที่ขาด, ผล `partial`/`waiting` (test ใน Task 6)
4. **localStorage เสีย/เวอร์ชันเก่า** — `Domain.parseSaved` คืน `null` แล้วแอปใช้ seed ใหม่ ไม่จอขาว (test ใน Task 1)
5. **ลบหมวดที่มีสินค้า/หมวดย่อย** — ต้องบล็อกพร้อมบอกจำนวน หรือย้ายไปหมวดที่เลือก; ห้ามทิ้งสินค้ากำพร้า (test ใน Task 4)

---

### Task 1: โครงโปรเจกต์ + domain พื้นฐาน (ตัวเลข สต็อก id persistence)

**Files:**
- Create: `mockup/js/domain.js`
- Create: `tests/domain.test.js`
- Create: `.gitignore` (`node_modules/`)

**Interfaces:**
- Produces (บน `Domain`):
  - `class DomainError extends Error { constructor(code: string, message: string) }`
  - `unitAbbr(unit: string) -> string` (`'เมตร'→'ม.'`, อื่นคืนเดิม)
  - `formatQty(n: number, unit?: string) -> string` (`1250,'เมตร'→'1,250 ม.'`, `12.5→'12.5'`, `3.10→'3.1'`)
  - `validateQty(qty: number, unit: string) -> void` throws `DomainError('qty_invalid'|'qty_integer')`
  - `stockKey(productId, whId) -> string` · `qtyOf(state, productId, whId) -> number` (ไม่มี key = 0) · `totalQty(state, productId) -> number`
  - `stockStatus(state, product, whId: string|null) -> 'in'|'low'|'out'` (whId null = รวมทุกคลัง)
  - `nextId(state, kind: 'P'|'REQ'|'PR'|'RC'|'CC'|'ADJ'|'J'|'C') -> string` (เพิ่ม counter แล้ว format ตาม Global Constraints)
  - `currentUser(state) -> User`
  - `assertWarehouseOpen(state, whId) -> void` throws `DomainError('wh_counting', 'คลังนี้กำลังตรวจนับ รอให้นับเสร็จก่อน')`
  - `parseSaved(raw: string|null) -> State|null` (null เมื่อ parse ไม่ได้ หรือ `version !== 1`)

- [ ] **Step 1: `git init` และสร้าง `.gitignore`**

Run: `git init && git add docs && git commit -m "docs: add reference spec and target image"`
Expected: commit สำเร็จ

- [ ] **Step 2: เขียน test ที่ fail** — `tests/domain.test.js` ใช้ `const test = require('node:test'); const assert = require('node:assert/strict'); const D = require('../mockup/js/domain.js');` และ helper `mini()` สร้าง state เล็ก (2 คลัง `W-BN`, `W-A`; สินค้า `P-0001` unit `เมตร` reorderPoint 100; stock `{'P-0001|W-BN': 1250, 'P-0001|W-A': 50}`; users 3 บทบาท; counters ศูนย์)

```js
test('formatQty', () => {
  assert.equal(D.formatQty(1250, 'เมตร'), '1,250 ม.');
  assert.equal(D.formatQty(12.5, 'เมตร'), '12.5 ม.');
  assert.equal(D.formatQty(3.1, 'ตัว'), '3.1 ตัว');
  assert.equal(D.formatQty(0, 'ม้วน'), '0 ม้วน');
});
test('validateQty', () => {
  assert.doesNotThrow(() => D.validateQty(12.5, 'เมตร'));
  assert.throws(() => D.validateQty(2.5, 'ตัว'), { code: 'qty_integer', message: 'ตัวต้องเป็นจำนวนเต็ม' });
  assert.throws(() => D.validateQty(0, 'เมตร'), { code: 'qty_invalid', message: 'ใส่จำนวนที่มากกว่า 0' });
  assert.throws(() => D.validateQty(1.234, 'เมตร'), { code: 'qty_invalid' });
});
test('qty and status', () => {
  const s = mini(); const p = s.products[0];
  assert.equal(D.qtyOf(s, 'P-0001', 'W-B'), 0);
  assert.equal(D.totalQty(s, 'P-0001'), 1300);
  assert.equal(D.stockStatus(s, p, 'W-BN'), 'in');
  assert.equal(D.stockStatus(s, p, 'W-A'), 'low');
  s.stock['P-0001|W-A'] = 0; assert.equal(D.stockStatus(s, p, 'W-A'), 'out');
});
test('nextId formats', () => {
  const s = mini();
  assert.equal(D.nextId(s, 'REQ'), 'REQ-690001');
  assert.equal(D.nextId(s, 'REQ'), 'REQ-690002');
  assert.equal(D.nextId(s, 'P'), 'P-0001');
  assert.equal(D.nextId(s, 'CC'), 'CC-0001');
  assert.equal(D.nextId(s, 'J'), 'J-26-001');
  assert.equal(D.nextId(s, 'C'), 'C-001');
});
test('assertWarehouseOpen', () => {
  const s = mini(); s.warehouses[0].countId = 'CC-0001';
  assert.throws(() => D.assertWarehouseOpen(s, 'W-BN'), { code: 'wh_counting' });
});
test('parseSaved rejects garbage and old versions', () => {
  assert.equal(D.parseSaved(null), null);
  assert.equal(D.parseSaved('{bad'), null);
  assert.equal(D.parseSaved('{"version":0}'), null);
  assert.equal(D.parseSaved(JSON.stringify(mini())).version, 1);
});
```

- [ ] **Step 3: Run test ให้ fail** — Run: `node --test tests/` · Expected: FAIL `Cannot find module '../mockup/js/domain.js'`
- [ ] **Step 4: Implement ทุก function ใน Interfaces** ใน `mockup/js/domain.js` รูปแบบ `(function (root) { const Domain = {…}; root.Domain = Domain; if (typeof module !== 'undefined') module.exports = Domain; })(typeof window !== 'undefined' ? window : globalThis);` — `formatQty` ใช้ `toLocaleString('en-US', { maximumFractionDigits: 2 })`
- [ ] **Step 5: Run test ให้ pass** — Run: `node --test tests/` · Expected: PASS ทุกตัว
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(domain): qty formatting, stock status, ids, persistence guard"`

---

### Task 2: Seed ข้อมูลตัวอย่าง 2,000 รายการ

**Files:**
- Create: `mockup/js/seed.js`
- Create: `tests/seed.test.js`

**Interfaces:**
- Consumes: `Domain.stockStatus`, `Domain.qtyOf` (ใช้แค่ใน test)
- Produces: `Seed.build(opts?: { products?: number }) -> State` (default 2000) — deterministic (PRNG `mulberry32(42)`), ผลเหมือนกันทุกครั้ง

ข้อมูลที่ seed ต้องมี (ค่าตายตัว):
- **users**: `U-ENG` "สมชาย วิศวกร" title "วิศวกรโครงการ" role engineer (currentUserId เริ่มต้น — ตามรูป) · `U-STORE` "ก้องภพ แสงทอง" "Store" store · `U-HEAD` "อรุณ รัตนชัย" "หัวหน้า" head
- **warehouses**: `W-BN` คลังหลัก บางนา (บางนา กรุงเทพฯ) · `W-A` คลังไซต์งาน A (มาบตาพุด ระยอง) · `W-B` คลังไซต์งาน B (อมตะซิตี้ ชลบุรี) · `W-C` คลังไซต์งาน C — ทุกคลัง `countId: null`
- **categories** ระดับบน 10 หมวดตามลำดับในรูป (ชื่อ · icon): สายไฟ `pi-bolt` · สายสื่อสาร `pi-wifi` · ท่อและราง `pi-minus` · อุปกรณ์ไฟฟ้า `pi-server` · กล่องและตู้ `pi-box` · สวิตช์และเต้ารับ `pi-th-large` · โคมไฟ `pi-lightbulb` · วัสดุสิ้นเปลือง `pi-circle` · น็อตและอุปกรณ์ `pi-cog` · ความปลอดภัย `pi-shield` — แต่ละหมวดมีหมวดย่อย 2–4 หมวด (ต้องมี: สายไฟ›สายไฟ THW, สายไฟ›สายไฟ VAF, สายไฟ›สายไฟ VCT, กล่องและตู้›กล่องพักสาย, ท่อและราง›ท่อ EMT, สวิตช์และเต้ารับ›เต้ารับ, อุปกรณ์ไฟฟ้า›เซอร์กิตเบรกเกอร์, วัสดุสิ้นเปลือง›เทปพันสายไฟ) สินค้าผูกกับหมวดย่อยเสมอ
- **6 สินค้าแรกตามรูป** (id, code, name, หมวดย่อย, unit, qty ใน W-BN, reorderPoint):
  `P-0001` EL-WR-THW-0015-BK สายไฟ THW 1.5 sq.mm สีดำ · สายไฟ THW · เมตร · 1250 · 200
  `P-0002` EL-JB-0404 กล่องพักสาย 4x4 นิ้ว · กล่องพักสาย · ใบ · 342 · 50
  `P-0003` EL-EMT-012 ท่อ EMT 1/2 นิ้ว · ท่อ EMT · เมตร · 580 · 100
  `P-0004` EL-OUT-002 เต้ารับคู่ 16A 250V (มีกราวด์) · เต้ารับ · ชิ้น · 126 · 150
  `P-0005` EL-MCB-1P16 เซอร์กิตเบรกเกอร์ 1P 16A (MCB) · เซอร์กิตเบรกเกอร์ · ตัว · 28 · 30
  `P-0006` EL-TAPE-034 เทปพันสายไฟ PVC 3/4 นิ้ว x 10 ม. · เทปพันสายไฟ · ม้วน · 0 · 20
- สินค้าตัวอย่างจาก PDF หัวข้อ 0.5 (THW 1.5 แดง, THW 2.5 เขียว-เหลือง, THW 4 ดำ, VAF 2x1.5, VCT 4x2.5, สายแลน CAT6 UTP, เคเบิ้ลไทร์ 8 นิ้ว ฯลฯ พร้อมยี่ห้อ/รุ่น) เป็น `P-0007` เป็นต้นไป
- ที่เหลือ generate จาก template ต่อหมวดย่อย (ขนาด × สี × ยี่ห้อ) ให้ชื่อไม่ซ้ำ, `code` ไม่ซ้ำ, ครบ `products` ตัว
- **stock**: ใน `W-BN` ต้องได้ **low = 12 และ out = 3 พอดี** (รวม P-0004, P-0005 = low และ P-0006 = out) สินค้าอื่นใน W-BN เป็น `in` · คลังอื่นสุ่มมี/ไม่มีของได้อิสระ
- **jobs** (open ทั้งหมด): `J-25-010` อาคารสำนักงาน โซน A (ตามรูป) · `J-25-002` ซ่อมบำรุงประจำปี · ภายในบริษัท · `J-24-045` เดินสาย LAN โรงงาน B · บจก. อมตะ พาร์ทส์ · `J-24-012` ติดตั้งตู้ MDB อาคารสำนักงานใหญ่ · บจก. สยามพร็อพเพอร์ตี้ · `J-24-031` ติดตั้งระบบไฟฟ้า อาคาร A โครงการริเวอร์ไซด์ · บจก. ริเวอร์ไซด์ ดีเวลลอปเมนท์ · และงานปิดแล้ว 1 งาน (`open:false`)
- **docs**: ใบเบิก `pending` 7 ใบ (W-BN) · ใบเบิก/รับ `posted` ย้อนหลังประมาณ 20 ใบ ให้หน้าแรกมีประวัติ
- **prs**: `open` 18 รายการ
- **cart** (ตามรูป): `{ lines: [{P-0001, 100}, {P-0002, 10}, {P-0003, 30}], whId: 'W-BN', jobId: 'J-25-010', note: '' }`
- counters ตั้งให้ต่อจากเลขที่ seed ใช้ไปแล้ว (`counters.P` = จำนวนสินค้า)
- `image: null` ทุกหมวดและทุกสินค้า (Task 9 ใส่รูปทีหลัง)
- `Seed.build({ products: 50 })` ต้องได้ข้อมูลที่ถูกต้องเหมือนกัน: docs / prs / cart / สินค้าที่ low-out ใน W-BN อ้างเฉพาะ `P-0001`–`P-0040` (test ของ Task 4–7 ใช้ขนาด 50)

- [ ] **Step 1: เขียน test ที่ fail** — `tests/seed.test.js`

```js
const s = Seed.build();
test('size and uniqueness', () => {
  assert.equal(s.products.length, 2000);
  assert.equal(new Set(s.products.map(p => p.id)).size, 2000);
  assert.equal(new Set(s.products.map(p => p.code)).size, 2000);
  assert.equal(new Set(s.products.map(p => p.name)).size, 2000);
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
```

- [ ] **Step 2: Run ให้ fail** — `node --test tests/` · Expected: FAIL `Cannot find module '../mockup/js/seed.js'`
- [ ] **Step 3: Implement `Seed.build`** ใน `mockup/js/seed.js` (global + `module.exports` แบบเดียวกับ Task 1; ไม่ใช้ `Date.now()` — `createdAt`/`at` คำนวณจากวันที่คงที่ `2026-11-01`)
- [ ] **Step 4: Run ให้ pass** — `node --test tests/` · Expected: PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(seed): deterministic 2,000-item demo data matching target image"` (อย่าลืม `git add mockup/js/seed.js tests/seed.test.js`)

---

### Task 3: ค้นหา กรอง นับแท็บ และ KPI

**Files:**
- Modify: `mockup/js/domain.js`
- Modify: `tests/domain.test.js`

**Interfaces:**
- Consumes: `Seed.build` (ใน test)
- Produces:
  - `categoryPath(state, categoryId) -> string` (`'สายไฟ › สายไฟ THW'`)
  - `descendantIds(state, categoryId) -> Set<string>` (รวมตัวเอง)
  - `searchProducts(state, q: { text?: string, categoryId?: string|null, tab?: 'all'|'in'|'low'|'out', whId: string }) -> Product[]`
    - text แยกด้วยช่องว่าง ทุก token ต้องเจอ (AND) ใน `name + code + brand + model + categoryPath` แบบไม่สนตัวพิมพ์
    - เรียง: ไม่มี text → ตาม `id`; มี text → ชื่อขึ้นต้นด้วย text ก่อน → ชื่อมี text → อื่น ๆ แล้วภายในกลุ่มตาม `id`
  - `tabCounts(state, q: { text?, categoryId?, whId }) -> { all, in, low, out }`
  - `kpis(state, whId) -> { low, out, pendingApprovals, openPRs }` (pending = ใบเบิก `pending` ทุกคลัง)
  - `warehouseOptions(state, lines: Line[]) -> [{ wh, short: 'full'|'partial'|'none'|'counting', missing: number, total: number }]` (ใช้ใน Select คลังของตะกร้า; เรียง counting ไว้ท้าย, full ก่อน)
  - `imageOf(state, product) -> string|null` (ลำดับ: `product.image` → หมวดของสินค้า → หมวดแม่ → `null`) · `categoryImage(state, categoryId) -> string|null` (หมวดตัวเอง → หมวดแม่ → `null`)

- [ ] **Step 1: เขียน test ที่ fail**

```js
const S = Seed.build();
test('multi-token search', () => {
  const r = D.searchProducts(S, { text: 'thw 1.5', whId: 'W-BN' });
  assert.ok(r.length >= 2);
  assert.equal(r[0].id, 'P-0001');
  assert.ok(r.every(p => /THW/i.test(p.name + p.model) && /1\.5/.test(p.name + p.model)));
});
test('category filter includes sub-categories', () => {
  const wire = S.categories.find(c => c.name === 'สายไฟ' && !c.parentId);
  const r = D.searchProducts(S, { categoryId: wire.id, whId: 'W-BN' });
  assert.ok(r.length > 0 && r.every(p => D.categoryPath(S, p.categoryId).startsWith('สายไฟ ›')));
});
test('tabs add up', () => {
  const c = D.tabCounts(S, { whId: 'W-BN' });
  assert.deepEqual(c, { all: 2000, in: 1985, low: 12, out: 3 });
});
test('kpis', () => assert.deepEqual(D.kpis(S, 'W-BN'), { low: 12, out: 3, pendingApprovals: 7, openPRs: 18 }));
test('search over 2,000 stays fast', () => {
  const t = performance.now();
  for (let i = 0; i < 20; i++) D.searchProducts(S, { text: 'สาย', tab: 'in', whId: 'W-BN' });
  assert.ok((performance.now() - t) / 20 < 25);
});
test('warehouseOptions marks counting warehouses', () => {
  const s = Seed.build(); s.warehouses[1].countId = 'CC-0009';
  const o = D.warehouseOptions(s, s.cart.lines);
  assert.equal(o.at(-1).short, 'counting');
  assert.equal(o.find(x => x.wh.id === 'W-BN').short, 'full');
});
test('imageOf falls back product → sub-category → parent → null', () => {
  const s = Seed.build({ products: 50 }); const p = s.products[0];
  const sub = s.categories.find(c => c.id === p.categoryId); const parent = s.categories.find(c => c.id === sub.parentId);
  p.image = null; sub.image = null; parent.image = 'img/a.jpg'; assert.equal(D.imageOf(s, p), 'img/a.jpg');
  sub.image = 'img/b.jpg'; assert.equal(D.imageOf(s, p), 'img/b.jpg');
  p.image = 'img/c.jpg'; assert.equal(D.imageOf(s, p), 'img/c.jpg');
  parent.image = sub.image = p.image = null; assert.equal(D.imageOf(s, p), null);
});
```

- [ ] **Step 2: Run ให้ fail** — `node --test tests/` · Expected: FAIL `D.searchProducts is not a function`
- [ ] **Step 3: Implement** — สร้าง search index ครั้งเดียวต่อ product (`_hay` lowercased string) เก็บใน `WeakMap` ไม่เขียนลง state
- [ ] **Step 4: Run ให้ pass** — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(domain): product search, tab counts, KPIs, warehouse options"`

---

### Task 4: หมวดหมู่กำหนดเอง + สร้าง/แก้สินค้า

**Files:**
- Modify: `mockup/js/domain.js`, `tests/domain.test.js`

**Interfaces:**
- Produces:
  - `addCategory(state, { name, parentId?, icon?, color? }) -> Category` — trim ชื่อ; ว่าง → `DomainError('cat_name', 'ใส่ชื่อหมวดก่อน')`; ชื่อซ้ำในระดับเดียวกัน (ไม่สนตัวพิมพ์) → `DomainError('cat_dup', 'มีหมวด "{name}" อยู่แล้ว')`; parentId ต้องเป็นหมวดระดับบน (ลึกสุด 2 ชั้น) ไม่งั้น `DomainError('cat_depth', 'หมวดย่อยซ้อนได้ชั้นเดียว')`; default icon `pi-tag`, color `#82d2b3`, order = ท้ายสุด
  - `updateCategory(state, id, patch: { name?, icon?, color?, order?, image? }) -> Category` (กฎชื่อเหมือน add) · `addCategory` รับ `image?` ด้วย (default `null`)
  - `deleteCategory(state, id, opts?: { moveTo?: string }) -> { movedProducts: number }` — มีสินค้า/หมวดย่อย และไม่ให้ moveTo → `DomainError('cat_in_use', 'หมวดนี้มีสินค้า {n} รายการ และหมวดย่อย {m} หมวด เลือกหมวดที่จะย้ายไปก่อน')`; moveTo = ย้ายสินค้า + reparent หมวดย่อย (ถ้า moveTo เป็นหมวดย่อย ให้ reparent หมวดย่อยไปที่ parent ของ moveTo)
  - `productCounts(state) -> Map<categoryId, number>` (นับรวมหมวดย่อยให้หมวดแม่)
  - `findSimilar(state, name) -> Product[]` (≤5 ตัว; ชื่อ normalize แล้ว ตัวหนึ่งเป็น substring ของอีกตัว และยาว ≥ 3; ไม่รวมตัวที่ซ้ำเป๊ะ) — ใช้แสดง N12
  - `addProduct(state, input: { name, code?, brand?, model?, unit, categoryId, reorderPoint?, initial?: { whId, qty } }, actor: User) -> { product, receipt: Doc|null }`
    - ชื่อว่าง/ไม่เลือกหน่วย → `DomainError('prod_required', 'ใส่ชื่อและเลือกหน่วยก่อน')` (N13)
    - ชื่อซ้ำเป๊ะ → `DomainError('prod_dup', 'มีสินค้านี้แล้ว: {id} {name}')` (N11) · `code` ซ้ำ → `DomainError('code_dup', 'รหัสนี้ใช้แล้ว: {code}')`
    - `code` ว่าง = ใช้ `id`
    - มี `initial`: `assertWarehouseOpen` + `validateQty` แล้วสร้างใบรับ `RC-` ด้วย `receive()` (Task 5) — actor store/head → `posted`; engineer → `pending` (รอ Store ยืนยัน, PDF N22)
  - `updateProduct(state, id, patch) -> Product` (ห้ามแก้ `id`; กฎชื่อ/รหัสซ้ำเหมือน add)

> ทาง `initial` (ยอดตั้งต้น) ยังไม่ทำใน task นี้ — Task 5 เพิ่มให้หลังมี `receive()` ใน task นี้ถ้าได้ `initial` มาให้ throw `DomainError('initial_unsupported', 'ยังลงยอดตั้งต้นไม่ได้')`

- [ ] **Step 1: เขียน test ที่ fail**

```js
test('custom category rules', () => {
  const s = Seed.build({ products: 50 });
  const c = D.addCategory(s, { name: '  งานประปา ' });
  assert.equal(c.name, 'งานประปา');
  assert.throws(() => D.addCategory(s, { name: 'งานประปา' }), { code: 'cat_dup' });
  const sub = D.addCategory(s, { name: 'ข้อต่อ PVC', parentId: c.id });
  assert.throws(() => D.addCategory(s, { name: 'x', parentId: sub.id }), { code: 'cat_depth' });
  assert.throws(() => D.addCategory(s, { name: '  ' }), { code: 'cat_name' });
});
test('delete category in use is blocked unless moved', () => {
  const s = Seed.build({ products: 50 });
  const sub = s.categories.find(c => c.name === 'สายไฟ THW');
  const target = s.categories.find(c => c.name === 'สายไฟ VAF');
  const n = s.products.filter(p => p.categoryId === sub.id).length;
  assert.throws(() => D.deleteCategory(s, sub.id), { code: 'cat_in_use' });
  assert.deepEqual(D.deleteCategory(s, sub.id, { moveTo: target.id }), { movedProducts: n });
  assert.ok(s.products.every(p => s.categories.some(c => c.id === p.categoryId)));
});
test('addProduct validation', () => {
  const s = Seed.build({ products: 50 }); const head = s.users.find(u => u.role === 'head');
  const cat = s.categories.find(c => c.name === 'สายไฟ THW').id;
  assert.throws(() => D.addProduct(s, { name: '', unit: '', categoryId: cat }, head), { code: 'prod_required' });
  assert.throws(() => D.addProduct(s, { name: 'สายไฟ thw 1.5 SQ.MM สีดำ', unit: 'เมตร', categoryId: cat }, head), { code: 'prod_dup' });
  const { product, receipt } = D.addProduct(s, { name: 'น็อตสแตนเลส M8', unit: 'ตัว', categoryId: cat }, head);
  assert.equal(product.id, 'P-0051'); assert.equal(product.code, 'P-0051'); assert.equal(receipt, null);
  assert.ok(D.findSimilar(s, 'สายไฟ THW 1.5').length > 0);
});
```

- [ ] **Step 2: Run ให้ fail** — Expected: FAIL `D.addCategory is not a function`
- [ ] **Step 3: Implement** ทุก function ข้างบน (ทาง `initial` = throw `initial_unsupported` ตามหมายเหตุ)
- [ ] **Step 4: Run ให้ pass** — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(domain): custom categories and product creation"`

---

### Task 5: รับของเข้า (เติมของ) + ยืนยันยอด + ปิด PR

**Files:**
- Modify: `mockup/js/domain.js`, `tests/domain.test.js`

**Interfaces:**
- Produces:
  - `receive(state, { whId, lines: [{ productId, qty, prId? }], note? }, actor) -> Doc` — lines ว่าง → `DomainError('lines_empty', 'เพิ่มของอย่างน้อย 1 รายการ')`; `assertWarehouseOpen`; `validateQty` ทุกบรรทัด (หน่วยจากสินค้า); actor engineer → `status:'pending'` ไม่เพิ่มยอด; store/head → `posted` เพิ่มยอด + `applyPR`
  - `confirmReceipt(state, docId, actor, accept: boolean) -> Doc` — engineer → `DomainError('forbidden', 'บัญชีนี้ยืนยันยอดไม่ได้ ให้ Store หรือหัวหน้ายืนยัน')`; accept → `posted` + เพิ่มยอด; ไม่ accept → `rejected`
  - `openPRs(state, whId?) -> PR[]`
  - (ภายใน) `applyPR(state, pr, qty)` — เพิ่ม `received`, `received >= qty` → `status:'done'`
- แทนที่ `initial_unsupported` ใน `addProduct` (Task 4) ด้วยการเรียก `receive({ whId, lines: [{ productId, qty }] }, actor)` แล้วใส่ผลใน `receipt`

- [ ] **Step 1: เขียน test ที่ fail**

```js
test('store receive adds stock and closes PR', () => {
  const s = Seed.build({ products: 50 }); const store = s.users.find(u => u.role === 'store');
  const pr = s.prs.find(p => p.status === 'open');
  const before = D.qtyOf(s, pr.productId, pr.whId);
  const d = D.receive(s, { whId: pr.whId, lines: [{ productId: pr.productId, qty: pr.qty, prId: pr.id }] }, store);
  assert.match(d.id, /^RC-69\d{4}$/); assert.equal(d.status, 'posted');
  assert.equal(D.qtyOf(s, pr.productId, pr.whId), before + pr.qty);
  assert.equal(pr.status, 'done');
});
test('engineer receive waits for Store', () => {
  const s = Seed.build({ products: 50 }); const eng = s.users.find(u => u.role === 'engineer');
  const store = s.users.find(u => u.role === 'store');
  const d = D.receive(s, { whId: 'W-BN', lines: [{ productId: 'P-0002', qty: 5 }] }, eng);
  assert.equal(d.status, 'pending'); assert.equal(D.qtyOf(s, 'P-0002', 'W-BN'), 342);
  assert.throws(() => D.confirmReceipt(s, d.id, eng, true), { code: 'forbidden' });
  D.confirmReceipt(s, d.id, store, true); assert.equal(D.qtyOf(s, 'P-0002', 'W-BN'), 347);
});
test('receive into counting warehouse is refused', () => {
  const s = Seed.build({ products: 50 }); s.warehouses[0].countId = 'CC-0001';
  assert.throws(() => D.receive(s, { whId: 'W-BN', lines: [{ productId: 'P-0002', qty: 1 }] }, s.users[2]), { code: 'wh_counting' });
});
test('new product with initial stock: role decides', () => {
  const s = Seed.build({ products: 50 }); const cat = s.categories.find(c => c.parentId).id;
  const eng = s.users.find(u => u.role === 'engineer'); const head = s.users.find(u => u.role === 'head');
  const a = D.addProduct(s, { name: 'ก้ามปู 1/2 นิ้ว', unit: 'ตัว', categoryId: cat, initial: { whId: 'W-BN', qty: 100 } }, head);
  assert.equal(a.receipt.status, 'posted'); assert.equal(D.qtyOf(s, a.product.id, 'W-BN'), 100);
  const b = D.addProduct(s, { name: 'ก้ามปู 3/4 นิ้ว', unit: 'ตัว', categoryId: cat, initial: { whId: 'W-BN', qty: 100 } }, eng);
  assert.equal(b.receipt.status, 'pending'); assert.equal(D.qtyOf(s, b.product.id, 'W-BN'), 0);
});
```

- [ ] **Step 2: Run ให้ fail** — Expected: FAIL `D.receive is not a function`
- [ ] **Step 3: Implement** `receive`, `confirmReceipt`, `openPRs`, `applyPR` และทาง `initial` ใน `addProduct`
- [ ] **Step 4: Run ให้ pass** — Expected: PASS ทุก test (รวม Task 1–4)
- [ ] **Step 5: Commit** — `git commit -am "feat(domain): receiving, receipt confirmation, PR fulfilment"`

---

### Task 6: เบิกของ + อนุมัติ + งานใหม่

**Files:**
- Modify: `mockup/js/domain.js`, `tests/domain.test.js`

**Interfaces:**
- Produces:
  - `needsApproval(state, actor) -> boolean` (= `settings.requireApproval && actor.role !== 'head'`)
  - `issue(state, { whId, jobId, lines, note? }, actor) -> { doc, outcome: 'full'|'partial'|'waiting'|'pending', prs: PR[] }`
    - ตรวจตามลำดับ: lines ว่าง → `lines_empty` · ไม่เลือกคลัง → `DomainError('wh_required', 'เลือกคลังที่เบิกของก่อน')` · ไม่เลือกงาน → `DomainError('job_required', 'เลือกงาน / โครงการก่อน')` · งานปิด → `DomainError('job_closed', 'งานนี้ปิดแล้ว เลือกงานอื่น')` · `assertWarehouseOpen` · `validateQty` ทุกบรรทัด
    - `needsApproval` → doc `pending`, ไม่ตัดยอด, outcome `pending`
    - ไม่งั้น `postIssue`: แต่ละบรรทัด `issued = min(qty, มี)` ตัดยอด; ส่วนขาด → PR ใหม่ (`reqId` = doc.id) · outcome: ทุกบรรทัดจ่ายครบ `full` · จ่ายได้บางส่วน `partial` · จ่ายไม่ได้เลย `waiting`
  - `approveIssue(state, docId, actor, approve: boolean) -> { doc, outcome, prs }` — ไม่ใช่ head → `forbidden` ("เฉพาะหัวหน้าอนุมัติได้"); approve → `postIssue` (ถ้าคลังกำลังนับ → `wh_counting`); ไม่ approve → `rejected`, outcome `'rejected'`
  - `addJob(state, { name, customer? }) -> Job` — ชื่อว่าง → `DomainError('job_name', 'ใส่ชื่องานก่อน')`; id จาก `nextId('J')`
  - `similarJobs(state, name) -> Job[]` (กฎเดียวกับ `findSimilar`, เฉพาะงาน open) — ใช้แสดง N51

- [ ] **Step 1: เขียน test ที่ fail**

```js
const base = () => { const s = Seed.build({ products: 50 }); return [s, u => s.users.find(x => x.role === u)]; };
test('full issue deducts stock', () => {
  const [s, U] = base();
  const r = D.issue(s, { whId: 'W-BN', jobId: 'J-25-010', lines: [{ productId: 'P-0001', qty: 100 }] }, U('engineer'));
  assert.equal(r.outcome, 'full'); assert.match(r.doc.id, /^REQ-69\d{4}$/);
  assert.equal(D.qtyOf(s, 'P-0001', 'W-BN'), 1150); assert.equal(r.prs.length, 0);
});
test('shortage → partial + PR, not an error', () => {
  const [s, U] = base();
  const r = D.issue(s, { whId: 'W-BN', jobId: 'J-25-010', lines: [{ productId: 'P-0002', qty: 400 }] }, U('engineer'));
  assert.equal(r.outcome, 'partial'); assert.equal(r.doc.lines[0].issued, 342);
  assert.equal(r.prs[0].qty, 58); assert.equal(D.qtyOf(s, 'P-0002', 'W-BN'), 0);
});
test('nothing in stock → waiting', () => {
  const [s, U] = base();
  const r = D.issue(s, { whId: 'W-BN', jobId: 'J-25-010', lines: [{ productId: 'P-0006', qty: 5 }] }, U('engineer'));
  assert.equal(r.outcome, 'waiting'); assert.equal(r.prs[0].qty, 5);
});
test('approval flow', () => {
  const [s, U] = base(); s.settings.requireApproval = true;
  const r = D.issue(s, { whId: 'W-BN', jobId: 'J-25-010', lines: [{ productId: 'P-0001', qty: 10 }] }, U('engineer'));
  assert.equal(r.outcome, 'pending'); assert.equal(D.qtyOf(s, 'P-0001', 'W-BN'), 1250);
  assert.throws(() => D.approveIssue(s, r.doc.id, U('store'), true), { code: 'forbidden' });
  assert.equal(D.approveIssue(s, r.doc.id, U('head'), true).outcome, 'full');
  assert.equal(D.qtyOf(s, 'P-0001', 'W-BN'), 1240);
  assert.equal(D.issue(s, { whId: 'W-BN', jobId: 'J-25-010', lines: [{ productId: 'P-0001', qty: 1 }] }, U('head')).outcome, 'full');
});
test('guards', () => {
  const [s, U] = base(); const e = U('engineer'); const L = [{ productId: 'P-0005', qty: 1 }];
  assert.throws(() => D.issue(s, { whId: 'W-BN', jobId: 'J-25-010', lines: [] }, e), { code: 'lines_empty' });
  assert.throws(() => D.issue(s, { whId: '', jobId: 'J-25-010', lines: L }, e), { code: 'wh_required' });
  assert.throws(() => D.issue(s, { whId: 'W-BN', jobId: '', lines: L }, e), { code: 'job_required' });
  assert.throws(() => D.issue(s, { whId: 'W-BN', jobId: 'J-25-010', lines: [{ productId: 'P-0005', qty: 1.5 }] }, e), { code: 'qty_integer' });
  s.warehouses.find(w => w.id === 'W-BN').countId = 'CC-0001';
  assert.throws(() => D.issue(s, { whId: 'W-BN', jobId: 'J-25-010', lines: L }, e), { code: 'wh_counting' });
});
test('addJob', () => {
  const [s] = base();
  assert.equal(D.addJob(s, { name: 'ติดตั้งแอร์ ห้องประชุม' }).id, 'J-26-001');
  assert.throws(() => D.addJob(s, { name: ' ' }), { code: 'job_name' });
});
```

- [ ] **Step 2: Run ให้ fail** — Expected: FAIL `D.issue is not a function`
- [ ] **Step 3: Implement** ทุก function ข้างบน
- [ ] **Step 4: Run ให้ pass** — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(domain): issuing with shortage PRs, approvals, jobs"`

---

### Task 7: ตรวจนับ (นับของ)

**Files:**
- Modify: `mockup/js/domain.js`, `tests/domain.test.js`

**Interfaces:**
- Produces:
  - `startCount(state, { whId, categoryId?: string|null }, actor) -> Count` — engineer → `forbidden` ("เฉพาะ Store หรือหัวหน้าเปิดรอบนับได้"); คลังกำลังนับ → `wh_counting`; lines = ทุกสินค้าใน `descendantIds(categoryId)` (null = ทุกสินค้า) พร้อม `system = qtyOf` ตอนเปิด, `counted: null`; ตั้ง `wh.countId`
  - `setCounted(state, countId, productId, qty: number|null) -> void` — qty ติดลบ → `DomainError('qty_invalid', 'จำนวนที่นับต้องไม่ติดลบ')`; 0 ได้; ทศนิยมใช้กฎ `validateQty` ยกเว้นอนุญาต 0
  - `countSummary(count) -> { total, counted, diffLines, diffPlus, diffMinus }` (diff = counted − system เฉพาะบรรทัดที่นับแล้ว)
  - `closeCount(state, countId, actor) -> { count, adjust: Doc|null }` — ยังไม่นับครบ → ยอมให้ปิด (บรรทัดที่ยังไม่นับ = ไม่ปรับ); มีส่วนต่าง → doc `adjust` `ADJ-` `posted` lines `{ productId, qty: diff }` และตั้ง stock = counted; ปลดล็อกคลัง; status `closed`
  - `cancelCount(state, countId, actor) -> Count` — ปลดล็อก ไม่ปรับยอด status `cancelled`

- [ ] **Step 1: เขียน test ที่ fail**

```js
test('count locks, adjusts, unlocks', () => {
  const s = Seed.build({ products: 50 }); const st = s.users.find(u => u.role === 'store');
  const cat = s.categories.find(c => c.name === 'กล่องและตู้').id;
  const c = D.startCount(s, { whId: 'W-BN', categoryId: cat }, st);
  assert.equal(s.warehouses.find(w => w.id === 'W-BN').countId, c.id);
  assert.ok(c.lines.some(l => l.productId === 'P-0002' && l.system === 342));
  assert.throws(() => D.startCount(s, { whId: 'W-BN' }, st), { code: 'wh_counting' });
  D.setCounted(s, c.id, 'P-0002', 340);
  assert.deepEqual(D.countSummary(c).diffLines, 1);
  const { adjust } = D.closeCount(s, c.id, st);
  assert.equal(adjust.lines[0].qty, -2); assert.equal(D.qtyOf(s, 'P-0002', 'W-BN'), 340);
  assert.equal(s.warehouses.find(w => w.id === 'W-BN').countId, null);
});
test('count permissions and cancel', () => {
  const s = Seed.build({ products: 50 });
  assert.throws(() => D.startCount(s, { whId: 'W-A' }, s.users.find(u => u.role === 'engineer')), { code: 'forbidden' });
  const h = s.users.find(u => u.role === 'head'); const c = D.startCount(s, { whId: 'W-A' }, h);
  assert.throws(() => D.setCounted(s, c.id, c.lines[0].productId, -1), { code: 'qty_invalid' });
  D.cancelCount(s, c.id, h); assert.equal(c.status, 'cancelled');
  assert.equal(s.warehouses.find(w => w.id === 'W-A').countId, null);
});
```

- [ ] **Step 2: Run ให้ fail** — Expected: FAIL `D.startCount is not a function`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run ให้ pass** — `node --test tests/` Expected: PASS ทั้งไฟล์
- [ ] **Step 5: Commit** — `git commit -am "feat(domain): stock counts with warehouse lock and adjustments"`

---

### Task 8: App shell — layout ตามรูป, router, state, บทบาท, theme

**Files:**
- Create: `mockup/index.html`, `mockup/css/app.css`, `mockup/js/state.js`, `mockup/js/ui.js`, `mockup/js/app.js`

**Interfaces:**
- Consumes: `Domain.*`, `Seed.build`
- Produces:
  - `AppState.state` — `Vue.reactive(Domain.parseSaved(localStorage.getItem('stockpro-mock-v1')) ?? Seed.build())`; `Vue.watch(state, save, { deep: true })` โดย save ผ่าน `setTimeout` 300ms (debounce)
  - `AppState.act(fn: (state, user) => T, successMsg?: string | ((T) => string)) -> T | undefined` — เรียก fn; จับ `DomainError` → toast แดง `life: 6000` ข้อความ = `err.message` แล้ว return undefined; สำเร็จ → toast เขียว 3000ms ถ้ามี successMsg (ทุกหน้าเรียก domain ผ่าน `act` เท่านั้น)
  - `AppState.reset()` — เขียน seed ใหม่ทับ (ยืนยันด้วย ConfirmDialog ก่อน)
  - `AppState.user` (computed) · `AppState.setRole(role)` (สลับ `currentUserId` ไปผู้ใช้บทบาทนั้น)
  - `AppState.route` — `{ name, query }` จาก `location.hash` (`#/issue?q=thw`) · `AppState.go(name, query?)`
  - `UI` components (global registered): `<cat-thumb :category-id size="48|56" round>` (รูปจาก `categoryImage` ไม่มีก็ไอคอน) · `<product-thumb :product size="48|56">` (รูปจาก `imageOf` ไม่มี/โหลดไม่ได้ก็ไอคอนหมวด) · `<status-tag :status>` (`in|low|out|counting` → จุด + คำ) · `<kpi-card icon tone title :value unit caption @click>` · `<page-header icon title subtitle>` · `<qty :n :unit>` (ใช้ `formatQty`) · `<doc-id :id>` (Geist Mono)
  - `state.js` ประกาศ `window.Pages = {}` · ปลาย `app.js` mount `#app`; หน้าแต่ละไฟล์ลงทะเบียนตัวเองใน `window.Pages[name]` (Task 10–14); route ที่ไม่มีใน Pages → หน้า placeholder "ยังไม่อยู่ในขอบเขต mockup"

Layout (เทียบ `docs/reference/issue-page-target.webp`):
- **Sidebar 220px** พื้นขาว: โลโก้ (ไอคอนเขียว + "StockPro" + บรรทัดเล็ก "ระบบบริหารคลังและเบิกจ่าย") → เมนู `หน้าแรก(home) · คลังสินค้า(products) · เบิกของ(issue) · ขอซื้อ · รับของเข้า(receive) · โอนย้าย · ตรวจนับ(count) · รายงาน ˅` → หัวข้อเทา "ตั้งค่า" → `ข้อมูลวัสดุ(products) · คลังสินค้า · โครงการ / งาน · ผู้ใช้งานและสิทธิ์` → การ์ดผู้ใช้ล่างสุด (avatar วงกลมตัวอักษรแรก + ชื่อ + title + ˅) · เมนู active = พื้น primary-50 ตัวอักษร primary-700 หนา มุมโค้ง 8px
- คลิกการ์ดผู้ใช้ → `p-popover`: เลือกบทบาท (3 ปุ่ม radio: หัวหน้า / Store / วิศวกร) · `p-toggleswitch` "ใบเบิกต้องให้หัวหน้าอนุมัติ" (แก้ได้เฉพาะหัวหน้า; คนอื่นเห็นแต่ disabled) · `p-toggleswitch` "โหมดมืด" (สลับ class `app-dark` บน `<html>`) · ปุ่ม "รีเซ็ตข้อมูลตัวอย่าง"
- **Topbar**: ช่องค้นหา (`pi-search`, placeholder "ค้นหาวัสดุ รหัสสินค้า หรือหมวดหมู่...", ป้าย "⌘K" ขวา) — `Ctrl+K`/`⌘K` โฟกัส, Enter → `go('issue', { q })` · ปุ่มระฆังมี badge แดง = จำนวน (ใบเบิก pending + ใบรับ pending) คลิกเปิด popover รายการ (คลิกแถว → หน้าอนุมัติ/รับของ) · Select บริษัท "บริษัท เอสพี คอนสตรัคชั่น จำกัด"
- **<1024px**: sidebar ซ่อนเป็น `p-drawer` เปิดจากปุ่ม `pi-bars` บน topbar
- `p-toast` มุมขวาบน · `p-confirmdialog`

- [ ] **Step 1: สร้างไฟล์ตาม Interfaces** — ลำดับ `<script>` ใน index.html: tailwind → vue → primevue → aura → domain.js → seed.js → state.js → ui.js → pages/*.js → app.js · `app.css` ใส่ฟอนต์, `tabular-nums` บน `.num`, ขนาดขั้นต่ำ, และ `@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }`
- [ ] **Step 2: เปิดในเบราว์เซอร์** — เปิด `file:///…/mockup/index.html` (built-in browser `navigate`) · Expected: console ไม่มี error, เห็น sidebar/topbar ตามรูป, `#/` แสดง placeholder หน้าแรก
- [ ] **Step 3: ตรวจ state** — สลับบทบาทเป็น Store → ชื่อในการ์ดเปลี่ยนเป็น "ก้องภพ แสงทอง"; reload แล้วยังเป็น Store; `localStorage.setItem('stockpro-mock-v1','{bad')` แล้ว reload → แอปขึ้นด้วย seed (Review Focus 4); เปิดโหมดมืด → พื้นเปลี่ยน ตัวอักษรอ่านได้
- [ ] **Step 4: ตรวจ 390px** — `resize_window` mobile → ไม่มี scroll แนวนอน (`document.documentElement.scrollWidth <= 390`), sidebar อยู่ใน drawer
- [ ] **Step 5: Commit** — `git add mockup && git commit -m "feat(ui): app shell, router, persistent state, role switcher"`

---

### Task 9: รูปสินค้าตัวอย่าง (หาฟรีก่อน ไม่มีค่อยวาดเอง)

**Files:**
- Create: `scripts/fetch-commons.js` (ดาวน์โหลดรูปจาก Wikimedia Commons + พิมพ์เครดิต)
- Create: `mockup/img/photo/*.jpg` (รูปฟรี) · `mockup/img/draw/*.svg` (รูปวาดเอง) · `mockup/img/credits.js`
- Create: `tests/images.test.js`
- Modify: `mockup/js/seed.js` (ใส่ `image` ให้หมวด) · `mockup/js/app.js` (ลิงก์ "เครดิตรูปภาพ" ใน popover ผู้ใช้ + dialog) · `mockup/index.html` (โหลด `img/credits.js` ก่อน `seed.js`)

**Interfaces:**
- Consumes: `Seed.build`, `Domain.imageOf/categoryImage` (Task 3), `<cat-thumb>`/`<product-thumb>` (Task 8)
- Produces:
  - `ImageCredits: { [path: string]: { title, author, license, source, kind: 'photo'|'draw' } }` (global + `module.exports`) — `draw` ใช้ `author: 'วาดเอง (StockPro mockup)'`, `license: 'ใช้ภายในโปรเจกต์'`, `source: ''`
  - `node scripts/fetch-commons.js "File:Electrical-tape black.jpg" mockup/img/photo/tape.jpg` — เรียก `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=…&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=320` ด้วย `User-Agent: stockpro-mockup/1.0`, ดาวน์โหลด `thumburl` (กว้าง 320px ไม่ต้องย่อเอง), พิมพ์ entry ของ `ImageCredits` เป็น JSON (`Artist` ตัด HTML ออก, `LicenseShortName`, `descriptionurl`) · license ไม่อยู่ในรายการที่อนุญาต → exit 1 ไม่บันทึกไฟล์
  - Seed: หมวดแม่ทั้ง 10 และหมวดย่อยทุกหมวดมี `image`; `product.image` ใส่เฉพาะเมื่อหาได้รูปที่ตรงกว่ารูปหมวดย่อย (เช่น 6 แถวตามรูปเป้าหมาย) ที่เหลือเป็น `null`

**ลำดับการหารูป (ต่อ 1 หมวด):**
1. Wikimedia Commons (`generator=search&gsrnamespace=6`) คำค้นอังกฤษ เช่น `THW wire`, `electrical junction box`, `EMT conduit`, `miniature circuit breaker`, `electrical tape`, `power outlet`, `cable tie`, `hard hat`, `UTP cable` — ผลสำรวจวันที่ 12 พ.ย. 2569 พบตัวเลือก เช่น `File:Electrical-tape black.jpg` (Public domain), `File:UTP cable.jpg` (Public domain), `File:HardHat.jpg` (CC0), `File:Circuit Breaker 2.png` (CC0)
2. Openverse `https://api.openverse.org/v1/images/?q=…&license=cc0,pdm,by,by-sa&page_size=20` (รวม Flickr ฯลฯ ไม่ต้องใช้ key) — ดาวน์โหลดจาก `url` ของผลแล้วกรอกเครดิตจาก `creator`, `license`, `foreign_landing_url`
3. ไม่ได้รูปที่ผ่านเกณฑ์ → วาด SVG เอง
- License ที่รับ: `CC0`, `Public domain`, `No restrictions`, `CC BY *`, `CC BY-SA *` เท่านั้น (ห้าม GPL, NC, ND, fair use) — BY/BY-SA ต้องโชว์เครดิตใน dialog "เครดิตรูปภาพ"
- ไม่ใช้ Pexels/Unsplash/Pixabay (ต้องมี API key) เว้นแต่ผู้ใช้ให้ key มา

**เกณฑ์รับรูปถ่าย** (ต้องเปิดดูรูปจริงด้วย Read ทุกรูปก่อนรับ): เป็นของชนิดเดียวกับหมวด · เห็นของชิ้นเดียวชัด ครอปเป็นสี่เหลี่ยมจัตุรัส (`object-fit: cover`) ที่ 56px แล้วยังรู้ว่าคืออะไร · ไม่มีคน ลายน้ำ ข้อความ หรือโลโก้ยี่ห้อเด่น · พื้นหลังเรียบดีกว่าภาพหน้างาน · ไฟล์ ≤ 60KB

**สไตล์รูปวาด SVG:** `viewBox="0 0 96 96"` พื้นโปร่ง (กรอบขาวมาจาก thumb) · flat 2–3 โทนต่อชิ้น + เส้นขอบ 2px `#28302d` · แสงจากซ้ายบนเหมือนกันทุกรูป · สีจริงของของ (สายไฟ: ฉนวนดำ/แดง + ทองแดง, ท่อ: เทาเงิน, กล่อง: เทาอ่อน) · ≤ 4KB ต่อไฟล์ · ใช้ได้ทั้งโหมดสว่างและมืด

- [ ] **Step 1: เขียน test ที่ fail** — `tests/images.test.js`

```js
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const Seed = require('../mockup/js/seed.js'); const Credits = require('../mockup/img/credits.js');
const root = path.join(__dirname, '../mockup'); const s = Seed.build();
const used = [...s.categories, ...s.products].map(x => x.image).filter(Boolean);
const OK = /^(CC0|Public domain|No restrictions|CC BY(-SA)? [\d.]+)$/;
test('every category has an image', () => assert.ok(s.categories.every(c => c.image)));
test('every referenced image exists, is small, and is credited', () => {
  for (const p of new Set(used)) {
    const f = path.join(root, p);
    assert.ok(fs.existsSync(f), p);
    assert.ok(fs.statSync(f).size <= 60 * 1024, p);
    const c = Credits[p]; assert.ok(c, 'no credit: ' + p);
    if (c.kind === 'photo') assert.ok(OK.test(c.license) && c.author && c.source.startsWith('https://'), p);
  }
});
test('no orphan files', () => {
  for (const dir of ['img/photo', 'img/draw'])
    for (const f of fs.readdirSync(path.join(root, dir))) assert.ok(Credits[`${dir}/${f}`], 'orphan ' + f);
});
```

- [ ] **Step 2: Run ให้ fail** — `node --test tests/images.test.js` · Expected: FAIL `Cannot find module '../mockup/img/credits.js'`
- [ ] **Step 3: เขียน `scripts/fetch-commons.js`** ตาม Interfaces แล้วลองกับ `File:Electrical-tape black.jpg` · Expected: ได้ไฟล์ ≤ 60KB + JSON เครดิต license `Public domain`
- [ ] **Step 4: หารูปทีละหมวด** ตามลำดับแหล่งข้างบน เปิดดูทุกรูปที่จะรับ บันทึกลง `img/photo/` + เพิ่ม entry ใน `credits.js` · หมวดไหนไม่ผ่านเกณฑ์ → วาด `img/draw/<slug>.svg` + entry `kind: 'draw'` · จดในหัว `credits.js` ว่าหมวดไหนใช้รูปถ่าย/รูปวาด
- [ ] **Step 5: ใส่ `image` ใน seed** แล้ว Run `node --test tests/` · Expected: PASS ทั้งหมด (รวม test เดิมของ seed)
- [ ] **Step 6: เทียบรูปเป้าหมาย** — เปิด `#/issue` screenshot ข้าง `docs/reference/issue-page-target.webp` · Expected: แถบหมวดเป็นรูปวงกลมครบ 10 หมวด, 6 แถวแรกมีรูป, ตะกร้ามีรูป, รูปถ่ายกับรูปวาดดูเข้ากัน (ถ้ารูปไหนดูแปลกแยกให้เปลี่ยน) · dark mode กรอบรูปยังขาวอ่านออก · ลบไฟล์รูปหนึ่งชั่วคราว → แถวนั้นกลับเป็นไอคอน ไม่มีรูปแตก
- [ ] **Step 7: dialog "เครดิตรูปภาพ"** — ตาราง: รูปเล็ก · ชื่อไฟล์ · ผู้สร้าง · license · ลิงก์แหล่งที่มา (เปิดแท็บใหม่) · ตรวจว่ารูป BY/BY-SA ทุกรูปอยู่ในตาราง
- [ ] **Step 8: Commit** — `git add scripts mockup tests && git commit -m "feat(ui): sample product images (free photos first, drawn SVG fallback) with credits"`

---

### Task 10: หน้าเบิกของ (ตามรูปเป๊ะ)

**Files:**
- Create: `mockup/js/pages/issue.js` (`Pages.issue`)
- Create: `mockup/js/components/product-dialog.js` (`<product-dialog v-model:visible :initial-name @created>`) — ใช้ร่วมกับ Task 11

**Interfaces:**
- Consumes: `Domain.searchProducts/tabCounts/kpis/warehouseOptions/qtyOf/stockStatus/categoryPath/needsApproval/issue/addJob/similarJobs/addProduct/findSimilar/addCategory`, `AppState.act/go/state.cart`, UI components
- Produces: `<product-dialog>` emits `created(product)`; ฟิลด์ตาม PDF หัวข้อ "สร้างสินค้าใหม่": ชื่อ* (placeholder "เช่น น็อตสแตนเลส M8", เติมจาก `initial-name`) · ยี่ห้อ ("เช่น Yazaki, 3M") · รุ่น / ขนาด ("เช่น THW 1x2.5 sq.mm") · รหัสสินค้า (ว่าง = ใช้ P-xxxx) · หมวดหมู่* (`p-select` จัดกลุ่มตามหมวดแม่ + ตัวเลือกท้าย "+ สร้างหมวดใหม่" เปิดช่องพิมพ์ชื่อ เรียก `addCategory`) · หน่วย* (ปุ่มเลือก: เมตร · ตัว · ชิ้น · ใบ · ม้วน · ถุง · กล่อง · อื่น ๆ → พิมพ์เอง) · จุดสั่งซื้อ (เตือนเมื่อเหลือน้อยกว่า) · สวิตช์ "มีของนี้อยู่ในคลังแล้ว" → คลัง (เฉพาะคลังไม่ล็อก) + จำนวน · ข้อความท้าย N17 ตามบทบาท ("ยอดเข้าคลังทันที" / "Store จะตรวจยืนยันยอดก่อนเข้าคลัง ระหว่างนี้เบิกได้ แต่ใบเบิกจะรอของจนกว่า Store ยืนยัน") · ชื่อซ้ำ → `p-message severity=error` "มีสินค้านี้แล้ว: {id} {name}" + ปุ่ม "ใช้รายการนี้" · ชื่อคล้าย → `p-message severity=warn` แถวละตัว · ปุ่ม "สร้าง" disabled จนชื่อ+หน่วย+หมวด (+ยอดถ้าเปิดสวิตช์) ครบ และมีบรรทัดเล็กเหนือปุ่มบอกว่าขาดอะไร · กว้างสุด 34rem, เต็มจอบน <640px

Layout หน้าเบิก (ดูรูป):
1. `page-header` ไอคอนรถเข็น "เบิกของ" + "เลือกวัสดุจากคลังเพื่อเบิกไปใช้ในหน้างาน พร้อมตรวจสอบจำนวนคงเหลือแบบเรียลไทม์"
2. แถว **KPI 4 ใบ** จาก `kpis(state, cart.whId)`: `ของใกล้หมด {low} รายการ` "คงเหลือน้อยกว่าจุดสั่งซื้อ" (ไอคอน `pi-exclamation-triangle` พื้นแดงอ่อน) → คลิก = แท็บใกล้หมด · `ไม่มีของ {out} รายการ` "ของหมด ต้องรอรับเข้า" (`pi-box` แดง) → แท็บไม่มีของ · `รออนุมัติ {pendingApprovals} ใบเบิก` "รอผู้มีอำนาจอนุมัติ" (`pi-file-check` เขียว) → `go('approvals')` · `รอของเข้า {openPRs} รายการ` "ระหว่างจัดส่งเข้าคลัง" (`pi-truck` ส้ม) → `go('receive')` · มี `pi-chevron-right` มุมขวาบนทุกใบ
3. การ์ด **เลือกตามหมวดหมู่** + ลิงก์ "ดูหมวดหมู่ทั้งหมด ›": แถวไอคอนวงกลมหมวดระดับบน (เลื่อนแนวนอนในกรอบได้ตอนจอแคบ) ชื่อใต้ไอคอน; เลือก = กรอบเขียวมุมโค้ง + ชื่อสีเขียว; แตะซ้ำ = ยกเลิก · "ดูหมวดหมู่ทั้งหมด" เปิด `p-dialog` รายการหมวดแม่ + หมวดย่อยพร้อมจำนวนสินค้า มีช่องค้นหา เลือกหมวดย่อยได้ และลิงก์ "จัดการหมวดหมู่" → `go('products', { tab: 'categories' })`
4. การ์ด **ตาราง**: pill tabs `ทั้งหมด {all}` · `มีของ {in}` · `ใกล้หมด {low}` · `ไม่มีของ {out}` (active = พื้น primary-700 ตัวขาว, ตัวเลขใน badge) · ช่อง "ค้นหาในรายการนี้..." (debounce 150ms; รับค่าเริ่มจาก `route.query.q`) · ปุ่ม "ตัวกรอง" (`p-popover`: ยี่ห้อ multi-select + "ซ่อนสินค้าที่เพิ่มแล้ว") · `p-datatable` `paginator :rows="20" :rowsPerPageOptions="[20,50,100]"` คอลัมน์:
   - **รายการสินค้า**: `product-thumb` 56px + ชื่อหนา (ตัดบรรทัดได้ ไม่ใช้ "…") + "รหัส: {code}" + `categoryPath` (เทา 14px)
   - **คงเหลือ**: `qty(qtyOf(p, rowWh))` หนา ชิดขวา
   - **สถานะคลัง**: `status-tag`
   - (ไม่มีหัว) **คลังต่อแถว**: Select แบบไม่มีกรอบ แสดงชื่อคลัง + ˅ ค่าเริ่ม = `cart.whId`; เปลี่ยน = ดูยอดคลังอื่นของแถวนั้นเท่านั้น (เก็บใน `rowWh[p.id]` ไม่ persist) ตัวเลือกแสดง "{คลัง} · {qty}"; ถ้าสถานะ out แสดง "-"
   - **หน่วย**: คำเต็ม
   - **ปุ่ม**: ยังไม่เพิ่ม + มีของ → ปุ่มเขียว `pi-shopping-cart` "เพิ่ม" · เพิ่มแล้ว → ปุ่มเขียวอ่อน `pi-check` "เพิ่มแล้ว" (คลิก = เลื่อนตะกร้าไปบรรทัดนั้น + ไฮไลต์ 2 วินาที) · ไม่มีของ → ปุ่ม outline "ดูรายละเอียด" เปิด dialog: ยอดทุกคลัง (`qty` + `status-tag` ต่อคลัง), PR ที่ค้างของสินค้านี้, ปุ่ม "เพิ่มเข้าใบเบิก (รอของเข้า)"
   - ผลว่าง: "ไม่พบสินค้า "{q}"" + ปุ่ม dashed "สร้างสินค้าใหม่ "{q}"" → `product-dialog` (`initial-name = q`) → `created` = เพิ่มเข้าตะกร้า + toast "สร้างแล้ว: {name} ({id}) เลือกให้แล้ว"
5. **แผงตะกร้า (ขวา 340px, sticky top)**: หัว `pi-shopping-cart` "รายการเบิก ({n})" + ลิงก์แดง `pi-trash` "ล้างทั้งหมด" (ConfirmDialog) · ต่อบรรทัด: `product-thumb` 48 · ชื่อหนา · หน่วยย่อ (เทา) · `p-inputnumber showButtons buttonLayout="horizontal"` (− / + ; `minFractionDigits 0`, `maxFractionDigits` = 2 ถ้าเมตรไม่งั้น 0, min 0) · ปุ่ม `pi-times` ลบ (≥44px) · ถ้า qty > มีในคลังที่เลือก → บรรทัดส้มเล็กใต้ชื่อ "มีในคลังนี้ {มี} · ขาด {ขาด}" (`pi-exclamation-triangle`) · กล่องเทา "รวม {n} รายการ" / "{ผลรวม qty} หน่วย" · `คลังที่เบิกของ *` `p-select` จาก `warehouseOptions` (ไอคอน `pi-building`, ป้ายขวา: "ครบ ✓" / "ขาด k/n" / "ไม่มีของ" / "กำลังตรวจนับ" disabled) · `งาน / โครงการ *` `p-select filter` รูปแบบ "{id} – {name}" ไอคอน `pi-briefcase` + footer "+ งานใหม่" เปิด dialog (ชื่องาน*, ลูกค้าหรือสถานที่; ชื่อคล้าย → warn + "ใช้งานนี้") · `หมายเหตุ (ถ้ามี)` `p-textarea` placeholder "เช่น เบิกใช้ติดตั้งระบบไฟฟ้าชั้น 3" · ปุ่มใหญ่ 56px เต็มกว้าง `pi-send` "เบิกเลย" (หรือ "ส่งเบิก" + ข้อความเล็กเหนือปุ่ม "ใบเบิกนี้ต้องให้หัวหน้าอนุมัติก่อนจ่ายของ" เมื่อ `needsApproval`) · disabled เมื่อ ตะกร้าว่าง/qty 0/ไม่มีคลัง/ไม่มีงาน (บรรทัดเล็กบอกว่าขาดอะไร) · กดแล้ว `loading` 600ms กันกดซ้ำ จากนั้น `act(issue)`
6. **ผลการเบิก** `p-dialog`: ไอคอน + หัวตาม outcome — `full` `pi-check-circle` "จ่ายของแล้ว" · `partial` `pi-exclamation-circle` "จ่ายแล้วบางส่วน" (แสดง "จ่ายแล้ว X จาก Y {หน่วย}" ต่อบรรทัด + เลข PR) · `waiting` `pi-clock` "บันทึกใบเบิกแล้ว ยังไม่มีของ รอของเข้า" + เลข PR · `pending` `pi-send` "ส่งให้หัวหน้าแล้ว รออนุมัติ" — ทุกแบบมี `doc-id`, งาน "{id} {name}", ปุ่ม "เบิกต่อ" (ล้างบรรทัด+หมายเหตุ เก็บคลังและงาน) และ "ดูประวัติ" (`go('home')`)
7. **<1280px**: ตะกร้าย้ายลงใต้ตาราง; **<768px**: ตารางเปลี่ยนเป็นการ์ดซ้อน (ชื่อ / คงเหลือ+สถานะ / ปุ่ม) และปุ่มเบิกติดล่างจอ (`position: sticky; bottom: 0`)

- [ ] **Step 1: Implement `product-dialog.js` และ `issue.js`** ตามข้างบน
- [ ] **Step 2: เทียบรูป** — เปิด `#/issue` ที่ 1440×1090, screenshot วางข้าง `docs/reference/issue-page-target.webp` · Expected: KPI = 12 / 3 / 7 / 18, หมวดสายไฟถูกเลือกได้, 6 แถวแรกตรงชื่อ/รหัส/ยอด/สถานะตามรูป, ตะกร้ามี 3 รายการ รวม 140 หน่วย, คลัง "คลังหลัก บางนา", งาน "J-25-010 – อาคารสำนักงาน โซน A"
- [ ] **Step 3: ตรวจ flow** — ค้น "THW 2.5" → เห็นผล; ค้น "ท่อPPR xyz" → แถวสร้างสินค้าใหม่ → สร้าง → เข้าตะกร้า · ใส่กล่องพักสาย 400 → เห็น "ขาด 58" → เบิก → dialog "จ่ายแล้วบางส่วน" + PR · KPI รอของเข้าเพิ่ม 1 · หน้า 100 ของ paginator โหลดทันที
- [ ] **Step 4: ตรวจ 390px + dark** — ไม่มี scroll แนวนอน, ปุ่มเบิกเห็นตลอด, dark mode อ่านได้
- [ ] **Step 5: Commit** — `git add mockup && git commit -m "feat(ui): issue page matching target design"`

---

### Task 11: ข้อมูลวัสดุ — รายการสินค้า + หมวดหมู่กำหนดเอง

**Files:**
- Create: `mockup/js/pages/products.js` (`Pages.products`)

**Interfaces:**
- Consumes: `<product-dialog>` (Task 10), `Domain.searchProducts/productCounts/addCategory/updateCategory/deleteCategory/updateProduct/totalQty/categoryPath`, `AppState.route.query.tab`

Layout: `page-header` `pi-database` "ข้อมูลวัสดุ" + "จัดการรายการวัสดุและหมวดหมู่ของบริษัท" · `p-tabs` 2 แท็บ (`?tab=items|categories`):
- **รายการวัสดุ**: ช่องค้นหา + Select หมวด + ปุ่ม "เพิ่มวัสดุ" (`product-dialog`) · `p-datatable` paginator 20 · `sortable` ชื่อ/รหัส/ยอดรวม · คอลัมน์: thumb+ชื่อ+ยี่ห้อ·รุ่น · รหัส · หมวด (`categoryPath`) · หน่วย · จุดสั่งซื้อ · ยอดรวมทุกคลัง · ยอดแยก 4 คลัง (ซ่อน <1280px) · ปุ่ม `pi-pencil` แก้ไข (dialog เดิมในโหมดแก้ ไม่มีสวิตช์ยอดตั้งต้น)
- **หมวดหมู่**: รายการหมวดแม่ (แต่ละแถว: `cat-thumb` + ชื่อ + "{n} รายการ" + ปุ่มลูกศรขึ้น/ลง (เปลี่ยน `order`) + แก้ไข + ลบ) กางดูหมวดย่อยได้ · ปุ่ม "เพิ่มหมวด" และ "+ หมวดย่อย" ในแต่ละหมวดแม่ · dialog แก้หมวด: ชื่อ*, หมวดแม่ (เฉพาะสร้างใหม่), รูปหมวด: "ใช้ไอคอน" (ค่าเริ่มของหมวดใหม่) หรือเลือกจากกริดรูปตัวอย่างใน `ImageCredits`, ถ้าใช้ไอคอน เลือกไอคอนจากกริด 24 PrimeIcons และสีจาก 8 สี (พื้นอ่อนที่ตัวอักษรเข้มอ่านได้) · ลบ: ถ้า `cat_in_use` → dialog "หมวดนี้มีสินค้า n รายการ…" + Select "ย้ายไปหมวด" + ปุ่ม "ย้ายแล้วลบ"
- หมวดที่สร้างใหม่ต้องโผล่ในแถบหมวดหน้าเบิกทันที (เรียงตาม `order`)

- [ ] **Step 1: Implement**
- [ ] **Step 2: ตรวจ** — สร้างหมวด "งานประปา" + หมวดย่อย "ข้อต่อ PVC" (ไอคอน/สีเอง) → สร้างวัสดุในหมวดนั้น → ไปหน้าเบิก เห็นหมวดใหม่ในแถบและเลือกแล้วเจอวัสดุ · สร้างชื่อซ้ำ → error · ลบ "สายไฟ THW" → ต้องเลือกหมวดย้ายก่อน (Review Focus 5) · เลื่อนหมวดขึ้นลงแล้วลำดับในหน้าเบิกเปลี่ยนตาม
- [ ] **Step 3: Commit** — `git add mockup && git commit -m "feat(ui): materials master and custom categories"`

---

### Task 12: รับของเข้า (เติมของ)

**Files:**
- Create: `mockup/js/pages/receive.js` (`Pages.receive`)

**Interfaces:**
- Consumes: `Domain.receive/confirmReceipt/openPRs/searchProducts/warehouseOptions`, `<product-dialog>`

Layout: `page-header` `pi-download` "รับของเข้า" + "บันทึกของเข้าคลัง เติมสต็อกและปิดรายการต้องซื้อ" · 2 คอลัมน์ (ซ้อนบน <1024px):
- **ซ้าย การ์ด "รายการต้องซื้อที่รอของ ({n})"**: `p-datatable` ของ `openPRs` (PR id, สินค้า, คลัง, ต้องการ, รับแล้ว, จากใบเบิก) + checkbox เลือกหลายแถว + ปุ่ม "ใส่ในใบรับ" (เติมบรรทัดพร้อม `prId` และ qty = qty − received) · ด้านล่าง การ์ด "รอยืนยันยอด ({n})" (docs receive `pending`) แต่ละใบมีปุ่ม "ยืนยันยอด" / "ไม่มีของ" — ปุ่มเห็นเฉพาะ Store/หัวหน้า; วิศวกรเห็นข้อความ "รอ Store ตรวจยืนยัน"
- **ขวา การ์ด "ใบรับของ"**: Select คลัง* (คลังที่กำลังนับ disabled + ป้าย) · `p-autocomplete` "ค้นหาวัสดุที่จะรับ" (ใช้ `searchProducts` สูงสุด 20 ผล, แสดงชื่อ + รหัส + ยอดในคลังนี้; ท้ายรายการ "สร้างวัสดุใหม่ "{คำ}"") · ตารางบรรทัด: ชื่อ · มีอยู่ตอนนี้ · `p-inputnumber` รับเข้า · หน่วย · ยอดหลังรับ · อ้างอิง PR (ถ้ามี) · ลบ · หมายเหตุ · ปุ่ม "บันทึกรับของ" (วิศวกร = "ส่งให้ Store ยืนยัน") → toast "รับของเข้าแล้ว {RC-…} · {n} รายการ" หรือ "ส่งให้ Store ยืนยันยอดแล้ว ({RC-…})"

- [ ] **Step 1: Implement**
- [ ] **Step 2: ตรวจลูป** — จาก PR ที่เกิดใน Task 10 (กล่องพักสาย ขาด 58) → ใส่ในใบรับ → บันทึก (บทบาท Store) → PR หายจากรายการ, หน้าเบิก KPI "รอของเข้า" ลด 1, ยอดกล่องพักสายใน W-BN = 58 · สลับเป็นวิศวกร รับของ → อยู่ใน "รอยืนยันยอด" ยอดยังไม่เพิ่ม → สลับเป็น Store กดยืนยัน → ยอดเพิ่ม
- [ ] **Step 3: Commit** — `git add mockup && git commit -m "feat(ui): goods receiving with PR fulfilment and confirmation"`

---

### Task 13: ตรวจนับ

**Files:**
- Create: `mockup/js/pages/count.js` (`Pages.count`)

**Interfaces:**
- Consumes: `Domain.startCount/setCounted/countSummary/closeCount/cancelCount/categoryPath`

Layout: `page-header` `pi-list-check` "ตรวจนับ" + "นับของจริงในคลัง เทียบกับยอดในระบบ แล้วปรับยอดให้ตรง":
- **ไม่มีรอบเปิดที่เลือกอยู่**: การ์ดรายการรอบนับ (id, คลัง, หมวด, สถานะ, นับแล้ว x/y) + ปุ่ม "เปิดรอบนับใหม่" → dialog: คลัง* (คลังที่กำลังนับ disabled), หมวด (ไม่บังคับ; ข้อความช่วย "แนะนำให้นับทีละหมวด ถ้าไม่เลือกจะนับทั้ง {n} รายการ"), คำเตือนเหลือง "ระหว่างนับ คลังนี้จะเบิกและรับของไม่ได้" · วิศวกรเห็นปุ่ม disabled + ข้อความ "เฉพาะ Store หรือหัวหน้าเปิดรอบนับได้"
- **รอบที่เปิดอยู่**: แถบสรุปบน (นับแล้ว x/y · progress bar · ต่าง n รายการ · +a / −b) · ช่องค้นหาในรอบ + ตัวกรอง `ทั้งหมด · ยังไม่นับ · ต่าง` · `p-datatable` paginator 50: สินค้า · ในระบบ · `p-inputnumber` นับได้ (Enter = ไปช่องถัดไป) · ส่วนต่าง (สีเขียว +/แดง −, มีเครื่องหมายและคำเสมอ) · ปุ่ม "ยกเลิกรอบนับ" (Confirm) และ "ปิดรอบและปรับยอด" (Confirm แสดงจำนวนบรรทัดที่จะปรับ และ "บรรทัดที่ยังไม่นับจะไม่ถูกปรับ") → toast "ปิดรอบนับ {CC-…} แล้ว · ปรับยอด {n} รายการ ({ADJ-…})"
- หน้าเบิก: Select คลังแสดง "กำลังตรวจนับ" disabled และตารางแถวของคลังนั้นใช้ `status-tag counting`

- [ ] **Step 1: Implement**
- [ ] **Step 2: ตรวจ** — เปิดรอบนับ คลังหลัก หมวด "กล่องและตู้" → หน้าเบิก เลือกคลังหลักไม่ได้ / รับของเข้าคลังหลักไม่ได้ (Review Focus 1) → นับกล่องพักสายต่าง 2 → ปิดรอบ → ยอดเปลี่ยน, คลังปลดล็อก, หน้าแรกเห็น ADJ-
- [ ] **Step 3: Commit** — `git add mockup && git commit -m "feat(ui): stock count sessions"`

---

### Task 14: หน้าแรก + อนุมัติใบเบิก

**Files:**
- Create: `mockup/js/pages/home.js` (`Pages.home`), `mockup/js/pages/approvals.js` (`Pages.approvals`)

**Interfaces:**
- Consumes: `Domain.kpis/approveIssue/categoryPath`, `<kpi-card>`, `<doc-id>`

- **หน้าแรก**: `page-header` `pi-home` "หน้าแรก" + "สวัสดี {ชื่อ}" · KPI 4 ใบเดียวกับหน้าเบิก (คลังหลัก) · การ์ด "ทางลัด" 4 ปุ่มใหญ่: เบิกของ · รับของเข้า · ตรวจนับ · เพิ่มวัสดุ · การ์ด "ความเคลื่อนไหวล่าสุด" `p-datatable` paginator 10 จาก `docs` เรียง `at` ล่าสุดก่อน: เวลา · `doc-id` · ประเภท (เบิก/รับ/ปรับยอด + `p-tag`) · คลัง · งาน · จำนวนรายการ · โดย · สถานะ (จ่ายแล้ว/รออนุมัติ/รอยืนยัน/ไม่อนุมัติ) · คลิกแถว → dialog รายละเอียดบรรทัด
- **อนุมัติ** (`#/approvals`): รายการใบเบิก `pending` (การ์ดต่อใบ: doc-id, ผู้ขอ, งาน, คลัง, บรรทัด พร้อม "ขอเบิก / มีในคลังนี้" ต่อบรรทัด) · ปุ่ม "อนุมัติ" / "ไม่อนุมัติ" เฉพาะหัวหน้า (คนอื่นเห็น banner "เฉพาะหัวหน้าอนุมัติได้ — สลับบทบาทที่การ์ดผู้ใช้ล่างซ้าย") · อนุมัติแล้ว toast ตาม outcome (full/partial/waiting)

- [ ] **Step 1: Implement**
- [ ] **Step 2: ตรวจ** — เปิดสวิตช์อนุมัติ (หัวหน้า) → สลับเป็นวิศวกร ปุ่มเปลี่ยนเป็น "ส่งเบิก" → ส่ง → ระฆัง +1, KPI รออนุมัติ 8 → สลับเป็นหัวหน้า อนุมัติ → ยอดถูกตัด, ประวัติแสดง "จ่ายแล้ว"
- [ ] **Step 3: Commit** — `git add mockup && git commit -m "feat(ui): home dashboard and issue approvals"`

---

### Task 15: เดินลูปเต็ม + ตรวจคุณภาพ

**Files:**
- Create: `mockup/README.md` (วิธีเปิด, บทบาท, สคริปต์เดโม 10 ขั้นข้างล่าง, สิ่งที่ต่างจาก PDF, ที่มาของรูปและวิธีเพิ่มรูปด้วย `scripts/fetch-commons.js`)

- [ ] **Step 1: รัน test ทั้งหมด** — `node --test tests/` · Expected: PASS ทั้งหมด
- [ ] **Step 2: เดโมลูปเต็มในเบราว์เซอร์ (รีเซ็ตข้อมูลก่อน)** — (1) หัวหน้าสร้างหมวด "งานประปา" › "ท่อ PVC" (2) สร้างวัสดุ "ท่อ PVC 1/2 นิ้ว ชั้น 8.5" หน่วย เส้น ยอดตั้งต้น 0 (3) วิศวกรเบิก 20 เส้นไปงาน J-25-010 → "รอของเข้า" + PR (4) Store รับของ 50 เส้นจาก PR → PR ปิด (5) วิศวกรเบิก 20 → "จ่ายของแล้ว" (6) Store เปิดรอบนับหมวด "งานประปา" นับได้ 28 → ปิดรอบ ADJ −2 (7) หน้าแรกเห็นครบทุกเอกสาร · Expected: ทุกขั้นสำเร็จ ยอดสุดท้าย = 28 เส้น
- [ ] **Step 3: Scale** — หน้าเบิก ค้นหา "สาย" พิมพ์ต่อเนื่องไม่หน่วง; เปลี่ยน rows 100 แล้วเปลี่ยนหน้าไม่หน่วงเห็นได้
- [ ] **Step 4: Constraint checks** — ที่ 390px ทุกหน้า: `scrollWidth <= 390`; ใน console `[...document.querySelectorAll('button, input, a, [role=button]')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 44)` ต้องว่าง (ยกเว้น link ในข้อความ); dark mode ทุกหน้าอ่านได้; `prefers-reduced-motion` ไม่มีอนิเมชัน
- [ ] **Step 5: Commit** — `git add -A && git commit -m "docs: mockup README and full-loop demo script"`
