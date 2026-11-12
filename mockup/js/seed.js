(function (root) {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pad = (n, w) => String(n).padStart(w, '0');
  const BASE = Date.UTC(2026, 10, 1); // วันที่คงที่ 2026-11-01 (ห้ามใช้ Date.now)
  const iso = (daysAgo, hour = 9) => new Date(BASE - daysAgo * 864e5 + hour * 36e5).toISOString();

  const WIRE = ['Thai Yazaki', 'Phelps Dodge', 'Bangkok Cable', 'Thai Union', 'Charoong Thai'];
  const COLORS4 = ['สีขาว', 'สีดำ', 'สีเทา', 'สีครีม'];
  const LIGHT = ['แสงขาว', 'แสงวอร์ม', 'แสงเดย์ไลท์'];
  const LAMP = ['Philips', 'Osram', 'Lamptan', 'Bec', 'Toshiba'];
  const SAFE = ['3M', 'Honeywell', 'Steelpro', 'MSA', 'Safety+'];
  const FIX = ['TPC', 'Hilti', 'Fischer', 'Tiger', 'Yamato'];
  const PIPE = ['Kosun', 'Wing Tai', 'Thai Pipe', 'Eagle', 'Tiger'];
  const SW = ['Panasonic', 'Bticino', 'Schneider', 'Haco', 'Philips'];
  const CB = ['Schneider', 'ABB', 'Siemens', 'Mitsubishi', 'Chint'];
  const sq = (a) => a.map((x) => x + ' sq.mm');
  const inch = ['1/2 นิ้ว', '3/4 นิ้ว', '1 นิ้ว', '1 1/4 นิ้ว', '1 1/2 นิ้ว', '2 นิ้ว', '3 นิ้ว'];

  const TOPS = [
    ['สายไฟ', 'pi-bolt', '#fef3c7'], ['สายสื่อสาร', 'pi-wifi', '#dbeafe'], ['ท่อและราง', 'pi-minus', '#e0e7ff'],
    ['อุปกรณ์ไฟฟ้า', 'pi-server', '#fce7f3'], ['กล่องและตู้', 'pi-box', '#ffedd5'], ['สวิตช์และเต้ารับ', 'pi-th-large', '#dcfce7'],
    ['โคมไฟ', 'pi-lightbulb', '#fef9c3'], ['วัสดุสิ้นเปลือง', 'pi-circle', '#f3e8ff'], ['น็อตและอุปกรณ์', 'pi-cog', '#e7e5e4'],
    ['ความปลอดภัย', 'pi-shield', '#fee2e2'],
  ];
  // [หมวดแม่, หมวดย่อย, abbr, คำนำชื่อ, หน่วย, prefix รุ่น, ขนาด[], สี/แบบ[], ยี่ห้อ[]]
  const SUBS = [
    ['สายไฟ', 'สายไฟ THW', 'WTH', 'สายไฟ THW', 'เมตร', 'THW 1x', sq(['1.5', '2.5', '4', '6', '10', '16', '25', '35', '50', '70']),
      ['สีดำ', 'สีแดง', 'สีน้ำเงิน', 'สีเหลือง', 'สีเขียว', 'สีขาว', 'สีเขียว-เหลือง'], WIRE],
    ['สายไฟ', 'สายไฟ VAF', 'WVA', 'สายไฟ VAF', 'เมตร', 'VAF ', sq(['2x1.5', '2x2.5', '2x4', '3x1.5', '3x2.5', '3x4', '2x6', '3x6']),
      ['สีขาว', 'สีเทา', 'สีดำ'], WIRE],
    ['สายไฟ', 'สายไฟ VCT', 'WVC', 'สายไฟ VCT', 'เมตร', 'VCT ', sq(['2x1.5', '2x2.5', '3x1.5', '3x2.5', '4x1.5', '4x2.5', '3x4', '4x4', '4x6', '5x2.5']),
      ['สีดำ', 'สีเทา'], WIRE],
    ['สายสื่อสาร', 'สายแลน', 'LAN', 'สายแลน', 'เมตร', '', ['CAT5e UTP', 'CAT6 UTP', 'CAT6A UTP', 'CAT6 FTP', 'CAT6 Outdoor'],
      ['สีฟ้า', 'สีเทา', 'สีขาว', 'สีดำ'], ['Link', 'Amphenol', 'Belden', 'D-Link', 'Cisco']],
    ['สายสื่อสาร', 'สายโคแอกเชียล', 'COX', 'สายโคแอกเชียล', 'เมตร', '', ['RG6', 'RG59', 'RG11', 'RG6 Dual', 'RG6 Quad', 'RG59 + ไฟ'],
      ['สีขาว', 'สีดำ', 'สีเทา'], ['Link', 'Amphenol', 'Belden', 'Thai Union', 'Commscope']],
    ['สายสื่อสาร', 'สายลำโพง', 'SPK', 'สายลำโพง', 'เมตร', '', sq(['2x0.5', '2x0.75', '2x1', '2x1.5', '2x2.5', '4x1.5']),
      ['สีดำ', 'สีขาว', 'สีใส'], ['Link', 'Bangkok Cable', 'Thai Union', 'Belden', 'Mogami']],
    ['ท่อและราง', 'ท่อ EMT', 'EMT', 'ท่อ EMT', 'เส้น', '', [...inch, '2 1/2 นิ้ว'], ['ชุบกัลวาไนซ์', 'ชุบ Electro', 'สีดำ'], PIPE],
    ['ท่อและราง', 'ท่อ PVC', 'PVC', 'ท่อ PVC', 'เส้น', '', [...inch, '4 นิ้ว'], ['สีเหลือง', 'สีขาว', 'สีเทา'], ['SCG', ...PIPE.slice(1)]],
    ['ท่อและราง', 'รางเดินสาย', 'TRK', 'รางเดินสาย', 'เส้น', '', ['50x50 มม.', '50x100 มม.', '75x75 มม.', '100x100 มม.', '100x150 มม.', '150x150 มม.'],
      ['พร้อมฝา', 'ไม่มีฝา', 'ชุบกัลวาไนซ์'], PIPE],
    ['อุปกรณ์ไฟฟ้า', 'เซอร์กิตเบรกเกอร์', 'MCB', 'เซอร์กิตเบรกเกอร์', 'ตัว', '', ['1P 10A', '1P 16A', '1P 20A', '1P 32A', '2P 16A', '2P 32A', '2P 63A', '3P 32A', '3P 63A', '3P 100A'],
      ['แบบเกาะราง', 'แบบปลั๊กอิน'], CB],
    ['อุปกรณ์ไฟฟ้า', 'คอนแทคเตอร์และรีเลย์', 'CTR', 'คอนแทคเตอร์', 'ตัว', '', ['9A', '12A', '18A', '25A', '32A', '40A', '50A', '65A'],
      ['คอยล์ 220V', 'คอยล์ 24V', 'คอยล์ 380V'], CB],
    ['กล่องและตู้', 'กล่องพักสาย', 'JB', 'กล่องพักสาย', 'ใบ', '', ['2x4 นิ้ว', '4x4 นิ้ว', '4x6 นิ้ว', '6x6 นิ้ว', '8x8 นิ้ว', '10x10 นิ้ว', '12x12 นิ้ว'],
      ['เหล็ก', 'พลาสติก', 'กันน้ำ'], ['Haco', 'Chang', 'National', 'Thai Box', 'Eagle']],
    ['กล่องและตู้', 'ตู้คอนซูเมอร์ยูนิต', 'CU', 'ตู้คอนซูเมอร์ยูนิต', 'ตู้', '', ['2 ช่อง', '4 ช่อง', '6 ช่อง', '8 ช่อง', '10 ช่อง', '12 ช่อง', '16 ช่อง', '18 ช่อง'],
      ['มีเมนเบรกเกอร์', 'ไม่มีเมนเบรกเกอร์', 'กันดูด'], ['Schneider', 'ABB', 'Haco', 'Siemens', 'Chang']],
    ['กล่องและตู้', 'ตู้ควบคุมไฟฟ้า', 'CAB', 'ตู้ควบคุมไฟฟ้า', 'ตู้', '', ['40x30x20 ซม.', '50x40x20 ซม.', '60x40x25 ซม.', '80x60x30 ซม.', '100x60x30 ซม.', '120x80x40 ซม.'],
      ['IP54', 'IP65', 'IP66'], ['Haco', 'Chang', 'Siemens', 'Schneider', 'Thai Box']],
    ['สวิตช์และเต้ารับ', 'เต้ารับ', 'OUT', 'เต้ารับ', 'ชิ้น', '', ['เดี่ยว 10A', 'เดี่ยว 16A', 'คู่ 10A', 'คู่ 16A', 'คู่ 16A (มีกราวด์)', '3 ช่อง 16A'], COLORS4, SW],
    ['สวิตช์และเต้ารับ', 'สวิตช์ไฟ', 'SWT', 'สวิตช์ไฟ', 'ชิ้น', '', ['1 ทาง 1 ช่อง', '1 ทาง 2 ช่อง', '1 ทาง 3 ช่อง', '2 ทาง 1 ช่อง', '2 ทาง 2 ช่อง', 'หรี่ไฟ'], COLORS4, SW],
    ['สวิตช์และเต้ารับ', 'หน้ากากสวิตช์', 'PLT', 'หน้ากากสวิตช์', 'ชิ้น', '', ['1 ช่อง', '2 ช่อง', '3 ช่อง', '4 ช่อง', '6 ช่อง', 'กันน้ำ 1 ช่อง'], COLORS4, SW],
    ['โคมไฟ', 'หลอดไฟ LED', 'LMP', 'หลอดไฟ LED', 'หลอด', '', ['5W', '7W', '9W', '12W', '15W', '18W', 'T8 9W', 'T8 18W'], LIGHT, LAMP],
    ['โคมไฟ', 'โคมดาวน์ไลท์', 'DWN', 'โคมดาวน์ไลท์ LED', 'ชุด', '', ['4 นิ้ว 9W', '4 นิ้ว 12W', '5 นิ้ว 12W', '6 นิ้ว 15W', '6 นิ้ว 18W', '8 นิ้ว 24W'], LIGHT, LAMP],
    ['โคมไฟ', 'โคมฟลัดไลท์', 'FLD', 'โคมฟลัดไลท์ LED', 'ชุด', '', ['10W', '20W', '30W', '50W', '100W', '150W', '200W'], ['แสงขาว', 'แสงวอร์ม', 'กันน้ำ IP65'], LAMP],
    ['วัสดุสิ้นเปลือง', 'เทปพันสายไฟ', 'TPE', 'เทปพันสายไฟ', 'ม้วน', '', ['PVC 3/4 นิ้ว x 10 ม.', 'PVC 3/4 นิ้ว x 20 ม.', 'PVC 1/2 นิ้ว x 10 ม.', 'PVC 1 นิ้ว x 20 ม.', 'ผ้า 3/4 นิ้ว x 10 ม.', 'ยางละลาย 3/4 นิ้ว'],
      ['สีดำ', 'สีแดง', 'สีน้ำเงิน', 'สีเหลือง', 'สีเขียว'], ['3M', 'Nitto', 'Yazaki', 'Tesa', 'Scotch']],
    ['วัสดุสิ้นเปลือง', 'เคเบิ้ลไทร์', 'TIE', 'เคเบิ้ลไทร์', 'ถุง', '', ['4 นิ้ว', '6 นิ้ว', '8 นิ้ว', '10 นิ้ว', '12 นิ้ว', '15 นิ้ว', '20 นิ้ว'],
      ['สีขาว', 'สีดำ', 'สีเหลือง'], ['Thai Tie', 'KSS', 'Fuji', 'HellermannTyton', 'Panduit']],
    ['วัสดุสิ้นเปลือง', 'ซิลิโคนและกาว', 'SIL', 'ซิลิโคนซีลแลนท์', 'หลอด', '', ['80 มล.', '280 มล.', '300 มล.', '310 มล.'],
      ['สีขาว', 'สีใส', 'สีดำ', 'สีเทา'], ['Dow Corning', 'Selleys', 'Bosny', 'Toa', 'Sika']],
    ['น็อตและอุปกรณ์', 'สกรูและน็อต', 'SCR', 'สกรูเกลียวปล่อย', 'ถุง', '', ['#6 x 1/2 นิ้ว', '#8 x 1/2 นิ้ว', '#8 x 3/4 นิ้ว', '#8 x 1 นิ้ว', '#10 x 1 นิ้ว', '#10 x 1 1/2 นิ้ว', '#12 x 2 นิ้ว'],
      ['ชุบซิงค์', 'สแตนเลส', 'สีดำ'], FIX],
    ['น็อตและอุปกรณ์', 'แคลมป์และรัดท่อ', 'CLP', 'แคลมป์ก้ามปู', 'ตัว', '', inch.slice(0, 6), ['1 รู', '2 รู', 'ชุบกัลวาไนซ์'], FIX],
    ['น็อตและอุปกรณ์', 'พุกและเหล็กแขวน', 'ANC', 'พุกเหล็ก', 'ตัว', '', ['M6 x 50', 'M8 x 60', 'M8 x 75', 'M10 x 75', 'M10 x 100', 'M12 x 100'], ['ชุบซิงค์', 'สแตนเลส', 'ชุบกัลวาไนซ์'], FIX],
    ['ความปลอดภัย', 'หมวกนิรภัย', 'HLM', 'หมวกนิรภัย', 'ใบ', '', ['ปรับหมุน', 'ปรับสายรัด', 'มีสายรัดคาง', 'มีหน้ากาก', 'ABS', 'HDPE'],
      ['สีขาว', 'สีเหลือง', 'สีส้ม', 'สีแดง', 'สีน้ำเงิน'], SAFE],
    ['ความปลอดภัย', 'ถุงมือนิรภัย', 'GLV', 'ถุงมือนิรภัย', 'คู่', '', ['ผ้าเคลือบ PU', 'หนังท้องสั้น', 'ยางกันไฟฟ้า Class 0', 'ยางกันไฟฟ้า Class 00', 'ไนไตร', 'ยางกันสารเคมี'],
      ['ไซส์ S', 'ไซส์ M', 'ไซส์ L', 'ไซส์ XL'], SAFE],
    ['ความปลอดภัย', 'ป้ายเตือน', 'SGN', 'ป้ายเตือน', 'แผ่น', '', ['ระวังไฟฟ้าแรงสูง', 'ห้ามเข้า', 'ทางออกฉุกเฉิน', 'สวมหมวกนิรภัย', 'ระวังอันตราย', 'ห้ามสูบบุหรี่'],
      ['20x30 ซม.', '30x45 ซม.', '40x60 ซม.'], ['Safety+', 'Steelpro', 'Sign Pro', '3M', 'Brady']],
  ];

  // [code, name, หมวดย่อย, ยี่ห้อ, รุ่น, หน่วย, ยอด W-BN (null = ตามกฎ), reorderPoint] — 6 แรกตามรูป, ที่เหลือจาก PDF 0.5
  const FIXED = [
    ['EL-WR-THW-0015-BK', 'สายไฟ THW 1.5 sq.mm สีดำ', 'สายไฟ THW', 'Thai Yazaki', 'THW 1x1.5 sq.mm', 'เมตร', 1250, 200],
    ['EL-JB-0404', 'กล่องพักสาย 4x4 นิ้ว', 'กล่องพักสาย', '-', '4x4 นิ้ว', 'ใบ', 342, 50],
    ['EL-EMT-012', 'ท่อ EMT 1/2 นิ้ว', 'ท่อ EMT', '-', '1/2 นิ้ว', 'เมตร', 580, 100],
    ['EL-OUT-002', 'เต้ารับคู่ 16A 250V (มีกราวด์)', 'เต้ารับ', 'Panasonic', 'WEG 15629 16A 250V', 'ชิ้น', 126, 150],
    ['EL-MCB-1P16', 'เซอร์กิตเบรกเกอร์ 1P 16A (MCB)', 'เซอร์กิตเบรกเกอร์', 'Schneider', 'EZ9F34116', 'ตัว', 28, 30],
    ['EL-TAPE-034', 'เทปพันสายไฟ PVC 3/4 นิ้ว x 10 ม.', 'เทปพันสายไฟ', '3M', 'PVC 3/4 นิ้ว x 10 ม.', 'ม้วน', 0, 20],
    ['EL-WR-THW-0015-RD', 'สายไฟ THW 1.5 sq.mm สีแดง', 'สายไฟ THW', 'Thai Yazaki', 'THW 1x1.5 sq.mm', 'เมตร', null, 100],
    ['EL-WR-THW-0025-GY', 'สายไฟ THW 2.5 sq.mm สีเขียว-เหลือง', 'สายไฟ THW', 'Yazaki', 'THW 1x2.5 sq.mm', 'เมตร', null, 100],
    ['EL-WR-THW-0040-BK', 'สายไฟ THW 4 sq.mm สีดำ', 'สายไฟ THW', 'Phelps Dodge', 'THW 1x4 sq.mm', 'เมตร', null, 100],
    ['EL-WR-VAF-2015', 'สายไฟ VAF 2x1.5 sq.mm', 'สายไฟ VAF', 'Bangkok Cable', 'VAF 2x1.5 sq.mm (แบนคู่)', 'เมตร', null, 100],
    ['EL-WR-VCT-4025', 'สายไฟ VCT 4x2.5 sq.mm', 'สายไฟ VCT', 'Bangkok Cable', 'VCT 4x2.5 sq.mm', 'เมตร', null, 100],
    ['EL-LAN-CAT6', 'สายแลน CAT6 UTP', 'สายแลน', 'Link', 'US-9106 CAT6 305 ม./กล่อง', 'เมตร', null, 305],
    ['EL-MCB-EZ9-1P16', 'เบรกเกอร์ลูกย่อย 1P 16A', 'เซอร์กิตเบรกเกอร์', 'Schneider', 'EZ9 1P 16A 6kA', 'ตัว', null, 20],
    ['EL-TIE-008', 'เคเบิ้ลไทร์ 8 นิ้ว (ถุง 100 เส้น)', 'เคเบิ้ลไทร์', '-', '8 นิ้ว', 'ถุง', null, 10],
    ['EL-TAPE-3M', 'เทปพันสายไฟ 3M', 'เทปพันสายไฟ', '3M', 'Temflex 1700 กว้าง 3/4 นิ้ว ยาว 10 ม.', 'ม้วน', null, 10],
  ];
  // W-BN: นอกจาก P-0004/5 (low) และ P-0006 (out) เพิ่ม out 2 + low 10 → low 12 / out 3 พอดี (ทั้งหมด ≤ P-0040)
  const OUT_EXTRA = [10, 23];
  const LOW_EXTRA = [9, 12, 14, 17, 19, 26, 29, 32, 35, 38];
  const PR_POOL = [4, 5, 6, 9, 10, 12, 14, 17, 19, 23, 26, 29, 32, 35, 38, 7, 8, 11];

  function build(opts) {
    const n = (opts && opts.products) || 2000;
    const rng = mulberry32(42);
    const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

    const users = [
      { id: 'U-ENG', name: 'สมชาย วิศวกร', title: 'วิศวกรโครงการ', role: 'engineer' },
      { id: 'U-STORE', name: 'ก้องภพ แสงทอง', title: 'Store', role: 'store' },
      { id: 'U-HEAD', name: 'อรุณ รัตนชัย', title: 'หัวหน้า', role: 'head' },
    ];
    const warehouses = [
      { id: 'W-BN', name: 'คลังหลัก บางนา', location: 'บางนา กรุงเทพฯ', countId: null },
      { id: 'W-A', name: 'คลังไซต์งาน A', location: 'มาบตาพุด ระยอง', countId: null },
      { id: 'W-B', name: 'คลังไซต์งาน B', location: 'อมตะซิตี้ ชลบุรี', countId: null },
      { id: 'W-C', name: 'คลังไซต์งาน C', location: 'ไซต์งาน C', countId: null },
    ];

    const categories = [];
    const nextCatId = () => 'C-' + pad(categories.length + 1, 3);
    const topIds = {};
    TOPS.forEach(([name, icon, color], i) => {
      topIds[name] = nextCatId();
      categories.push({ id: topIds[name], name, parentId: null, icon, color, order: i + 1, image: null });
    });
    const subIds = {};
    SUBS.forEach((sd, i) => {
      const parent = categories.find((c) => c.id === topIds[sd[0]]);
      subIds[sd[1]] = nextCatId();
      categories.push({ id: subIds[sd[1]], name: sd[1], parentId: parent.id, icon: parent.icon, color: parent.color, order: i + 1, image: null });
    });

    // คอมโบ ขนาด × สี × ยี่ห้อ ต่อหมวดย่อย → สลับลำดับ → แจกวนทีละหมวด (ลำดับไม่ขึ้นกับ n)
    const fixedNames = new Set(FIXED.map((f) => f[1]));
    const pools = SUBS.map((sd) => {
      const [, , abbr, noun, unit, mp, sizes, vars, brands] = sd;
      const combos = [];
      for (const s of sizes) for (const v of vars) for (const b of brands) {
        combos.push({ sd, abbr, unit, b, name: `${noun} ${s} ${v} (${b})`, model: mp + s });
      }
      for (let i = combos.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [combos[i], combos[j]] = [combos[j], combos[i]];
      }
      return combos.filter((c) => !fixedNames.has(c.name));
    });
    const rpOf = (unit) => {
      const opts = unit === 'เมตร' ? [100, 200, 300] : unit === 'เส้น' ? [20, 30, 50] : [10, 20, 30, 50];
      return opts[ri(0, opts.length - 1)];
    };

    const products = [];
    const bnQty = []; // ยอด W-BN ที่กำหนดตายตัว (null = ตามกฎ)
    const add = (p, bn) => {
      products.push({ id: 'P-' + pad(products.length + 1, 4), ...p, createdAt: iso(products.length % 300), image: null });
      bnQty.push(bn);
    };
    FIXED.slice(0, n).forEach((f) => add({ code: f[0], name: f[1], brand: f[3], model: f[4], unit: f[5], categoryId: subIds[f[2]], reorderPoint: f[7] }, f[6]));
    for (let k = 0; products.length < n; k++) {
      let progressed = false;
      for (let i = 0; i < pools.length && products.length < n; i++) {
        const c = pools[i][k];
        if (!c) continue;
        progressed = true;
        add({ code: `EL-${c.abbr}-${pad(products.length + 1, 5)}`, name: c.name, brand: c.b, model: c.model, unit: c.unit, categoryId: subIds[c.sd[1]], reorderPoint: rpOf(c.unit) }, null);
      }
      if (!progressed) throw new Error('seed: combo pool exhausted at ' + products.length);
    }

    const stock = {};
    products.forEach((p, i) => {
      const num = i + 1, rp = p.reorderPoint;
      let bn = bnQty[i];
      if (bn === null) {
        if (OUT_EXTRA.includes(num)) bn = 0;
        else if (LOW_EXTRA.includes(num)) bn = ri(1, rp);
        else bn = rp + ri(1, rp * 4);
      }
      if (bn > 0) stock[`${p.id}|W-BN`] = bn;
      for (const w of ['W-A', 'W-B', 'W-C']) if (rng() < 0.4) stock[`${p.id}|${w}`] = ri(1, rp * 2);
    });

    const jobs = [
      { id: 'J-25-010', name: 'อาคารสำนักงาน โซน A', customer: 'บจก. มาบตาพุด เคมิคอล', open: true },
      { id: 'J-25-002', name: 'ซ่อมบำรุงประจำปี', customer: 'ภายในบริษัท', open: true },
      { id: 'J-24-045', name: 'เดินสาย LAN โรงงาน B', customer: 'บจก. อมตะ พาร์ทส์', open: true },
      { id: 'J-24-012', name: 'ติดตั้งตู้ MDB อาคารสำนักงานใหญ่', customer: 'บจก. สยามพร็อพเพอร์ตี้', open: true },
      { id: 'J-24-031', name: 'ติดตั้งระบบไฟฟ้า อาคาร A โครงการริเวอร์ไซด์', customer: 'บจก. ริเวอร์ไซด์ ดีเวลลอปเมนท์', open: true },
      { id: 'J-24-008', name: 'ปรับปรุงห้องควบคุม โรงงาน C', customer: 'บจก. อีสเทิร์น ฟู้ดส์', open: false },
    ];
    const openJobs = jobs.filter((j) => j.open);

    // เอกสารใช้สูตรคงที่ (ไม่ใช้ rng) และอ้างเฉพาะ P-0001..P-0040 เพื่อให้ products:50 ใช้ได้
    const lim = Math.min(40, n);
    const mkLines = (i, issued) => Array.from({ length: 1 + (i % 3) }, (_, j) => {
      const qty = ((i + j) * 3) % 20 + 5;
      return { productId: 'P-' + pad(((i * 7 + j * 5) % lim) + 1, 4), qty, ...(issued ? { issued: qty } : {}) };
    });
    const POSTED_ISSUE = 14, PENDING = 7, RECEIVE = 6;
    const docs = [];
    for (let i = 0; i < POSTED_ISSUE; i++) {
      docs.push({ id: 'REQ-69' + pad(i + 1, 4), type: 'issue', status: 'posted', whId: i % 5 === 4 ? 'W-A' : 'W-BN',
        jobId: openJobs[i % openJobs.length].id, lines: mkLines(i, true), note: '', by: 'U-ENG', at: iso(30 - i * 2), prIds: [] });
    }
    for (let i = 0; i < RECEIVE; i++) {
      docs.push({ id: 'RC-69' + pad(i + 1, 4), type: 'receive', status: 'posted', whId: 'W-BN',
        lines: mkLines(i + 3, true), note: 'รับของจากผู้ขาย', by: 'U-STORE', at: iso(28 - i * 4) });
    }
    for (let i = 0; i < PENDING; i++) {
      docs.push({ id: 'REQ-69' + pad(POSTED_ISSUE + i + 1, 4), type: 'issue', status: 'pending', whId: 'W-BN',
        jobId: openJobs[(i + 1) % openJobs.length].id, lines: mkLines(i + 5), note: '', by: 'U-ENG', at: iso(i % 3, 8 + i) });
    }

    const prs = PR_POOL.map((num, k) => {
      const req = docs[k % POSTED_ISSUE];
      const id = 'PR-69' + pad(k + 1, 4);
      req.prIds.push(id);
      return { id, productId: 'P-' + pad(num, 4), whId: 'W-BN', qty: ((k * 7) % 9 + 1) * 10, received: 0, status: 'open', reqId: req.id };
    });

    return {
      version: 1,
      counters: { P: products.length, REQ: POSTED_ISSUE + PENDING, PR: prs.length, RC: RECEIVE, CC: 0, ADJ: 0, J: 0, C: categories.length },
      settings: { requireApproval: false },
      currentUserId: 'U-ENG',
      users, warehouses, categories, products, stock, jobs, docs, prs, counts: [],
      cart: { lines: [{ productId: 'P-0001', qty: 100 }, { productId: 'P-0002', qty: 10 }, { productId: 'P-0003', qty: 30 }], whId: 'W-BN', jobId: 'J-25-010', note: '' },
    };
  }

  const Seed = { build };
  root.Seed = Seed;
  if (typeof module !== 'undefined') module.exports = Seed;
})(typeof window !== 'undefined' ? window : globalThis);
