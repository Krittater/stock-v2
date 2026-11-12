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

  window.UI = {
    catVisual,
    install(app) {
      app.component('cat-thumb', CatThumb);
      app.component('product-thumb', ProductThumb);
      app.component('status-tag', StatusTag);
      app.component('kpi-card', KpiCard);
      app.component('page-header', PageHeader);
      app.component('qty', Qty);
      app.component('doc-id', DocId);
    },
  };
})();
