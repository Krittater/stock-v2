// คอมโพเนนต์ UI ที่ใช้ร่วมกันทุกหน้า — app.js เรียก UI.install(app)
(function () {
  const S = () => AppState.state;
  const catOf = (id) => S().categories.find((c) => c.id === id);

  // ไอคอน/สีของหมวด — หมวดย่อยไม่มีก็ใช้ของหมวดแม่
  function catVisual(id) {
    const c = catOf(id);
    const p = c && c.parentId && catOf(c.parentId);
    return { icon: c?.icon || p?.icon || 'pi-box', color: c?.color || p?.color || '#78716c' };
  }

  // กรอบสี่เหลี่ยมมุมโค้งพื้นขาว (round = วงกลม): รูปถ้ามีและโหลดได้ ไม่งั้นไอคอนหมวดบนพื้นสีอ่อน
  const ThumbTile = {
    props: { src: String, icon: String, color: String, size: { type: [Number, String], default: 48 }, round: Boolean, alt: String },
    data: () => ({ failed: false }),
    watch: { src() { this.failed = false; } },
    computed: {
      style() {
        const s = Number(this.size) + 'px';
        const showImg = this.src && !this.failed;
        // ไม่มีรูป: พื้นสีหมวด (โทนอ่อน) + ไอคอนสีเข้มอ่านออก — โหมดมืดสลับใน app.css (.thumb-icon)
        return showImg ? { width: s, height: s, background: '#fff' } : { width: s, height: s, '--thumb-tint': this.color };
      },
    },
    template: `<span class="thumb" :class="{ 'thumb-round': round, 'thumb-icon': !(src && !failed) }" :style="style">
      <img v-if="src && !failed" :src="src" :alt="alt || ''" loading="lazy" @error="failed = true">
      <i v-else :class="['pi', icon]" :style="{ fontSize: Math.round(size * 0.42) + 'px' }" aria-hidden="true"></i>
    </span>`,
  };

  const CatThumb = {
    components: { ThumbTile },
    props: { categoryId: String, size: { type: [Number, String], default: 48 }, round: Boolean },
    computed: {
      src() { return Domain.categoryImage(S(), this.categoryId); },
      v() { return catVisual(this.categoryId); },
      name() { return catOf(this.categoryId)?.name; },
    },
    template: `<thumb-tile :src="src" :icon="v.icon" :color="v.color" :size="size" :round="round" :alt="name" />`,
  };

  const ProductThumb = {
    components: { ThumbTile },
    props: { product: Object, size: { type: [Number, String], default: 48 } },
    computed: {
      src() { return this.product ? Domain.imageOf(S(), this.product) : null; },
      v() { return catVisual(this.product?.categoryId); },
    },
    template: `<thumb-tile :src="src" :icon="v.icon" :color="v.color" :size="size" :alt="product?.name" />`,
  };

  const STATUS = {
    in: ['มีของ', 'tone-green'], low: ['ใกล้หมด', 'tone-orange'],
    out: ['ไม่มีของ', 'tone-red'], counting: ['กำลังตรวจนับ', 'tone-yellow'],
  };
  const StatusTag = {
    props: { status: String },
    computed: { s() { return STATUS[this.status] || [this.status, 'tone-gray']; } },
    template: `<span class="status-tag" :class="s[1]"><span class="dot" aria-hidden="true"></span>{{ s[0] }}</span>`,
  };

  const KpiCard = {
    props: { icon: String, tone: { type: String, default: 'green' }, title: String, value: [Number, String], unit: String, caption: String },
    emits: ['click'],
    template: `<button type="button" class="kpi-card" @click="$emit('click', $event)">
      <span class="kpi-icon" :class="'tone-' + tone"><i :class="['pi', icon]" aria-hidden="true"></i></span>
      <span class="kpi-body">
        <span class="kpi-title">{{ title }}</span>
        <span class="kpi-value"><span class="num">{{ typeof value === 'number' ? value.toLocaleString('en-US') : value }}</span> <span class="kpi-unit">{{ unit }}</span></span>
        <span class="kpi-caption">{{ caption }}</span>
      </span>
      <i class="pi pi-chevron-right kpi-chevron" aria-hidden="true"></i>
    </button>`,
  };

  // KPI 4 ใบ (หน้าแรก + หน้าเบิก) — low/out ส่ง @tab ให้หน้าเจ้าของจัดการ ที่เหลือพาไปหน้าที่เกี่ยวข้อง
  const KpiRow = {
    props: { whId: String },
    emits: ['tab'],
    computed: { kpi() { return Domain.kpis(S(), this.whId); } },
    methods: { go: (n) => AppState.go(n) },
    template: `<div class="kpi-row">
      <kpi-card icon="pi-exclamation-triangle" tone="red" title="ของใกล้หมด" :value="kpi.low" unit="รายการ" caption="คงเหลือน้อยกว่าจุดสั่งซื้อ" @click="$emit('tab', 'low')" />
      <kpi-card icon="pi-box" tone="red" title="ไม่มีของ" :value="kpi.out" unit="รายการ" caption="ของหมด ต้องรอรับเข้า" @click="$emit('tab', 'out')" />
      <kpi-card icon="pi-file-check" tone="green" title="รออนุมัติ" :value="kpi.pendingApprovals" unit="ใบเบิก" caption="รอผู้มีอำนาจอนุมัติ" @click="go('approvals')" />
      <kpi-card icon="pi-truck" tone="orange" title="รอของเข้า" :value="kpi.openPRs" unit="รายการ" caption="ระหว่างจัดส่งเข้าคลัง" @click="go('receive')" />
    </div>`,
  };

  const PageHeader = {
    props: { icon: String, title: String, subtitle: String },
    template: `<header class="page-header">
      <div class="min-w-0">
        <h1><i v-if="icon" :class="['pi', icon]" aria-hidden="true"></i>{{ title }}</h1>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.default" class="page-header-actions"><slot /></div>
    </header>`,
  };

  const Qty = {
    props: { n: Number, unit: String },
    template: `<span class="num">{{ Domain.formatQty(n ?? 0, unit) }}</span>`,
    computed: { Domain: () => Domain },
  };

  const DocId = { props: { id: String }, template: `<span class="doc-id">{{ id }}</span>` };

  // ย่อรูปให้ด้านยาวสุด 320px เป็น JPEG dataURL (หน้าคืนของ + กล่องสินค้า)
  async function shrink(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
      const k = Math.min(1, 320 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    } finally { URL.revokeObjectURL(url); }
  }

  // หน้าต่างพิมพ์ป้ายเลขม้วน (ใช้ร่วมหน้าคืน/รับ) labels: [{ id, name, qty }] · คืน false ถ้าเบราว์เซอร์บล็อกป๊อปอัป
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function printLabels(labels) {
    const w = window.open('', '_blank', 'width=480,height=640');
    if (!w) return false;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>ป้ายเลขม้วน</title><style>body{font-family:sans-serif;margin:0}.l{padding:24px;border-bottom:2px dashed #999;page-break-inside:avoid}.i{font:700 44px monospace}.n{font-size:20px;margin-top:6px}.q{font-size:18px;color:#444}</style>${
      labels.map((l) => `<div class="l"><div class="i">${esc(l.id)}</div><div class="n">${esc(l.name)}</div><div class="q">${esc(l.qty)}</div></div>`).join('')}`);
    w.document.close(); w.focus(); w.print();
    return true;
  }

  window.UI = {
    catVisual, shrink, printLabels,
    install(app) {
      app.component('cat-thumb', CatThumb);
      app.component('product-thumb', ProductThumb);
      app.component('status-tag', StatusTag);
      app.component('kpi-card', KpiCard);
      app.component('kpi-row', KpiRow);
      app.component('page-header', PageHeader);
      app.component('qty', Qty);
      app.component('doc-id', DocId);
    },
  };
})();
