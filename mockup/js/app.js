// โครงแอป: sidebar, topbar, router outlet, ธีม — mount ท้ายไฟล์
(function () {
  const { computed, ref, watch, watchEffect, onMounted, onBeforeUnmount } = Vue;
  const { state, user, route, go, setRole, reset, resetCount } = AppState;

  const NAV = [
    { name: 'home', label: 'หน้าแรก', icon: 'pi-home' },
    { name: 'approvals', label: 'อนุมัติ', icon: 'pi-file-check', badge: true },
    { name: 'products', label: 'คลังสินค้า', icon: 'pi-box' },
    { name: 'issue', label: 'เบิกของ', icon: 'pi-shopping-cart' },
    { name: 'returns', label: 'คืนของ', icon: 'pi-replay' },
    { name: 'jobs', label: 'โครงการ / งาน', icon: 'pi-briefcase' },
    { name: 'purchase', label: 'ขอซื้อ', icon: 'pi-shopping-bag' },
    { name: 'receive', label: 'รับของเข้า', icon: 'pi-download' },
    { name: 'transfer', label: 'โอนย้าย', icon: 'pi-arrow-right-arrow-left' },
    { name: 'count', label: 'ตรวจนับ', icon: 'pi-list-check' },
    { name: 'reports', label: 'รายงาน', icon: 'pi-chart-bar', chevron: true },
  ];
  const SETTINGS = [
    { name: 'products', tab: 'categories', label: 'ข้อมูลวัสดุ', icon: 'pi-database' },
    { name: 'warehouses', label: 'คลังสินค้า', icon: 'pi-building' },
    { name: 'jobs', label: 'โครงการ / งาน', icon: 'pi-briefcase', dup: true },
    { name: 'users', label: 'ผู้ใช้งานและสิทธิ์', icon: 'pi-users' },
    { name: 'opening', label: 'ยอดยกมา', icon: 'pi-file-import', head: true },
  ];
  const TITLES = {};
  for (const i of [...SETTINGS, ...NAV]) TITLES[i.name] = i.label;

  // "คลังสินค้า" กับ "ข้อมูลวัสดุ" ใช้หน้า products เดียวกัน แยก active ด้วย tab=categories
  const isActive = (i) => !i.dup && route.name === i.name && (route.query.tab === 'categories') === (i.tab === 'categories');

  const ROLES = [
    { role: 'head', label: 'หัวหน้า' },
    { role: 'store', label: 'Store' },
    { role: 'engineer', label: 'วิศวกร' },
  ];

  const creditsOpen = ref(false);
  // แหล่งรูปทั้งหมด (img/credits.js) — ตารางใน dialog "เครดิตรูปภาพ"
  const credits = Object.entries(window.ImageCredits || {}).map(([path, c]) => ({ path, file: path.split('/').pop(), ...c }));

  const AppSidebar = {
    setup() {
      const pop = ref();
      // เมนูอนุมัติ: หัวหน้า/Store เห็น (วิศวกรไม่มีเรื่องรอ) · ป้ายเลขตรงกับ Domain.approvalItems
      const navItems = computed(() => NAV.filter((i) => i.name !== 'approvals' || user.value.role !== 'engineer'));
      const settingsItems = computed(() => SETTINGS.filter((i) => !i.head || user.value.role === 'head'));
      const badgeN = computed(() => { const a = Domain.approvalItems(state, user.value); return a.issues.length + a.receipts.length + a.ccs.length; });
      return {
        navItems, settingsItems, badgeN, NAV, SETTINGS, ROLES, state, user, pop, isActive, setRole, reset,
        openCredits: () => { pop.value.hide(); creditsOpen.value = true; },
        open: (i) => go(i.name, i.tab ? { tab: i.tab } : undefined),
        nameOf: (role) => state.users.find((u) => u.role === role)?.name,
      };
    },
    template: `<nav class="sidebar" aria-label="เมนูหลัก">
      <div class="logo">
        <span class="logo-mark"><i class="pi pi-box" aria-hidden="true"></i></span>
        <span class="min-w-0"><span class="logo-name">StockPro</span><span class="logo-sub">ระบบบริหารคลังและเบิกจ่าย</span></span>
      </div>
      <div class="nav-scroll">
        <button v-for="i in navItems" :key="i.name" type="button" class="nav-item" :class="{ active: isActive(i) }"
          :aria-current="isActive(i) ? 'page' : null" @click="open(i)">
          <i :class="['pi', i.icon]" aria-hidden="true"></i><span>{{ i.label }}</span>
          <i v-if="i.chevron" class="pi pi-chevron-down nav-chevron" aria-hidden="true"></i>
          <span v-if="i.badge && badgeN" class="nav-badge num" :aria-label="badgeN + ' รายการรอ'">{{ badgeN }}</span>
        </button>
        <div class="nav-section">ตั้งค่า</div>
        <button v-for="i in settingsItems" :key="i.label" type="button" class="nav-item" :class="{ active: isActive(i) }"
          :aria-current="isActive(i) ? 'page' : null" @click="open(i)">
          <i :class="['pi', i.icon]" aria-hidden="true"></i><span>{{ i.label }}</span>
        </button>
      </div>
      <button type="button" class="user-card" aria-haspopup="dialog" @click="pop.toggle($event)">
        <span class="avatar" aria-hidden="true">{{ user.name.charAt(0) }}</span>
        <span class="user-text"><span class="user-name">{{ user.name }}</span><span class="user-title">{{ user.title }}</span></span>
        <i class="pi pi-chevron-down" aria-hidden="true"></i>
      </button>
      <p-popover ref="pop">
        <div class="user-menu">
          <div class="menu-label" id="role-label">บทบาท (สลับเพื่อทดลอง)</div>
          <div role="radiogroup" aria-labelledby="role-label" class="role-group">
            <button v-for="r in ROLES" :key="r.role" type="button" role="radio" class="role-opt"
              :class="{ checked: user.role === r.role }" :aria-checked="user.role === r.role" @click="setRole(r.role)">
              <i :class="['pi', user.role === r.role ? 'pi-circle-fill' : 'pi-circle']" aria-hidden="true"></i>
              <span class="role-name">{{ r.label }}</span><span class="role-user">{{ nameOf(r.role) }}</span>
            </button>
          </div>
          <label class="switch-row">
            <span>ใบเบิกต้องให้หัวหน้าอนุมัติ<small v-if="user.role !== 'head'">เฉพาะหัวหน้าแก้ได้</small></span>
            <p-toggleswitch v-model="state.settings.requireApproval" :disabled="user.role !== 'head'" />
          </label>
          <label class="switch-row">
            <span>โหมดมืด</span>
            <p-toggleswitch v-model="state.ui.dark" />
          </label>
          <p-button label="เครดิตรูปภาพ" icon="pi pi-images" severity="secondary" text class="w-full" @click="openCredits" />
          <p-button label="รีเซ็ตข้อมูลตัวอย่าง" icon="pi pi-refresh" severity="danger" outlined class="w-full"
            @click="pop.hide(); reset()" />
        </div>
      </p-popover>
    </nav>`,
  };

  const AppTopbar = {
    emits: ['menu'],
    setup() {
      const q = ref(route.query.q || '');
      const input = ref();
      const bell = ref();
      const company = ref('SP');
      const companies = [{ id: 'SP', name: 'บริษัท เอสพี คอนสตรัคชั่น จำกัด' }];
      // หัวหน้า: ใบเบิก+ใบรับ · Store: ใบรับของวิศวกร · วิศวกร: ของตัวเอง — ไม่ให้ Store เห็นใบเบิกรออนุมัติ
      const apr = computed(() => Domain.approvalItems(state, user.value));
      const pending = computed(() => (user.value.role === 'engineer'
        ? state.docs.filter((d) => d.status === 'pending' && d.by === user.value.id && (d.type === 'issue' || d.type === 'receive'))
        : [...apr.value.issues, ...apr.value.receipts]).slice().sort((a, b) => b.at.localeCompare(a.at)));
      const ccs = computed(() => apr.value.ccs);
      const ccLabel = (c) => { const p = state.products.find((x) => x.id === c.productId); return (c.kind === 'count' ? 'ปรับยอดนับ ' : 'ยอดรอยืนยัน ') + (p ? p.name : '') + ' (' + c.id + ')'; };
      const notes = computed(() => (state.notifs || []).filter((n) => n.to === user.value.id && !n.read).reverse());
      const total = computed(() => pending.value.length + ccs.value.length + notes.value.length);
      const openNote = (n) => { Domain.markRead(state, user.value.id, n.id); bell.value.hide(); location.hash = n.link || '#/'; };
      const nameOf = (id) => state.users.find((u) => u.id === id)?.name || id;
      const when = (at) => new Date(at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
      const openDoc = (d) => { bell.value.hide(); if (user.value.role === 'engineer') go(d.type === 'issue' ? 'issue' : 'receive'); else go('approvals', d.type === 'issue' ? undefined : { tab: 'cc' }); };
      const openCc = () => { bell.value.hide(); go('approvals', { tab: 'cc' }); };
      const search = () => go('issue', { q: q.value.trim() });
      const onKey = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.value.focus(); }
      };
      onMounted(() => window.addEventListener('keydown', onKey));
      onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
      return { q, input, bell, company, companies, pending, ccs, ccLabel, openCc, notes, total, openNote, nameOf, when, openDoc, search };
    },
    template: `<header class="topbar">
      <button type="button" class="icon-btn menu-btn" aria-label="เปิดเมนู" @click="$emit('menu')"><i class="pi pi-bars" aria-hidden="true"></i></button>
      <div class="search">
        <i class="pi pi-search" aria-hidden="true"></i>
        <input ref="input" v-model="q" type="search" placeholder="ค้นหาวัสดุ รหัสสินค้า หรือหมวดหมู่..."
          aria-label="ค้นหาวัสดุ" @keydown.enter="search">
        <kbd>⌘K</kbd>
      </div>
      <button type="button" class="icon-btn bell" :aria-label="'รายการรอดำเนินการ ' + total + ' รายการ'" @click="bell.toggle($event)">
        <i class="pi pi-bell" aria-hidden="true"></i>
        <span v-if="total" class="badge num">{{ total }}</span>
      </button>
      <p-popover ref="bell">
        <div class="bell-menu">
          <div class="menu-label">รอดำเนินการ ({{ pending.length + ccs.length }})</div>
          <p v-if="!total" class="muted">ไม่มีรายการรอดำเนินการ</p>
          <button v-for="d in pending" :key="d.id" type="button" class="bell-row" @click="openDoc(d)">
            <i :class="['pi', d.type === 'issue' ? 'pi-file-check' : 'pi-download']" aria-hidden="true"></i>
            <span class="min-w-0">
              <span class="bell-title"><doc-id :id="d.id" /> · {{ d.type === 'issue' ? 'ใบเบิกรออนุมัติ' : 'ใบรับรอยืนยันยอด' }}</span>
              <span class="bell-sub">{{ nameOf(d.by) }} · {{ when(d.at) }}</span>
            </span>
          </button>
          <button v-for="c in ccs" :key="c.id" type="button" class="bell-row" @click="openCc">
            <i class="pi pi-check-square" aria-hidden="true"></i>
            <span class="min-w-0"><span class="bell-title">{{ ccLabel(c) }}</span><span class="bell-sub">{{ c.stage === 'head' ? 'รอหัวหน้าอนุมัติ' : 'รอ Store ยืนยัน' }} · {{ nameOf(c.by) }} · {{ when(c.at) }}</span></span>
          </button>
          <button v-for="n in notes" :key="n.id" type="button" class="bell-row" @click="openNote(n)">
            <i class="pi pi-inbox" aria-hidden="true"></i>
            <span class="min-w-0"><span class="bell-title">{{ n.text }}</span><span class="bell-sub">{{ when(n.at) }}</span></span>
          </button>
        </div>
      </p-popover>
      <p-select v-model="company" :options="companies" optionLabel="name" optionValue="id" class="company" aria-label="บริษัท" />
    </header>`,
  };

  const Placeholder = {
    setup: () => ({ title: computed(() => TITLES[route.name] || route.name) }),
    template: `<div>
      <page-header icon="pi-info-circle" :title="title" />
      <div class="card placeholder"><i class="pi pi-wrench" aria-hidden="true"></i><p>ยังไม่อยู่ในขอบเขต mockup</p></div>
    </div>`,
  };

  const App = {
    components: { AppSidebar, AppTopbar },
    setup() {
      const drawer = ref(false);
      watch(() => route.name + JSON.stringify(route.query), () => { drawer.value = false; });
      watchEffect(() => document.documentElement.classList.toggle('app-dark', !!state.ui.dark));
      const page = computed(() => window.Pages[route.name] || Placeholder);
      return { drawer, page, route, resetCount, creditsOpen, credits };
    },
    template: `<div class="shell">
      <aside class="sidebar-fixed"><app-sidebar /></aside>
      <p-drawer v-model:visible="drawer" header="เมนู" class="app-drawer"><app-sidebar /></p-drawer>
      <div class="main">
        <app-topbar @menu="drawer = true" />
        <main class="content"><component :is="page" :key="route.name + ':' + resetCount" /></main>
      </div>
      <p-dialog v-model:visible="creditsOpen" header="เครดิตรูปภาพ" modal dismissableMask class="credits-dialog">
        <p class="muted credits-note">รูปถ่ายจาก Wikimedia Commons (ย่อขนาด/ครอป/แปลงไฟล์จากต้นฉบับ) ใช้ตามสัญญาอนุญาตที่ระบุ · รูปวาดทำขึ้นเองสำหรับ mockup นี้</p>
        <div class="credits-scroll">
          <table class="credits-table">
            <thead><tr><th>รูป</th><th>ไฟล์</th><th>ผู้สร้าง</th><th>สัญญาอนุญาต</th><th>แหล่งที่มา</th></tr></thead>
            <tbody>
              <tr v-for="c in credits" :key="c.path">
                <td><span class="thumb" style="width:40px;height:40px;background:#fff"><img :src="c.path" alt="" loading="lazy"></span></td>
                <td class="credits-file">{{ c.file }}</td>
                <td>{{ c.author }}</td>
                <td>{{ c.license }}</td>
                <td><a v-if="c.source" :href="c.source" target="_blank" rel="noopener noreferrer">เปิดดู<span class="sr-only"> {{ c.title }} (แท็บใหม่)</span> <i class="pi pi-external-link" aria-hidden="true"></i></a><span v-else class="muted">—</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </p-dialog>
      <p-toast position="top-right" />
      <p-confirmdialog />
    </div>`,
  };

  const { definePreset } = PrimeVue;
  const stone = Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((k) => [k, `{stone.${k}}`]));
  const preset = definePreset(PrimeVue.Themes.Aura, {
    semantic: {
      primary: { 50: '#effaf5', 100: '#d8f3e6', 200: '#b4e6d0', 300: '#82d2b3', 400: '#4fb892', 500: '#2c9c77', 600: '#1f7e60', 700: '#1b654f', 800: '#195141', 900: '#164337', 950: '#0b2620' },
      colorScheme: {
        light: {
          surface: { 0: '#ffffff', ...stone },
          primary: { color: '{primary.700}', contrastColor: '#ffffff', hoverColor: '{primary.800}', activeColor: '{primary.900}' },
        },
        dark: { surface: { 0: '#ffffff', ...stone } },
      },
    },
  });

  const app = Vue.createApp(App);
  app.use(PrimeVue.Config, { theme: { preset, options: { darkModeSelector: '.app-dark' } } });
  // ข้อความในตัว PrimeVue เป็นไทย — Config รวม option แบบตื้น จึงเติมทับ locale เดิมแทนส่ง locale ใหม่ทั้งก้อน
  const locale = app.config.globalProperties.$primevue.config.locale;
  Object.assign(locale, {
    emptyFilterMessage: 'ไม่พบรายการ', emptySearchMessage: 'ไม่พบรายการ', emptyMessage: 'ไม่มีตัวเลือก',
    searchMessage: 'พบ {0} รายการ', selectionMessage: 'เลือก {0} รายการ', emptySelectionMessage: 'ยังไม่ได้เลือก',
    noFilter: 'ไม่กรอง', clear: 'ล้าง', apply: 'ใช้', accept: 'ใช่', reject: 'ไม่', cancel: 'ยกเลิก',
  });
  Object.assign(locale.aria, {
    close: 'ปิด', previous: 'ก่อนหน้า', next: 'ถัดไป', navigation: 'การนำทาง', listLabel: 'รายการตัวเลือก',
    trueLabel: 'ใช่', falseLabel: 'ไม่ใช่', nullLabel: 'ไม่ได้เลือก',
    selectAll: 'เลือกทั้งหมดแล้ว', unselectAll: 'ไม่ได้เลือกทั้งหมด', selectRow: 'เลือกแถวแล้ว', unselectRow: 'ไม่ได้เลือกแถว',
    pageLabel: 'หน้า {page}', firstPageLabel: 'หน้าแรก', lastPageLabel: 'หน้าสุดท้าย', nextPageLabel: 'หน้าถัดไป', prevPageLabel: 'หน้าก่อน',
    rowsPerPageLabel: 'แถวต่อหน้า', jumpToPageDropdownLabel: 'ไปที่หน้า', jumpToPageInputLabel: 'ไปที่หน้า',
    expandRow: 'ขยายแถว', collapseRow: 'ยุบแถว', showFilterMenu: 'แสดงตัวกรอง', hideFilterMenu: 'ซ่อนตัวกรอง',
    scrollTop: 'เลื่อนขึ้นบนสุด',
  });
  app.use(PrimeVue.ToastService);
  app.use(PrimeVue.ConfirmationService);
  // ลงทะเบียน component ทุกตัวของ PrimeVue เป็น p-<ชื่อ> เช่น p-datatable, p-select
  for (const [k, v] of Object.entries(PrimeVue)) {
    if (/^[A-Z]/.test(k) && v && typeof v === 'object' && (v.render || v.setup) && v.name) app.component('p-' + k.toLowerCase(), v);
  }
  app.component('scan-button', window.ScanButton);
  UI.install(app);
  AppState.services.toast = app.config.globalProperties.$toast;
  AppState.services.confirm = app.config.globalProperties.$confirm;
  app.mount('#app');
})();
