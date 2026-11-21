// นำเข้ายอดยกมา (CSV) — หัวหน้าเท่านั้น · ตรวจต่อแถว → ตัดแถวผิด → นำเข้า · กติกาอยู่ใน domain/opening.js
(function () {
  const { ref, computed } = Vue;
  const { state, user, act, services } = AppState;
  const HEAD = ['code', 'warehouse', 'location', 'qty', 'roll_no', 'roll_initial', 'batch'];
  const LOCKED = 'ยอดยกมาถูกล็อกแล้ว — ตรวจสอบไฟล์ได้ แต่นำเข้าได้หลังปลดล็อก';

  window.Pages.opening = {
    setup() {
      const isHead = computed(() => user.value.role === 'head');
      const rows = ref([]);
      const fileName = ref('');
      const done = ref('');
      const locked = computed(() => !!state.settings.openingLocked);
      const bad = computed(() => rows.value.filter((r) => r.errors.length));
      const toast = (severity, detail) => services.toast?.add({ severity, summary: severity === 'error' ? 'ทำรายการไม่สำเร็จ' : 'ผลลัพธ์', detail, life: 4000 });

      const onSelect = (e) => {
        const f = e.files && e.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          // อ่านเป็น UTF-8 ตัด BOM ของ Excel
          const text = String(rd.result).replace(/^﻿/, '');
          try { rows.value = Domain.parseOpeningCsv(state, text).rows; fileName.value = f.name; done.value = ''; }
          catch (err) { toast('error', 'อ่านไฟล์ไม่ได้ ตรวจว่าเป็นไฟล์ .csv'); }
        };
        rd.onerror = () => toast('error', 'อ่านไฟล์ไม่ได้ ลองใหม่');
        rd.readAsText(f, 'UTF-8');
      };
      const trim = () => { rows.value = rows.value.filter((r) => !r.errors.length); };
      const doImport = () => {
        const r = act((s, u) => Domain.importOpening(s, rows.value, u), 'นำเข้ายอดยกมาแล้ว');
        if (r) { done.value = `นำเข้ายอดยกมาแล้ว ${r.imported} แถว`; rows.value = []; fileName.value = ''; }
      };
      const setLock = (v) => act((s, u) => Domain.setOpeningLock(s, v, u), v ? 'ล็อกยอดยกมาแล้ว' : 'ปลดล็อกยอดยกมาแล้ว');

      // ไฟล์ตัวอย่างสร้างในเบราว์เซอร์: 3 แถวจากสินค้าในระบบ (1 รายการเป็นสายม้วน)
      const sample = () => {
        const act1 = state.products.filter((p) => p.active !== false);
        const plain = act1.filter((p) => !p.isRoll).slice(0, 2);
        const roll = act1.find((p) => p.isRoll);
        const wh = (state.warehouses.find((w) => w.active !== false) || {}).id || '';
        const n = String((state.counters.R || 0) + 1).padStart(6, '0');
        const lines = [HEAD.join(',')];
        plain.forEach((p, i) => lines.push([p.code, wh, 'ทั่วไป', 10 + i * 5, '', '', i ? 'ล็อต-A' : ''].join(',')));
        if (roll) lines.push([roll.code, wh, 'ทั่วไป', 85, 'R-' + n, 100, ''].join(','));
        const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = 'ยอดยกมา-ตัวอย่าง.csv'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      return { isHead, rows, fileName, done, locked, bad, onSelect, trim, doImport, setLock, sample, LOCKED, FORBIDDEN: Domain.FORBIDDEN, HEAD };
    },
    template: `<div class="opening-page">
      <page-header icon="pi-file-import" title="ยอดยกมา" subtitle="นำเข้าของที่มีอยู่แล้วจากไฟล์ CSV ตอนเริ่มใช้ระบบ" />
      <div v-if="!isHead" class="card placeholder"><i class="pi pi-lock" aria-hidden="true"></i><p>{{ FORBIDDEN }}</p></div>
      <template v-else>
        <section class="card op-card">
          <label class="switch-row">
            <span>ล็อกยอดยกมา<small>ล็อกแล้วนำเข้าไม่ได้ ตรวจไฟล์ได้อย่างเดียว</small></span>
            <p-toggleswitch :modelValue="locked" @update:modelValue="setLock" />
          </label>
          <p v-if="locked" class="op-locked" role="status"><i class="pi pi-lock" aria-hidden="true"></i> {{ LOCKED }}</p>
          <p class="muted op-cols">คอลัมน์: <code>{{ HEAD.join(', ') }}</code> (batch = ล็อตผู้ผลิต)</p>
          <div class="op-actions">
            <p-fileupload mode="basic" accept=".csv,text/csv" :auto="false" customUpload chooseLabel="เลือกไฟล์ .csv" chooseIcon="pi pi-upload" @select="onSelect" />
            <button type="button" class="doc-link op-sample" @click="sample"><i class="pi pi-download" aria-hidden="true"></i> ดาวน์โหลดไฟล์ตัวอย่าง</button>
          </div>
          <p v-if="fileName" class="muted">ไฟล์: {{ fileName }} · {{ rows.length }} แถว</p>
          <p v-if="done" class="op-done" role="status"><i class="pi pi-check-circle" aria-hidden="true"></i> {{ done }}</p>
        </section>

        <section v-if="rows.length" class="card op-card" aria-label="ผลตรวจไฟล์">
          <div class="op-scroll">
            <table class="op-table">
              <thead><tr><th>แถว</th><th>ผลตรวจ</th><th>รหัสสินค้า</th><th>คลัง</th><th>ชั้น</th><th class="col-num">จำนวน</th><th>เลขม้วน</th></tr></thead>
              <tbody>
                <tr v-for="r in rows" :key="r.line" :class="{ 'op-bad': r.errors.length }">
                  <td class="num">{{ r.line }}</td>
                  <td><span v-if="!r.errors.length" class="status-tag tone-green"><span class="dot" aria-hidden="true"></span>ผ่าน</span>
                    <span v-else class="op-err"><i class="pi pi-times-circle" aria-hidden="true"></i> {{ r.errors.join(' · ') }}</span></td>
                  <td>{{ r.code || '-' }}</td><td>{{ r.warehouse || '-' }}</td><td>{{ r.shelf }}</td>
                  <td class="col-num num">{{ r.qty }}</td><td>{{ r.rollNo || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="op-actions op-foot">
            <p-button :label="'ตัดแถวที่ผิด (' + bad.length + ')'" icon="pi pi-trash" severity="secondary" outlined :disabled="!bad.length" @click="trim" />
            <p-button label="นำเข้ายอดยกมา" icon="pi pi-check" :disabled="!!bad.length || locked" @click="doImport" />
          </div>
          <p v-if="bad.length" class="op-err"><i class="pi pi-exclamation-circle" aria-hidden="true"></i> มี {{ bad.length }} แถวที่ผิด ตัดแถวที่ผิดก่อนจึงนำเข้าได้</p>
          <p v-else-if="locked" class="op-err"><i class="pi pi-lock" aria-hidden="true"></i> {{ LOCKED }}</p>
        </section>
      </template>
    </div>`,
  };
})();
