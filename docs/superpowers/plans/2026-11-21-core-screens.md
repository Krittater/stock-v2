# StockPro · 4 หน้าหลัก (คืนของ · สินค้า · งาน · รับของ + ยอดตั้งต้น) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำ 4 หน้าตาม requirement ให้ครบทุก AC และทุกช่องว่าง (G) ในสไตล์ StockPro ที่เน้นคอม: ตาราง PrimeVue + แผงด้านขวา (แบบหน้าเบิกของ) โดยเพิ่มชั้นวาง สายม้วน ชั้นรอตรวจ และการกันของให้ใบเบิกที่รอ

**Architecture:** `mockup/js/domain.js` ยังเป็นแกนของ domain และเพิ่มไฟล์ domain ใหม่แยกตามเรื่องใน `mockup/js/domain/*.js` แต่ละไฟล์ `Object.assign(Domain, {...})` ส่วนหน้าจอเป็น `window.Pages.<name>` ใน `mockup/js/pages/` และเรียก domain ผ่าน `act()` ของ `state.js` · stock ยังเป็น map เดิม แต่ key เพิ่มชั้นเข้าไป · `qtyOf` รวมทุกชั้น (ไม่รวมชั้นรอตรวจ) และรวมม้วน เพื่อให้หน้าเดิมที่เรียก `qtyOf`/`totalQty` ไม่ต้องแก้

**Tech Stack:** Vue 3.5.13 · PrimeVue 4.2.5 (Aura) · Tailwind 4.0.14 browser · PrimeIcons · Node 22 `node:test`

**Spec:** `docs/reference/core-screens-requirements.md` · `docs/reference/personas.md` (ผู้ใช้หลัก = Store)

## Global Constraints

- ห้ามใช้ ES module · ไฟล์ domain ใหม่ใช้รูปแบบเดียวกับ `domain.js`: IIFE รับ `root`, ดึง `const D = root.Domain || require('../domain.js')`, `Object.assign(D, {...})`, `if (typeof module !== 'undefined') module.exports = D;` · โหลดใน `index.html` หลัง `js/domain.js` ตามลำดับ Task · ฝั่ง test ให้ require ตามลำดับเดียวกัน (สร้าง `tests/_load.js` ที่ require ทุกไฟล์แล้วคืน Domain)
- ข้อผิดพลาดใช้ `throw new DomainError(code, ข้อความไทย)` ทุกครั้ง (หน้าจอแสดง `message` ผ่าน `act()`)
- ทำเฉพาะโหมดเล็ก · บทบาท: `engineer` · `store` · `head` (บัญชีใช้สิทธิ์เดียวกับวิศวกร ยังไม่เพิ่ม user)
- ที่ ≥ 1280px ใช้ layout ตาราง + แผงขวา 360px แบบหน้าเบิก · ที่ 390px แผงขวาย้ายลงล่างเป็นแผ่นที่ติดล่างจอ (ปุ่มยืนยันกับบรรทัดสรุปมองเห็นเสมอ) · ไม่มี scroll แนวนอนทั้งหน้า (ตารางเลื่อนในกรอบตัวเองได้) · ปุ่ม/ช่องสูง ≥ 44px · ตัวหนังสือ ≥ 14px · โหมดมืด
- **ไม่มีขั้นล็อก** (คงแนว StockPro) แต่แผงขวาต้องเรียงส่วน **ของ → จำนวน → ที่ไหน → ยืนยัน** และปุ่มยืนยันกดไม่ได้จนกว่าจะครบ โดยมีบรรทัด "ยังขาด: …" บอก
- ศัพท์ต้องห้ามในส่วนหลัก: ledger, จอง, SKU, QC, PR, roll tracked, หน่วยซื้อ, เกณฑ์เศษ, batch, Master · คำแทน: จอง→"กันของไว้ให้", QC→"ชั้นรอตรวจ", batch→"ล็อตผู้ผลิต", PR→"รายการต้องซื้อ" (รหัสเอกสาร `PR-690001` แสดงได้)
- ชั้นเริ่มต้นของ คืน / รับ / ยอดตั้งต้น = `ทั่วไป`
- หน่วยที่ไม่ใช่ `เมตร` ต้องเป็นจำนวนเต็มทุกหน้า (ใช้ `validateQty` เดิม)
- ข้อความไม่มีสิทธิ์กลาง: `คุณทำรายการนี้ไม่ได้ ให้หัวหน้าทำแทน หรือขอให้หัวหน้าเปิดสิทธิ์` (`D.FORBIDDEN`)
- ทุกการกระทำที่เปลี่ยนข้อมูลต้องเรียก `D.log(state, actor, action, ref, text)` (Task 1)
- สแกนเป็นทางเลือกเสมอ
- `localStorage` key เปลี่ยนเป็น `stockpro-mock-v3`
- เลขเอกสารใหม่: คืนของ `RT-690001` · รอบยืนยันยอดตั้งต้น `CC-0001` (counter `CC` มีอยู่แล้ว) · ม้วน `R-000001` · รายการต้องซื้อ/ใบรับใช้ counter เดิม

## การตัดสินใจที่ใช้ (เหมือน stock-v1 ทุกข้อ)

| # | ค่าที่ใช้ |
|---|---|
| Q1 | รับเกินที่สั่ง: เตือน `รับเกินที่สั่ง {X} {หน่วย} ใส่เหตุผล` ต้องใส่ `overReason` ก่อนจึงบันทึกได้ |
| Q1b | ไม่มีใบขอซื้อ: รับได้เลย สร้างรายการต้องซื้อ `noPr: true` สถานะ `done` เบื้องหลัง |
| Q2 | ปิดงานตอนของยังไม่คืน: ปิดได้ กล่องยืนยันบอกจำนวน |
| Q3 | ปิดงาน/ปิดใบเบิก: ถาม ค่าเริ่ม = ยกเลิกรายการต้องซื้อที่ `received === 0` |
| Q4 | "ต้องอนุมัติ" ตั้งที่หมวด (`category.needsApproval`) สินค้าใหม่ในหมวดนั้น (รวมหมวดย่อย) ติ๊กเอง และหัวหน้าติ๊กเองตอนสร้างได้ |
| Q5 | เปลี่ยนหน่วย/สายม้วนของสินค้าที่มีของหรือมีประวัติ = ล็อก `เปลี่ยนหน่วยไม่ได้ เพราะมีของหรือมีประวัติแล้ว` |
| Q6 | หัวหน้าเลิกใช้สินค้าได้เมื่อยอดทุกคลัง = 0 · ซ่อนจากตัวเลือก ประวัติยังอยู่ |
| Q7 | Store แก้ ชื่อ ยี่ห้อ รุ่น บาร์โค้ด หมายเหตุ · หน่วย หมวด ต้องอนุมัติ หน่วยตอนสั่งซื้อ เกณฑ์ แก้ได้เฉพาะหัวหน้า (เดิมทุกบทบาทแก้ได้หมด) |
| Q7b | หน้า "อนุมัติ" ให้ Store เห็นเฉพาะยอดที่ต้องยืนยัน + หน้าแรกแสดง |
| Q8 | ของที่คืนเป็น "ตัดเป็นของเสีย" นับเป็นยอดใช้ของงาน |
| Q9 | คืนสายม้วนที่สั้นกว่า `scrapMin`: เตือน + ปุ่มเปลี่ยนเป็นของเสีย |
| RT-G1 | วิศวกรคืนได้เฉพาะใบที่ตัวเองเบิก (ตรวจใน domain) |
| นำเข้ายอดยกมา | ไฟล์ `.csv` ไม่เพิ่ม library |
| ชื่อคล้าย | เพิ่ม `similarity()` แบบ Dice bigram (ตัวเดียวกับ stock-v1 `js/store.js` ฟังก์ชัน `similarity`) · สินค้า ≥ 35% · งาน ≥ 45% และชื่อยาว ≥ 3 ตัวอักษร · แทน `similarByName` แบบ substring เดิม |

## Review Focus

1. ของบนชั้นรอตรวจต้องไม่ถูกนับใน `qtyOf`/`totalQty`/`stockStatus`/`kpis`/`warehouseOptions` แต่ต้องเห็นใน `qcStock` → test อยู่ใน Task 1
2. รอบตรวจนับ (`closeCount`) ของสินค้าสายม้วนและสินค้าที่มีหลายชั้น ต้องปรับยอดแล้วรวมได้เท่ากับยอดที่นับจริง และไม่มีชั้นหรือม้วนติดลบ → test อยู่ใน Task 1
3. คืน/รับหลายบรรทัดที่มี 1 บรรทัดผิด ต้องไม่ลงยอดเลย → test อยู่ใน Task 3 และ Task 10
4. ของที่กันไว้ให้ใบเบิกที่รอต้องไม่ถูกคนอื่นเบิกไป (`available = qtyOf − reserved`) และปิดใบเบิกแล้วต้องปล่อยของคืน → test อยู่ใน Task 2 และ Task 8
5. ข้อมูล `stockpro-mock-v2` เดิมใน localStorage ต้องไม่ถูกโหลดมาใช้ (shape ต่างกัน) → test อยู่ใน Task 1 (`parseSaved` ปฏิเสธ `version !== 3`)

---

### Task 1: ชั้นวาง · สายม้วน · ชั้นรอตรวจ · ประวัติ · seed v3

**Files:**
- Create: `mockup/js/domain/stock.js` · `tests/_load.js` · `tests/stock.test.js`
- Modify: `mockup/js/domain.js` (`stockKey`, `qtyOf`, `totalQty`, `postReceipt`, `postIssue`, `closeCount`, `parseSaved`, `similarByName`) · `mockup/js/seed.js` · `mockup/js/state.js` (KEY) · `mockup/index.html` · `tests/seed.test.js`, `tests/domain.test.js` (แก้ fixture `mini()`)

**Interfaces:**
- Produces:
  - `warehouse.shelves: { code, active, qc? }[]` ทุกคลังมี `ทั่วไป`, `A-01`..`A-03`, `B-01`..`B-03`, `C-01`, `QC` (`qc: true`) · `W-B` ให้ `C-01` เป็น `active: false`
  - `stockKey(productId, whId, shelf = 'ทั่วไป') → 'P|W|shelf'` · `qtyAt(state, p, wh, shelf)` · `qtyOf(state, p, wh)` = ผลรวมทุกชั้นที่ไม่ใช่ QC + ความยาวม้วนที่ไม่ใช่ QC · `totalQty` ใช้ `qtyOf`
  - `D.shelves(state, whId, { qc = false } = {}) → string[]` · `D.qcShelf(state, whId)` · `D.qcStock(state, whId?) → { productId, whId, qty, rollId? }[]`
  - product field ใหม่: `isRoll` (seed: สินค้าหน่วย `เมตร` ที่เป็นสายไฟ/สายแลน = true), `rollSize` (100 หรือ 305), `scrapMin` (สายม้วน 3, อื่น 0), `active: true`, `needsApproval: false`, `vendorCode: ''`, `note: ''`, `buyUnit`, `buyFactor: 1`, `photos: []` · category: `needsApproval: false` · `state.rolls: { id, productId, whId, shelf, length, opened, batch, fromRollId }[]` (seed: ยอดเมตรของสินค้าสายม้วนแตกเป็นม้วนตาม `rollSize`) · `state.notifs: []` · `state.audit: []` · `state.returns: []` · counters เพิ่ม `RT`, `R` · `state.settings.openingLocked = false` · job field ใหม่: `ownerId`, `site`, `start`, `due`, `closedAt`, `note` · `version: 3`
  - `D.stockIn(state, { productId, whId, shelf = 'ทั่วไป', qty, rollLengths, batch, fromRollId }) → { amount, rollIds, apply() }` แยกตรวจกับทำ (ตรวจคลังเปิด ชั้นเปิด จำนวน) · `apply()` ลงยอดจริง
  - `D.stockOut(state, { productId, whId, qty }) → { cuts: { rollId, cut, left }[], shelves: { shelf, qty }[] }` ตัดจากชั้นที่ไม่ใช่ QC ตามลำดับ `warehouse.shelves` · ม้วนเลือกม้วนที่สั้นที่สุดที่ตัดพอ ถ้าไม่มีม้วนเดียวที่พอให้ไล่จากม้วนยาวสุด · `postIssue` เรียกฟังก์ชันนี้และเก็บ `l.cuts`, `l.shelves`
  - `closeCount` ส่วนต่างบวก → ลงที่ `ทั่วไป` (สายม้วน = ม้วนใหม่ "จากการนับ") · ส่วนต่างลบ → `stockOut`
  - `D.log(state, actor, action, ref, text)` · `D.auditFor(state, ref)` · `D.notify(state, userIds, level, text, link)` · `D.unread(state, userId)` · `D.FORBIDDEN`
  - `D.similarity(a, b) → 0..1`
  - `parseSaved(raw)` คืน `null` ถ้า `version !== 3`
- [ ] **Step 1: test ที่ fail ก่อน** (`tests/stock.test.js`)

```js
test('ชั้นรอตรวจไม่นับใน qtyOf/kpis แต่เห็นใน qcStock', () => {
  const s = mini(); s.stock['P-0001|W-BN|QC'] = 9;
  assert.equal(D.qtyOf(s, 'P-0001', 'W-BN'), 1250);
  assert.deepEqual(D.qcStock(s, 'W-BN').map((x) => x.qty), [9]);
});
test('stockOut ตัดม้วนที่สั้นสุดที่พอ แล้วเก็บ cuts', () => {
  // ม้วน 100, 40, 305 · เบิก 35 → ตัดม้วน 40 เหลือ 5
});
test('closeCount สายม้วนนับขาด 20 ม. ตัดออกจากม้วน ไม่มีม้วนติดลบ', ...);          // Review Focus 2
test('closeCount สินค้า 2 ชั้นนับเกิน 5 ลงที่ ทั่วไป ยอดรวม = ที่นับ', ...);
test('parseSaved ปฏิเสธ version 2', () => {                                          // Review Focus 5
  assert.equal(D.parseSaved(JSON.stringify({ version: 2 })), null);
});
test('similarity สายไฟ THW 2.5 กับ สายไฟ THW 2.5 sq.mm สีดำ ≥ 0.35', ...);
```

- [ ] **Step 2: รันให้ fail** — Run: `node --test` (ที่ root ของ v-2) · Expected: FAIL `D.qcStock is not a function`
- [ ] **Step 3: ทำตาม Interfaces** แล้วแก้ `mini()` ใน `tests/domain.test.js` ให้ใช้ key แบบ 3 ส่วน
- [ ] **Step 4: รันทั้งชุดให้ผ่าน** · `seed.test.js` ยอดรวมต่อสินค้าต้องเท่าเดิมหลังแตกเป็นม้วน
- [ ] **Step 5: เปิด `mockup/index.html` ใน preview** หน้าแรก คลังสินค้า เบิกของ รับของ ตรวจนับ ต้องแสดงยอดเท่าเดิมและไม่มี error ใน console
- [ ] **Step 6: Commit** — `feat(domain): shelves, rolls, QC shelf, audit, notifications; storage v3`

---

### Task 2: กันของให้ใบเบิกที่รอ + จ่ายของที่กันไว้

**Files:**
- Modify: `mockup/js/domain.js` (`postIssue`, `postReceipt`) · `mockup/js/domain/stock.js` · `mockup/js/pages/issue.js` (ยอดที่แสดงใช้ `available`) · `mockup/js/app.js` (ระฆังแสดง `D.unread` ต่อจากรายการรอดำเนินการเดิม)
- Test: `tests/reserve.test.js`

**Interfaces:**
- Produces:
  - issue line เพิ่ม `waiting` (= `qty − issued` ตอนโพสต์) และ `reserved` (ค่าเริ่ม 0) · issue doc เพิ่มสถานะย่อย `fill: 'full'|'partial'|'waiting'|'ready'|'closed'|'cancelled'` (`status` คงเดิม `pending|posted|rejected`)
  - `D.available(state, p, wh) = qtyOf − ผลรวม reserved ของใบเบิกในคลังนั้น` · หน้าเบิก การ์ดคลัง และ `warehouseOptions` ใช้ `available`
  - `D.reserveForWaiting(state, productId, whId) → doc[]` ใบเก่าสุดได้ก่อน ใบที่กันครบทุกบรรทัดเป็น `fill:'ready'` และแจ้งผู้เบิก `ของที่รอสำหรับ {REQ} เข้าแล้ว ระบบกันไว้ให้แล้ว` · ถูกเรียกหลังของเข้าคลังทุกทาง (รับ คืน ยืนยันยอด นับเกิน)
  - `D.pickReserved(state, docId, actor) → doc` จ่ายของที่กันไว้ (ใช้ `stockOut`) แล้ว `issued += …`, `waiting −= …` · ถ้าจ่ายแทนคนอื่นให้แจ้งผู้เบิก
- [ ] **Step 1: test** — RC-AC5/RT-AC10 ที่ระดับ domain (ของเข้า → ใบที่รอได้ `reserved` และ notif) · ใบ B เบิกของที่ถูกกันให้ใบ A ไม่ได้ (Review Focus 4) · `pickReserved` ทำให้ `fill:'full'`
- [ ] **Step 2: fail** · **Step 3: ทำ** · **Step 4: ผ่านทั้งชุด**
- [ ] **Step 5: preview** — หน้าเบิกของแสดง "เบิกได้" ไม่รวมของที่กันไว้ · ระฆังมีแจ้งเตือน · หน้าแรกแถว "รอของเข้า" มีปุ่ม "จ่ายของ"
- [ ] **Step 6: Commit** — `feat(issue): hold incoming stock for waiting requisitions, pick held stock`

---

### Task 3: คืนของ — domain

**Files:**
- Create: `mockup/js/domain/returns.js` · Test: `tests/returns.test.js`

**Interfaces:**
- Consumes: Task 1-2
- Produces (ชื่อและกติกาเหมือน stock-v1 เพื่อให้สองฝั่งตรงกัน แต่ต่างตรงที่รับ `actor` แทน userId และ throw `DomainError`):
  - `D.returnable(state, actor, q = '') → { doc, by, lines: { productId, issued, returned, left, cuts }[] }[]` (วิศวกรเห็นเฉพาะใบตัวเอง · เรียงใหม่สุดก่อน · ค้นจากชื่องาน REQ ชื่อ/ยี่ห้อ/รุ่น)
  - `D.returnItems(state, { docId, whId, shelf, note, lines: { productId, qty, condition: 'ok'|'damaged'|'scrap', rollId?, shelf?, photo? }[] }, actor) → ReturnRec` (`{ id: 'RT-…', docId, whId, by, at, note, lines: { productId, qty, condition, shelf, newRollId, fromRollId, photo }[] }`) · issue line เพิ่ม `returned`, `scrapped`
  - `D.returnLoose(state, { productId, whId, shelf, qty, condition, reason, jobId? }, actor)` (Store/หัวหน้า · ต้องมี reason)
  - `D.reverseReturn(state, returnId, actor)` (หัวหน้า · ปฏิเสธ `ของจากการคืนนี้ถูกใช้ไปแล้ว กลับรายการไม่ได้`)
  - `D.qcDecide(state, { whId, productId, rollId?, qty, decision: 'restock'|'scrap', shelf?, reason? }, actor)`
  - `D.jobUsage(state, jobId) → { productId, issued, returned, scrapped, used }[]` (`used = issued − (returned − scrapped)`)
  - `D.returnHint(state, productId, qty) → { short, scrapMin }`
- กติกาเหมือนสเปก 2.5 ทุกข้อ (ตรวจครบก่อนลง · ok→ชั้นที่เลือก/ต่อบรรทัด · damaged→QC · scrap→ไม่เพิ่ม · ม้วนใหม่อ้างม้วนเดิม · rollId ต้องอยู่ใน cuts · คลังปิด/ล็อก = ปฏิเสธ · เรียก reserveForWaiting · log)
- [ ] **Step 1: test 1 ข้อต่อ AC** — `RT-AC1..AC10` · หลายบรรทัด 1 บรรทัดผิด = ไม่ลงยอดเลย (Review Focus 3) · `RT-G1` วิศวกรคืนใบคนอื่น · `RT-G2` · `RT-G4` · `RT-G6` · `RT-G7` รวมกรณีม้วนใหม่ถูกตัดไปแล้ว · `Q8` · `Q9`
- [ ] **Step 2: fail** · **Step 3: ทำ** · **Step 4: ผ่านทั้งชุด**
- [ ] **Step 5: Commit** — `feat(returns): returns domain with condition, QC, roll lineage, reverse`

---

### Task 4: สแกน (component กลาง)

**Files:**
- Create: `mockup/js/domain/scan.js` · `mockup/js/components/scan-dialog.js` · Test: `tests/scan.test.js`

**Interfaces:**
- Produces:
  - `D.parseScan(state, code) → { kind: 'req'|'roll'|'product'|'job', id } | null` รับ `REQ-…`, `R-…`, สินค้า (`code` หรือ `id`), `J-…`, `vendorCode` ของสินค้าที่ active (ไม่สนตัวพิมพ์/ช่องว่าง)
  - `window.ScanButton` (`<scan-button :kinds="[...]" @found="...">`) เป็น `p-button` ไอคอน `pi-qrcode` + คำ "สแกน" ที่เปิด `p-dialog` ซึ่งมีช่องพิมพ์รหัสเสมอ และมีกล้องเมื่อ `'BarcodeDetector' in window` · ไม่พบ = `ไม่พบ{ใบเบิก/ม้วน/สินค้า/งาน}จากรหัสนี้` · ปิด dialog ต้องหยุดกล้อง
- [ ] **Step 1-4: test → fail → ทำ → ผ่าน** (5 แบบรหัส · สินค้าเลิกใช้ = null)
- [ ] **Step 5: preview** — ลองเปิด dialog ในหน้าใดก็ได้ พิมพ์ REQ ที่มีอยู่แล้วได้ event และไม่มี error ใน console
- [ ] **Step 6: Commit** — `feat(scan): scan parser and scan dialog`

---

### Task 5: หน้าคืนของ (ตาราง + แผงขวา)

**Files:**
- Create: `mockup/js/pages/returns.js` (`Pages.returns`)
- Modify: `mockup/js/app.js` (NAV เพิ่ม `{ name: 'returns', label: 'คืนของ', icon: 'pi-replay' }` ต่อจาก "เบิกของ") · `mockup/js/pages/home.js` (ปุ่ม "คืนของ" ในแถวใบเบิกที่ไปที่ `go('returns', { doc })`) · `mockup/css/app.css`

**Interfaces:**
- Consumes: Task 3-4
- หน้าจอ (ข้อความตามตาราง 2.6 ตามตัว):
  - **แท็บ** "คืนของ" · "ชั้นรอตรวจ (N)" (Store/หัวหน้า) · "คืนล่าสุด"
  - **ตารางซ้าย** (`p-datatable` แบ่งหน้า 20): 1 แถวต่อบรรทัดสินค้าของใบเบิกที่ยังคืนได้ คอลัมน์: รูป · สินค้า · ใบเบิก/งาน/วันที่ · เบิกโดย (Store/หัวหน้า) · จ่ายไป · คืนแล้ว · คืนได้อีก · **จำนวนคืน** (`p-inputnumber` ในแถว) · **สภาพ** (`p-select` 3 ค่า) · ตัวกรอง: ช่องค้นหา, `scan-button kinds=['req','roll']`, ตัวเลือกใบเบิก (เลือกแล้วกรองเหลือใบเดียว) · ปุ่ม "คืนทั้งหมดของใบนี้" เมื่อกรองเหลือใบเดียว · `?doc=` จะกรองให้ครั้งเดียว **เฉพาะเมื่อใบนั้นอยู่ใน `returnable` ของผู้ใช้คนปัจจุบัน** · จำกัด 1 ใบเบิกต่อการคืน 1 ครั้ง: ใส่จำนวนในแถวของใบอื่นแล้วจะได้ toast warn "คืนได้ทีละใบเบิก"
  - **แผงขวา "ใบคืน"** เรียงส่วน: ของ (สรุปรายการที่ใส่จำนวน · ผิดแสดงแดงต่อแถว) → ม้วน (`ตัดมาจากม้วน` ต่อแถวสายม้วน + คำเตือน Q9 พร้อมปุ่ม "เปลี่ยนเป็นของเสีย") → ที่ไหน (`p-select` คลังที่เปิดใช้ ค่าเริ่ม = คลังของใบ · ชั้น ค่าเริ่ม `ทั่วไป` · "แยกชั้นรายการ" เปิดคอลัมน์ชั้นในตาราง · ข้อความชั้นรอตรวจ) → รูปของที่เสียหาย (1 รูปต่อแถว `p-fileupload` แบบ basic ย่อเหลือ 320px) → หมายเหตุ → บรรทัด "จะคืน N รายการ" / "ยังขาด: …" → ปุ่ม "บันทึกคืนของ"
  - **ผลลัพธ์**: `p-dialog` "บันทึกคืนของแล้ว" (รายการ · สภาพ · ชั้น · ม้วนใหม่ · ปุ่มพิมพ์ป้ายเลขม้วน)
  - **ปุ่ม "คืนของที่ไม่มีใบเบิก"** (Store/หัวหน้า) เปิด `p-dialog` ฟอร์ม `returnLoose`
  - **แท็บชั้นรอตรวจ**: ตาราง (รูป · สินค้า · คลัง · จำนวน/เลขม้วน · มาจาก RT) ปุ่ม "คืนเข้าชั้น" / "ตัดทิ้ง" (ต้องมีเหตุผล)
  - **แท็บคืนล่าสุด**: ตาราง RT ล่าสุด หัวหน้ามีปุ่ม "กลับรายการ" (มี `confirm` ก่อน)
- [ ] **Step 1: ทำ**
- [ ] **Step 2: preview ที่ 1280px และ 390px สว่าง/มืด** — RT-AC5 (คืนทั้งหมด → บันทึก) ไม่เกิน 3 แตะเมื่อมาจากปุ่ม "คืนของ" ในหน้าแรก · ทุกสถานะในตาราง 2.6 · 390px แผงติดล่างไม่บังแถวสุดท้ายของตาราง
- [ ] **Step 3: Review Focus ของ `?doc=`** — สลับบทบาทแล้วต้องไม่กรองใบของคนอื่นให้วิศวกร
- [ ] **Step 4: test ผ่าน แล้ว commit** — `feat(ui): returns page with QC tab`

---

### Task 6: สินค้า — domain

**Files:**
- Create: `mockup/js/domain/products.js` (เขียน `addProduct`/`updateProduct` ใหม่ที่นี่และแทนของเดิมใน `domain.js`) · Test: `tests/products.test.js`

**Interfaces:**
- Produces:
  - `D.findSimilar(state, name) → { product, pct, exact }[]` ใช้ `similarity` ≥ 35% สูงสุด 5 รายการ (ไม่รวมสินค้าที่เลิกใช้)
  - `D.addProduct(state, input, actor)` input เพิ่ม `isRoll, rollSize, scrapMin, vendorCode, note, buyUnit, buyFactor, needsApproval, photos, initial: { whId, shelf, qty|rollLengths }` · `isRoll` → unit ต้องเป็น `เมตร` · `vendorCode` ซ้ำ throw `บาร์โค้ดนี้เป็นของ {รหัส} {ชื่อ}` · `needsApproval` = หมวด (หรือหมวดแม่) ตั้งไว้ หรือหัวหน้าส่งมา · รูป: วิศวกร 1 · Store/หัวหน้า 3 · `initial` ส่งต่อให้ `D.submitOpening` (Task 12) **แทน** `receive` เดิม
  - `D.hasHistory(state, productId)` · `D.updateProduct(state, id, patch, actor)` สิทธิ์ตาม Q7 · validation ชื่อว่าง/ซ้ำ/บาร์โค้ดซ้ำ · ล็อกหน่วย/isRoll ตาม Q5 · log diff
  - `D.setProductActive(state, id, active, actor)` (Q6) · `D.updateCategory` รับ `needsApproval` ได้เฉพาะหัวหน้า และติ๊กสินค้าในหมวด (รวมหมวดย่อย) ตาม
  - `D.addPhoto(state, id, dataUrl, actor)` / `D.removePhoto(state, id, index, actor)` ตามกติกา 3.5
  - `searchProducts`/`tabCounts`/`kpis` ไม่รวมสินค้าที่ `active === false` ยกเว้นส่ง `q.includeInactive`
- [ ] **Step 1: test 1 ข้อต่อ AC** — `PD-AC1..AC10` · `Q4` (หมวดแม่ติ๊ก หมวดย่อยได้ตาม) · `Q6` · `Q7` · `PD-G4`
- [ ] **Step 2: fail** · **Step 3: ทำ** · **Step 4: ผ่านทั้งชุด**
- [ ] **Step 5: Commit** — `feat(products): permissions, unit lock, deactivate, approval by category, photos`

---

### Task 7: หน้าคลังสินค้า + กล่องสินค้า

**Files:**
- Modify: `mockup/js/components/product-dialog.js` · `mockup/js/pages/products.js`

**Interfaces:**
- Consumes: Task 4, 6
- หน้าจอ:
  - **ตารางสินค้า**: เพิ่มตัวกรองชิป "ยังไม่มีรูป (N)" · "ต้องอนุมัติ" · "เลิกใช้แล้ว" (หัวหน้า) · `scan-button kinds=['product']` ข้างช่องค้นหา · คอลัมน์ป้าย "ต้องอนุมัติ" และ "เลิกใช้" (จุด + คำ) · ปุ่มแก้แสดงตามสิทธิ์
  - **กล่องสร้าง/แก้** (`p-dialog` กว้าง 640px ที่ 390px เต็มจอ): ลำดับช่องตามตาราง 3.3 · ส่วน "ข้อมูลเพิ่มเติม (ไม่บังคับ)" พับไว้ · สวิตช์สายม้วน (+ ขนาดม้วน, เกณฑ์เศษ) · บาร์โค้ด + สแกน · หัวหน้าเห็นสวิตช์ต้องอนุมัติ · "ยังขาด: …" · กล่องแดง/เหลือง (รูป ชื่อ รหัส %) + "ใช้รายการนี้" เมื่อเปิดจากหน้าเบิก · โหมดแก้: field ที่ล็อกแสดงเป็น disabled พร้อม `small` บอกเหตุผล · ปุ่ม "เลิกใช้สินค้า" (`confirm`) · "ลงยอดที่เจอเพิ่ม" (Task 13) · แท็บ "ประวัติ" (`D.auditFor`) · รูป 3 ช่องตามสิทธิ์
  - **แท็บหมวดหมู่**: คอลัมน์สวิตช์ "ต้องอนุมัติ" (หัวหน้า)
- [ ] **Step 1: ทำ** · **Step 2: preview 1280/390 สว่าง/มืด** — ทุกสถานะตาราง 3.6 · ลำดับสร้างจากหน้าเบิกไม่เกิน 5 แตะ · สลับ 3 บทบาทแล้วสิทธิ์ตรงกับ Q7 · README ขั้น 1-2 ของสคริปต์เดโมยังเดินได้
- [ ] **Step 3: test ผ่าน แล้ว commit** — `feat(ui): product filters, edit permissions, photos, history`

---

### Task 8: งาน — domain

**Files:**
- Create: `mockup/js/domain/jobs.js` (แทน `addJob`/`similarJobs` เดิม) · Test: `tests/jobs.test.js`

**Interfaces:**
- Consumes: `D.jobUsage` (Task 3), Task 2
- Produces (ชื่อเหมือน stock-v1):
  - `D.similarJobs(state, name) → { job, pct }[]` (≥ 45% และ ≥ 3 ตัวอักษร รวมงานที่ปิดแล้ว)
  - `D.addJob(state, { name, customer, site, ownerId, start, due, note }, actor)` · รหัส `J-{YY}-{NNN}` (YY ค.ศ. 2 หลัก รันต่อปี แทน counter `J` เดิม) · ชื่อซ้ำตรงตัว throw `มีงานชื่อนี้แล้ว: {รหัส}` · `due < start` throw `กำหนดเสร็จต้องไม่ก่อนวันเริ่ม`
  - `D.updateJob` · `D.openDocsOf(state, jobId)` (issue doc ที่ `status:'pending'` หรือ `fill ∈ partial|waiting|ready`) · `D.closeJobCheck(state, jobId) → { openDocs, unreturned, openPRs }` · `D.closeJob(state, jobId, actor, { cancelPRs = true })` · `D.reopenJob` · `D.cloneJob`
  - `D.closeIssue(state, docId, actor, { cancelPRs = true })` (`fill:'closed'` ปล่อย reserved, `waiting = 0`) · `D.cancelIssue(state, docId, actor, { cancelPRs = true })` (ยังไม่จ่ายเลย หรือ `status:'pending'` → `fill:'cancelled'`)
  - `issue()` ข้อความงานปิด: `งาน {J-…} ปิดไปแล้ว เบิกเพิ่มไม่ได้ (เปิดงานอีกครั้งที่หน้างาน / โครงการ)`
- [ ] **Step 1: test 1 ข้อต่อ AC** — `JB-AC1..AC9` · `JB-G5` · `closeIssue` ปล่อยของที่กันไว้แล้ว `available` เพิ่ม (Review Focus 4)
- [ ] **Step 2: fail** · **Step 3: ทำ** · **Step 4: ผ่านทั้งชุด**
- [ ] **Step 5: Commit** — `feat(jobs): close checks, reopen, clone, close/cancel requisition`

---

### Task 9: หน้าโครงการ / งาน

**Files:**
- Create: `mockup/js/pages/jobs.js` (`Pages.jobs` แทนหน้า placeholder)
- Modify: `mockup/js/app.js` (เพิ่ม "โครงการ / งาน" ใน NAV หลักด้วย = JB-AC10 และเก็บลิงก์ในตั้งค่าไว้) · `mockup/js/pages/issue.js` (dialog เพิ่มงานใช้ `similarJobs`/ชื่อซ้ำแบบใหม่) · `mockup/js/pages/home.js` (รหัสงานเป็นลิงก์ `go('jobs', { id })`)

**Interfaces:**
- Consumes: Task 4, 8
- หน้าจอ:
  - **ตาราง**: แท็บ "เปิดอยู่ / ปิดแล้ว / ทั้งหมด" · ค้นหา · สแกน · คอลัมน์ รหัส · ชื่องาน · ลูกค้า · ไซต์ · ผู้รับผิดชอบ · ใบเบิก "N (M ค้าง)" (ส้ม + คำ) · กำหนดเสร็จ · สถานะ · ปุ่ม "+ เพิ่มงาน" เปิด dialog กล่องเต็มตามตาราง 4.3 (แสดงรหัสที่จะได้ · คล้าย/ซ้ำ)
  - **แผงขวา** (เลือกแถว, ที่ 390px เป็น `p-drawer` ด้านล่าง): หัว (รหัส ชื่อ สถานะ วันปิด) · ตารางยอดใช้ เบิก/คืน/ใช้จริง · ใบเบิกของงาน + ปุ่ม ปิดใบเบิก/ยกเลิก · ปุ่ม "ส่งออก Excel" (CSV + BOM) · "ปิดงาน" · "เปิดงานอีกครั้ง" · "เปิดงานใหม่จากงานนี้" · "แก้ไข" · ประวัติ
  - **Dialog ยืนยันปิดงาน**: ของที่ยังไม่คืน (ตาราง) · checkbox ยกเลิกรายการต้องซื้อ (ติ๊กไว้เป็นค่าเริ่ม) · ใบเบิกค้าง = ปุ่มยืนยันกดไม่ได้ + ข้อความแดงพร้อมลิงก์
  - ข้อความทุกสถานะในตาราง 4.6
- [ ] **Step 1: ทำ** · **Step 2: preview 1280/390 สว่าง/มืด** — JB-AC4/5/7/8/10 บนหน้าจอ · CSV เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน
- [ ] **Step 3: test ผ่าน แล้ว commit** — `feat(ui): jobs page with usage, close confirmation`

---

### Task 10: รับของเข้า — domain

**Files:**
- Modify: `mockup/js/domain.js` (`receive`, `postReceipt`, `confirmReceipt`) — ย้ายมาไว้ที่ `mockup/js/domain/receiving.js` · Test: `tests/receiving.test.js` · แก้ test เดิมของ receive

**Interfaces:**
- Consumes: `D.stockIn`, `D.reserveForWaiting`
- Produces:
  - `D.receive(state, { whId, shelf = 'ทั่วไป', invoiceNo, vendor, receivedAt, note, overReason, lines: { productId, prId?, qty?, unit?: 'base'|'buy', rollLengths?, batch?, shelf?, condition?: 'ok'|'damaged'|'reject' }[] }, actor) → doc` (doc `type:'receive'` เดิม + field ใหม่ · บรรทัดเก็บ `qty` เป็นหน่วยหลักและ `rollIds`)
  - กติกา: ตรวจครบก่อน · `buy` × `buyFactor` · จำนวนเต็ม · แถวม้วน 0 ข้าม · ทั้งใบเป็น 0 throw `ยังไม่ได้กรอกจำนวนที่รับ` · รับเกินค้างรับโดยไม่มี `overReason` throw ข้อความ Q1 · ไม่มี `prId` → PR `noPr:true` · PR ต้องตรงคลังและสินค้า · สินค้าเลิกใช้ throw · `damaged` → QC · `reject` ไม่ลงยอด · ชั้นต่อบรรทัด · วิศวกร → `status:'pending'` (กติกาเดิม) แล้ว Store ยืนยันด้วย `confirmReceipt` เดิม (ตรวจรับเกินซ้ำตอนยืนยัน) · ลงยอดแล้วเรียก `reserveForWaiting` · log
  - `D.outstanding(pr) → qty − received`
- [ ] **Step 1: test 1 ข้อต่อ AC** — `RC-AC1..AC9` · `RC-G2/G5/G8` · หลายบรรทัด 1 บรรทัดผิด = ไม่ลงยอดเลย (Review Focus 3)
- [ ] **Step 2: fail** · **Step 3: ทำ** · **Step 4: ผ่านทั้งชุด**
- [ ] **Step 5: Commit** — `feat(receive): over-receive reason, no-PR, rolls, damaged/reject, per-line shelf`

---

### Task 11: หน้ารับของเข้า

**Files:**
- Modify: `mockup/js/pages/receive.js` · `mockup/css/app.css`

**Interfaces:**
- Consumes: Task 4, 7, 10
- หน้าจอ:
  - **ตารางซ้าย** "ของที่รอรับ": รายการต้องซื้อที่ยังไม่รับครบ (รูป · สินค้า · PR · คลัง · สั่ง · รับแล้ว · ค้างรับ · ใบเบิกที่รอ) · ปุ่ม "ใส่ในใบรับ" ต่อแถว และ checkbox เลือกหลายแถว · ค้นหาสินค้าเพื่อเพิ่มบรรทัดแบบไม่มีใบขอซื้อ + "สินค้าไม่มีรหัส" (กล่องสร้าง) · `scan-button kinds=['product']` · ลบปุ่มเดโมเดิม
  - **แผงขวา "ใบรับ"** เรียงส่วน: ของ (บรรทัด) → จำนวน (ต่อบรรทัด: `p-inputnumber` ค่าเริ่ม = ค้างรับ · `p-selectbutton` หน่วยหลัก/หน่วยตอนสั่งซื้อ + "= X" · สายม้วน: แถวม้วนแก้/ลบ/เพิ่ม + "ล็อตผู้ผลิต" · สภาพ "ครบดี / ชำรุด / ส่งคืนผู้ขาย") → ที่ไหน (คลังที่เปิดใช้ + ชั้น ค่าเริ่ม `ทั่วไป` · "แยกชั้นรายการ") → ข้อมูลใบส่งของ (เลขใบส่งของ/ใบกำกับ · ผู้ขาย · วันที่รับ · หมายเหตุ) → คำเตือนรับไม่ครบ / รับเกิน + ช่องเหตุผล → "ยังขาด: …" → ปุ่ม "ยืนยันรับของเข้า" (วิศวกร: "ส่งให้ Store ยืนยัน")
  - **ผลลัพธ์** `p-dialog`: เลขใบรับ · ม้วนที่สร้าง · ใบเบิกที่ได้ของ · ปุ่มพิมพ์ป้าย · ข้อความที่ไม่มีศัพท์ ledger/จอง
  - แท็บเดิม "รอยืนยันยอด" แสดงรายการ CC (Task 12) รวมกับใบรับที่วิศวกรส่ง
  - เส้นทางของครบตามใบจากหน้าแรก/ขอซื้อ = 2 แตะ (ใส่ในใบรับ → ยืนยัน)
- [ ] **Step 1: ทำ** · **Step 2: preview 1280/390 สว่าง/มืด** — ทุกสถานะตาราง 5A.6 · README ขั้น 4 ยังเดินได้ · ไม่มีคำต้องห้ามในส่วนหลัก
- [ ] **Step 3: test ผ่าน แล้ว commit** — `feat(ui): receive page reorder, rolls, over-receive, delivery info`

---

### Task 12: ยอดตั้งต้น — domain

**Files:**
- Create: `mockup/js/domain/opening.js` · Test: `tests/opening.test.js`

**Interfaces:**
- Consumes: `D.stockIn`, `D.reserveForWaiting`, `D.notify`
- Produces (ชื่อเหมือน stock-v1):
  - `state.ccs: { id: 'CC-0001', productId, whId, shelf, qty|rollLengths, by, stage: 'store'|'head'|'done'|'rejected', reason, kind: 'opening'|'found' }[]`
  - `D.submitOpening(state, { productId, whId, shelf, qty|rollLengths, kind }, actor) → { cc, message }` ตามตาราง 5B.5 (Store/หัวหน้า ไม่ต้องอนุมัติ = ทันที · Store + ต้องอนุมัติ = `head` · หัวหน้า = ทันที · วิศวกร = `store`) · message 3 แบบตามตาราง 5B.6
  - `D.confirmOpening(state, ccId, actor, ok, reason)` (stage store: Store/หัวหน้า · stage head: หัวหน้า · ไม่ ok ต้องมีเหตุผล แจ้งผู้ส่ง)
  - `D.approvalItems(state, actor) → { issues, receipts, ccs }` (หัวหน้าทั้งหมด · Store = ใบรับที่วิศวกรส่ง + CC stage store · วิศวกร = ว่าง)
  - `D.pendingOpening(state, productId, whId) → number` (การ์ดคลังในหน้าเบิกแสดง "รอยืนยัน X")
  - `D.parseOpeningCsv(state, text)` · `D.importOpening(state, rows, actor)` · `D.setOpeningLock(state, on, actor)` (ข้อความและกติกาเหมือน stock-v1 Task 12)
- [ ] **Step 1: test 1 ข้อต่อ AC** — `OS-AC1..AC9` · `OS-G2/G3/G4` · CSV แถวผิด 3 แบบ
- [ ] **Step 2: fail** · **Step 3: ทำ** · **Step 4: ผ่านทั้งชุด**
- [ ] **Step 5: Commit** — `feat(opening): approval stages, found stock, CSV import`

---

### Task 13: หน้าอนุมัติของ Store · ยอดตั้งต้น · นำเข้า

**Files:**
- Modify: `mockup/js/pages/approvals.js` (ใช้ `D.approvalItems` · ลบแบนเนอร์ "เฉพาะหัวหน้าอนุมัติได้" สำหรับ Store · แท็บ "ใบเบิก" (หัวหน้า) / "ยืนยันยอด" (Store/หัวหน้า)) · `mockup/js/pages/home.js` (การ์ด "มียอดรอคุณยืนยัน N" สำหรับ Store → `go('approvals', { tab: 'cc' })`) · `mockup/js/app.js` (ระฆังลิงก์ไปแท็บเดียวกัน · ตั้งค่าเพิ่มเมนู "ยอดยกมา" ให้หัวหน้า) · `mockup/js/components/product-dialog.js` (ส่วนยอดตั้งต้นเรียง จำนวน → คลัง → ชั้น · ข้อความบอกล่วงหน้า 3 แบบ = OS-G5)
- Create: `mockup/js/pages/opening.js` (`Pages.opening`: `p-fileupload` .csv · ตารางผลตรวจต่อแถว · "ตัดแถวที่ผิด (N)" · "นำเข้ายอดยกมา" · สวิตช์ล็อก · ลิงก์ไฟล์ตัวอย่าง) · dialog "ลงยอดที่เจอเพิ่ม" ในกล่องแก้สินค้า
- [ ] **Step 1: ทำ** · **Step 2: preview 1280/390 สว่าง/มืด** — OS-AC9: Store แตะแจ้งเตือนแล้วกดยืนยันได้ใน ≤ 2 แตะ โดยไม่เห็นใบเบิกรออนุมัติ · OS-AC8 นำเข้า CSV ที่มีแถวผิด
- [ ] **Step 3: test ผ่าน แล้ว commit** — `feat(ui): store confirmations, opening order, CSV import page`

---

### Task 14: ประวัติ · README · ตรวจรวม

**Files:**
- Create: `mockup/js/pages/history.js` (`Pages.history` หัวหน้า: ตาราง `state.audit` กรองผู้ใช้/การกระทำ/ช่วงวันที่ · เมนูในตั้งค่า)
- Modify: `mockup/README.md` (ตารางบทบาทแบบใหม่ตาม Q7 · สคริปต์เดโมเพิ่มขั้นคืนของ/ชั้นรอตรวจ/ปิดงาน/รับเกิน/ยอดตั้งต้นที่ Store ยืนยัน · "ต่างจาก PDF" ลบข้อ "ไม่ทำ: ติดตามม้วน, QR/บาร์โค้ด, แท็บคืนของ" และใส่การตัดสินใจ Q1-Q9, CSV)
- [ ] **Step 1: ทำ** · **Step 2: `node --test`** · Expected: PASS ทั้งหมด
- [ ] **Step 3: ตรวจรวมใน preview** — เดินสคริปต์เดโมทุกขั้นใน 3 บทบาท ที่ 1280px และ 390px ทั้งสว่างและมืด · ไม่มี error ใน console · ใช้ ux-ui-audit probe วัด tap target ≥ 44px และ contrast ของหน้าใหม่/หน้าที่แก้
- [ ] **Step 4: Commit** — `docs: demo for core screens; feat(ui): audit history`
