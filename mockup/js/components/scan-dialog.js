// ปุ่ม "สแกน" + กล่องสแกน/พิมพ์รหัส ใช้ร่วมทุกหน้า (สแกนเป็นทางเลือกเสมอ ไม่เปิดเอง)
// <scan-button :kinds="['req','roll']" @found="({ kind, id }) => ..." />
(function () {
  const { ref, watch, nextTick, onBeforeUnmount } = Vue;
  const NOUN = { req: 'ใบเบิก', roll: 'ม้วน', product: 'สินค้า', job: 'งาน' };

  window.ScanButton = {
    props: { kinds: { type: Array, default: () => ['req', 'roll', 'product', 'job'] } },
    emits: ['found'],
    setup(props, { emit }) {
      const open = ref(false);
      const code = ref('');
      const error = ref('');
      const camNote = ref('');
      const hasCamera = ref(false);
      const video = ref();
      const input = ref();
      let stream = null;
      let timer = null;
      let session = 0; // นับทุกครั้งที่เปิด/ปิด/ถอด: งานกล้องที่ค้างอยู่เช็คเลขนี้หลังทุก await

      const stopCamera = () => {
        session++;
        clearInterval(timer); timer = null;
        if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
        if (video.value) video.value.srcObject = null;
      };

      const submit = (raw) => {
        const r = Domain.parseScan(AppState.state, raw ?? code.value, props.kinds);
        if (r && props.kinds.includes(r.kind)) { open.value = false; emit('found', r); return; }
        error.value = 'ไม่พบ' + props.kinds.map((k) => NOUN[k]).join('/') + 'จากรหัสนี้';
      };

      const startCamera = async () => {
        hasCamera.value = 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
        if (!hasCamera.value) return;
        const my = session;
        let s;
        try {
          s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (my !== session) { s.getTracks().forEach((t) => t.stop()); return; } // ปิด/เปิดใหม่/ถอดระหว่างรอสิทธิ์กล้อง
          stream = s;
          await nextTick();
          if (my !== session) return;
          video.value.srcObject = s;
          await video.value.play().catch(() => {});
          if (my !== session) return;
          const det = new BarcodeDetector();
          let busy = false;
          timer = setInterval(async () => {
            if (busy) return;
            busy = true;
            try {
              const hit = (await det.detect(video.value))[0];
              if (my === session && hit && hit.rawValue) { code.value = hit.rawValue; submit(hit.rawValue); }
            } catch (e) { /* เฟรมยังไม่พร้อม */ }
            busy = false;
          }, 400);
        } catch (e) {
          if (my !== session) { if (s) s.getTracks().forEach((t) => t.stop()); return; }
          if (stream) stopCamera();
          camNote.value = 'เปิดกล้องไม่ได้ พิมพ์รหัสแทนได้';
        }
      };

      watch(open, (v) => {
        if (v) { code.value = ''; error.value = ''; camNote.value = ''; startCamera(); nextTick(() => setTimeout(() => input.value?.$el?.focus(), 50)); }
        else stopCamera();
      });
      watch(code, () => { error.value = ''; });
      onBeforeUnmount(stopCamera);

      return { open, code, error, camNote, video, input, submit, hasCamera };
    },
    template: `<span class="scan-wrap">
      <p-button label="สแกน" icon="pi pi-qrcode" severity="secondary" outlined class="scan-btn" @click="open = true" />
      <p-dialog v-model:visible="open" modal dismissableMask header="สแกนรหัส" class="scan-dialog" :style="{ width: '28rem', maxWidth: '94vw' }">
        <div class="scan-body">
          <video v-if="hasCamera" ref="video" class="scan-video" muted playsinline aria-label="ภาพจากกล้อง"></video>
          <p v-if="camNote" class="muted scan-note">{{ camNote }}</p>
          <label class="scan-label" for="scan-code">พิมพ์หรือสแกนรหัส</label>
          <div class="scan-row">
            <p-inputtext id="scan-code" ref="input" v-model="code" autofocus fluid placeholder="เช่น REQ-690001" autocomplete="off" @keydown.enter.prevent="submit()" />
            <p-button label="ค้นหา" icon="pi pi-search" @click="submit()" />
          </div>
          <p v-if="error" class="scan-error" role="alert">{{ error }}</p>
        </div>
      </p-dialog>
    </span>`,
  };
})();
