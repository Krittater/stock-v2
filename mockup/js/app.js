// โครงแอป: sidebar, topbar, router outlet, ธีม — mount ท้ายไฟล์
(function () {
  const { computed, ref, watch, watchEffect, onMounted, onBeforeUnmount } = Vue;
  const { state, user, route, go, setRole, reset } = AppState;

  const NAV = [
    { name: 'home', label: 'หน้าแรก', icon: 'pi-home' },
    { name: 'products', label: 'คลังสินค้า', icon: 'pi-box' },
    { name: 'issue', label: 'เบิกของ', icon: 'pi-shopping-cart' },
    { name: 'purchase', label: 'ขอซื้อ', icon: 'pi-shopping-bag' },
    { name: 'receive', label: 'รับของเข้า', icon: 'pi-download' },
    { name: 'transfer', label: 'โอนย้าย', icon: 'pi-arrow-right-arrow-left' },
    { name: 'count', label: 'ตรวจนับ', icon: 'pi-list-check' },
    { name: 'reports', label: 'รายงาน', icon: 'pi-chart-bar', chevron: true },
  ];
  const SETTINGS = [
    { name: 'products', tab: 'categories', label: 'ข้อมูลวัสดุ', icon: 'pi-database' },
    { name: 'warehouses', label: 'คลังสินค้า', icon: 'pi-building' },
    { name: 'jobs', label: 'โครงการ / งาน', icon: 'pi-briefcase' },
    { name: 'users', label: 'ผู้ใช้งานและสิทธิ์', icon: 'pi-users' },
  ];
  const TITLES = { approvals: 'อนุมัติใบเบิก' };
  for (const i of [...SETTINGS, ...NAV]) TITLES[i.name] = i.label;

  // "คลังสินค้า" กับ "ข้อมูลวัสดุ" ใช้หน้า products เดียวกัน แยก active ด้วย tab=categories
  const isActive = (i) => route.name === i.name && (route.query.tab === 'categories') === (i.tab === 'categories');

  const ROLES = [
    { role: 'head', label: 'หัวหน้า' },
    { role: 'store', label: 'Store' },
    { role: 'engineer', label: 'วิศวกร' },
  ];

  const AppSidebar = {
    setup() {
      const pop = ref();
      return {
        NAV, SETTINGS, ROLES, state, user, pop, isActive, setRole, reset,
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
        <button v-for="i in NAV" :key="i.name" type="button" class="nav-item" :class="{ active: isActive(i) }"
          :aria-current="isActive(i) ? 'page' : null" @click="open(i)">
          <i :class="['pi', i.icon]" aria-hidden="true"></i><span>{{ i.label }}</span>
          <i v-if="i.chevron" class="pi pi-chevron-down nav-chevron" aria-hidden="true"></i>
        </button>
        <div class="nav-section">ตั้งค่า</div>
        <button v-for="i in SETTINGS" :key="i.label" type="button" class="nav-item" :class="{ active: isActive(i) }"
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
      const pending = computed(() => state.docs
        .filter((d) => d.status === 'pending' && (d.type === 'issue' || d.type === 'receive'))
        .sort((a, b) => b.at.localeCompare(a.at)));
      const nameOf = (id) => state.users.find((u) => u.id === id)?.name || id;
      const when = (at) => new Date(at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
      const openDoc = (d) => { bell.value.hide(); go(d.type === 'issue' ? 'approvals' : 'receive'); };
      const search = () => go('issue', { q: q.value.trim() });
      const onKey = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.value.focus(); }
      };
      onMounted(() => window.addEventListener('keydown', onKey));
      onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
      return { q, input, bell, company, companies, pending, nameOf, when, openDoc, search };
    },
    template: `<header class="topbar">
      <button type="button" class="icon-btn menu-btn" aria-label="เปิดเมนู" @click="$emit('menu')"><i class="pi pi-bars" aria-hidden="true"></i></button>
      <div class="search">
        <i class="pi pi-search" aria-hidden="true"></i>
        <input ref="input" v-model="q" type="search" placeholder="ค้นหาวัสดุ รหัสสินค้า หรือหมวดหมู่..."
          aria-label="ค้นหาวัสดุ" @keydown.enter="search">
        <kbd>⌘K</kbd>
      </div>
      <button type="button" class="icon-btn bell" :aria-label="'รายการรอดำเนินการ ' + pending.length + ' รายการ'" @click="bell.toggle($event)">
        <i class="pi pi-bell" aria-hidden="true"></i>
        <span v-if="pending.length" class="badge num">{{ pending.length }}</span>
      </button>
      <p-popover ref="bell">
        <div class="bell-menu">
          <div class="menu-label">รอดำเนินการ ({{ pending.length }})</div>
          <p v-if="!pending.length" class="muted">ไม่มีรายการรอดำเนินการ</p>
          <button v-for="d in pending" :key="d.id" type="button" class="bell-row" @click="openDoc(d)">
            <i :class="['pi', d.type === 'issue' ? 'pi-file-check' : 'pi-download']" aria-hidden="true"></i>
            <span class="min-w-0">
              <span class="bell-title"><doc-id :id="d.id" /> · {{ d.type === 'issue' ? 'ใบเบิกรออนุมัติ' : 'ใบรับรอยืนยันยอด' }}</span>
              <span class="bell-sub">{{ nameOf(d.by) }} · {{ when(d.at) }}</span>
            </span>
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
      return { drawer, page, route };
    },
    template: `<div class="shell">
      <aside class="sidebar-fixed"><app-sidebar /></aside>
      <p-drawer v-model:visible="drawer" header="เมนู" class="app-drawer"><app-sidebar /></p-drawer>
      <div class="main">
        <app-topbar @menu="drawer = true" />
        <main class="content"><component :is="page" :key="route.name" /></main>
      </div>
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
  app.use(PrimeVue.ToastService);
  app.use(PrimeVue.ConfirmationService);
  // ลงทะเบียน component ทุกตัวของ PrimeVue เป็น p-<ชื่อ> เช่น p-datatable, p-select
  for (const [k, v] of Object.entries(PrimeVue)) {
    if (/^[A-Z]/.test(k) && v && typeof v === 'object' && (v.render || v.setup) && v.name) app.component('p-' + k.toLowerCase(), v);
  }
  UI.install(app);
  AppState.services.toast = app.config.globalProperties.$toast;
  AppState.services.confirm = app.config.globalProperties.$confirm;
  app.mount('#app');
})();
