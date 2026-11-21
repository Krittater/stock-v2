// สถานะแอป (persist ลง localStorage), router แบบ hash, และ act() สำหรับเรียก Domain
(function () {
  const { reactive, computed, watch, ref } = Vue;
  const KEY = 'stockpro-mock-v3'; // v3: ยอดแยกชั้น/ม้วน — ข้อมูล v1/v2 เก่า shape ไม่ตรง เริ่มจาก seed ใหม่
  window.Pages = {};

  function load() {
    try { localStorage.removeItem('stockpro-mock-v1'); localStorage.removeItem('stockpro-mock-v2'); return Domain.parseSaved(localStorage.getItem(KEY)); } catch (e) { return null; }
  }
  const state = reactive(load() ?? Seed.build());
  if (!state.ui) state.ui = { dark: false };

  // บันทึกหลัง act() สำเร็จ + เมื่อส่วนที่แก้ตรง ๆ เปลี่ยน (ตะกร้า ตั้งค่า โหมดมืด บทบาท)
  // ไม่ deep-watch ทั้ง state — เดินทั้งก้อน ~40ms ทุกครั้งที่กดเพิ่ม/ลดจำนวน
  let timer = null;
  function save() {
    clearTimeout(timer);
    timer = null;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('บันทึก localStorage ไม่ได้', e); }
  }
  const saveSoon = () => { clearTimeout(timer); timer = setTimeout(save, 300); };
  watch(() => [state.cart, state.settings, state.ui, state.currentUserId, state.notifs], saveSoon, { deep: true });
  window.addEventListener('pagehide', () => { if (timer) save(); });

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
    saveSoon();
    if (successMsg) toast('success', typeof successMsg === 'function' ? successMsg(result) : successMsg, 3000);
    return result;
  }

  const resetCount = ref(0); // app.js ใช้เป็น key ของหน้า — reset แล้วหน้าเมานต์ใหม่ ไม่ถือออบเจกต์เก่าค้าง
  function reset() {
    services.confirm.require({
      header: 'รีเซ็ตข้อมูลตัวอย่าง',
      message: 'ข้อมูลที่แก้ไว้ทั้งหมดจะหายและกลับเป็นข้อมูลตัวอย่างเริ่มต้น ต้องการรีเซ็ตหรือไม่?',
      icon: 'pi pi-exclamation-triangle',
      rejectProps: { label: 'ยกเลิก', severity: 'secondary', outlined: true },
      acceptProps: { label: 'รีเซ็ต', severity: 'danger' },
      accept: () => {
        const ui = { ...state.ui };
        const fresh = Seed.build(); // สร้างก่อนลบ ถ้า build พังข้อมูลเดิมยังอยู่
        for (const k of Object.keys(state)) delete state[k];
        Object.assign(state, fresh, { ui });
        resetCount.value++;
        saveSoon();
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

  window.AppState = { state, user, act, reset, resetCount, setRole, route, go, services };
})();
