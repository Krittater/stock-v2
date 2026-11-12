// สถานะแอป (persist ลง localStorage), router แบบ hash, และ act() สำหรับเรียก Domain
(function () {
  const { reactive, computed, watch } = Vue;
  const KEY = 'stockpro-mock-v1';
  window.Pages = {};

  function load() {
    try { return Domain.parseSaved(localStorage.getItem(KEY)); } catch (e) { return null; }
  }
  const state = reactive(load() ?? Seed.build());
  if (!state.ui) state.ui = { dark: false };

  let timer;
  watch(state, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('บันทึก localStorage ไม่ได้', e); }
    }, 300);
  }, { deep: true });

  const user = computed(() => Domain.currentUser(state));

  // app.js ใส่ toast/confirm ของ PrimeVue ให้หลังสร้าง app
  const services = { toast: null, confirm: null };
  const toast = (severity, detail, life) =>
    services.toast?.add({ severity, summary: severity === 'error' ? 'ทำรายการไม่สำเร็จ' : 'สำเร็จ', detail, life });

  function act(fn, successMsg) {
    let result;
    try {
      result = fn(state, user.value);
    } catch (err) {
      if (err instanceof Domain.DomainError) { toast('error', err.message, 6000); return undefined; }
      toast('error', 'เกิดข้อผิดพลาดที่ไม่คาดคิด ลองใหม่หรือรีเซ็ตข้อมูลตัวอย่าง', 6000);
      throw err;
    }
    if (successMsg) toast('success', typeof successMsg === 'function' ? successMsg(result) : successMsg, 3000);
    return result;
  }

  function reset() {
    services.confirm.require({
      header: 'รีเซ็ตข้อมูลตัวอย่าง',
      message: 'ข้อมูลที่แก้ไว้ทั้งหมดจะหายและกลับเป็นข้อมูลตัวอย่างเริ่มต้น ต้องการรีเซ็ตหรือไม่?',
      icon: 'pi pi-exclamation-triangle',
      rejectProps: { label: 'ยกเลิก', severity: 'secondary', outlined: true },
      acceptProps: { label: 'รีเซ็ต', severity: 'danger' },
      accept: () => {
        const ui = { ...state.ui };
        for (const k of Object.keys(state)) delete state[k];
        Object.assign(state, Seed.build(), { ui });
        toast('success', 'รีเซ็ตข้อมูลตัวอย่างแล้ว', 3000);
      },
    });
  }

  function setRole(role) {
    const u = state.users.find((x) => x.role === role);
    if (u) state.currentUserId = u.id;
  }

  // '#/issue?q=thw' → { name: 'issue', query: { q: 'thw' } } ; '#/' → home
  function parseHash() {
    const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
    return { name: path || 'home', query: Object.fromEntries(new URLSearchParams(qs || '')) };
  }
  const route = reactive(parseHash());
  window.addEventListener('hashchange', () => Object.assign(route, parseHash()));

  function go(name, query) {
    const qs = new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v != null && v !== '')).toString();
    location.hash = '#/' + name + (qs ? '?' + qs : '');
  }

  window.AppState = { state, user, act, reset, setRole, route, go, services };
})();
