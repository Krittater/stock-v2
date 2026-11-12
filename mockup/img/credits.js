// เครดิตรูปสินค้าตัวอย่าง (Task 9) — key = path ใต้ mockup/ · dialog "เครดิตรูปภาพ" ใน app.js อ่านจากที่นี่
// รูปถ่าย (photo) จาก Wikimedia Commons ผ่าน scripts/fetch-commons.js — ย่อเหลือกว้าง 320px, ไฟล์ PNG แปลงเป็น JPG พื้นขาว
// หมวดที่ใช้รูปถ่าย: สายแลน, เซอร์กิตเบรกเกอร์, ตู้ควบคุมไฟฟ้า, สวิตช์ไฟ, หลอดไฟ LED, สกรูและน็อต, หมวกนิรภัย, ถุงมือนิรภัย
//   (หมวดแม่ สายสื่อสาร/อุปกรณ์ไฟฟ้า/น็อตและอุปกรณ์/ความปลอดภัย ใช้รูปเดียวกับหมวดย่อย)
// หมวดที่ใช้รูปวาด (draw): สายไฟ THW/VAF/VCT, สายโคแอกเชียล, สายลำโพง, ท่อ EMT, ท่อ PVC, รางเดินสาย, คอนแทคเตอร์และรีเลย์,
//   กล่องพักสาย, ตู้คอนซูเมอร์ยูนิต, เต้ารับ, หน้ากากสวิตช์, โคมดาวน์ไลท์, โคมฟลัดไลท์, เทปพันสายไฟ, เคเบิ้ลไทร์,
//   ซิลิโคนและกาว, แคลมป์และรัดท่อ, พุกและเหล็กแขวน, ป้ายเตือน — ไม่มีรูปฟรีที่ผ่านเกณฑ์ (ของชิ้นเดียว พื้นเรียบ ไม่มีคน/โลโก้)
(function (root) {
  const commons = (file) => 'https://commons.wikimedia.org/wiki/File:' + file.replace(/ /g, '_');
  const photo = (file, author, license) => ({ title: file, author, license, source: commons(file), kind: 'photo' });
  const draw = (title) => ({ title, author: 'วาดเอง (StockPro mockup)', license: 'ใช้ภายในโปรเจกต์', source: '', kind: 'draw' });

  const ImageCredits = {
    'img/photo/lan.jpg': photo('RJ45.jpg', 'Devcore', 'CC0'),
    'img/photo/mcb.jpg': photo('Circuit Breaker 3.png', 'MebaMCB China', 'CC0'),
    'img/photo/cabinet.jpg': photo('Meba Double Doors.png', 'MebaMCB China', 'CC0'),
    'img/photo/switch.jpg': photo('Rocker light switch.jpg', 'DemonDays64', 'CC BY-SA 4.0'),
    'img/photo/led-bulb.jpg': photo('LED bulb 800 Lm Soft white 2024.agr.jpg', 'ArnoldReinhold', 'CC BY 4.0'),
    'img/photo/screw.jpg': photo('Black wood screw with flat Phillips head.jpg', 'Mynameisnatmo', 'CC BY-SA 4.0'),
    'img/photo/hard-hat.jpg': photo('Hard hat 20111111.jpg', 'Batholith', 'Public domain'),
    'img/photo/gloves.jpg': photo('Cryo protecting gloves.jpg', 'Lilly_M', 'CC BY-SA 3.0'),

    'img/draw/wire-thw.svg': draw('ม้วนสายไฟ THW'),
    'img/draw/wire-vaf.svg': draw('สายไฟ VAF แบนคู่'),
    'img/draw/wire-vct.svg': draw('สายไฟ VCT หลายแกน'),
    'img/draw/coax.svg': draw('สายโคแอกเชียล'),
    'img/draw/speaker-wire.svg': draw('สายลำโพง'),
    'img/draw/emt-pipe.svg': draw('ท่อ EMT'),
    'img/draw/pvc-pipe.svg': draw('ท่อ PVC'),
    'img/draw/cable-tray.svg': draw('รางเดินสาย'),
    'img/draw/contactor.svg': draw('คอนแทคเตอร์'),
    'img/draw/junction-box.svg': draw('กล่องพักสาย'),
    'img/draw/consumer-unit.svg': draw('ตู้คอนซูเมอร์ยูนิต'),
    'img/draw/outlet.svg': draw('เต้ารับคู่'),
    'img/draw/switch-plate.svg': draw('หน้ากากสวิตช์'),
    'img/draw/downlight.svg': draw('โคมดาวน์ไลท์'),
    'img/draw/floodlight.svg': draw('โคมฟลัดไลท์'),
    'img/draw/tape.svg': draw('เทปพันสายไฟ'),
    'img/draw/cable-tie.svg': draw('เคเบิ้ลไทร์'),
    'img/draw/silicone.svg': draw('หลอดซิลิโคน'),
    'img/draw/pipe-clamp.svg': draw('แคลมป์ก้ามปู'),
    'img/draw/anchor.svg': draw('พุกเหล็ก'),
    'img/draw/warning-sign.svg': draw('ป้ายเตือนไฟฟ้า'),
  };

  root.ImageCredits = ImageCredits;
  if (typeof module !== 'undefined') module.exports = ImageCredits;
})(typeof window !== 'undefined' ? window : globalThis);
