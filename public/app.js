const $ = (id) => document.getElementById(id);
const app = document.querySelector('.app');
const video = $('video');

const JPEG_QUALITY = 0.9;
const SINGLE_MAX_EDGE = 2400; // 1장 모드: 긴 변 최대 px
const CELL_MAX_EDGE = 1200; // 4컷 모드: 한 컷의 긴 변 최대 px
const FOUR_CUT_DEFAULT_WAIT = 3; // 4컷인데 타이머가 꺼져 있을 때 컷 사이 대기(초)

const TIMERS = [0, 3, 5, 10];
const DEFAULT_TIMER = 3;
const STORAGE_KEY = 'photo-booth:v2'; // 기본값을 바꾸면 올려서 예전 저장값을 버린다
const MODES = [
  { id: 'single', label: '1장', shots: 1 },
  { id: 'four', label: '4컷', shots: 4 },
];
// ops는 CSS filter 함수와 같은 이름·값. 미리보기(CSS)와 저장본(픽셀 계산)이 같은 식을 쓴다.
const FILTERS = [
  { id: 'none', label: '원본', ops: [] },
  { id: 'mono', label: '흑백', ops: [['grayscale', 1], ['contrast', 1.12]] },
  { id: 'warm', label: '따뜻', ops: [['sepia', 0.3], ['saturate', 1.25]] },
  { id: 'vivid', label: '선명', ops: [['saturate', 1.45], ['contrast', 1.08]] },
  { id: 'soft', label: '화사', ops: [['brightness', 1.1], ['contrast', 0.9]] },
];

// ---------- 설정 (새로고침해도 유지) ----------
const saved = (() => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
})();
const settings = {
  timer: TIMERS.includes(saved.timer) ? saved.timer : DEFAULT_TIMER,
  mode: MODES.some((m) => m.id === saved.mode) ? saved.mode : 'single',
  filter: FILTERS.some((f) => f.id === saved.filter) ? saved.filter : 'none',
};
const currentMode = () => MODES.find((m) => m.id === settings.mode);
const currentFilter = () => FILTERS.find((f) => f.id === settings.filter);

function renderSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* 저장 못 해도 동작엔 지장 없음 */ }

  $('timer-btn').textContent = settings.timer ? `타이머 ${settings.timer}초` : '타이머 끔';
  $('timer-btn').classList.toggle('on', settings.timer > 0);
  $('mode-btn').textContent = currentMode().label;
  $('mode-btn').classList.toggle('on', settings.mode !== 'single');

  for (const chip of $('filters').children) {
    chip.setAttribute('aria-checked', String(chip.dataset.id === settings.filter));
  }
  video.style.filter = currentFilter().ops.map(([name, v]) => `${name}(${v})`).join(' ') || 'none';
}

for (const f of FILTERS) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.setAttribute('role', 'radio');
  chip.dataset.id = f.id;
  chip.dataset.lock = '';
  chip.textContent = f.label;
  chip.addEventListener('click', () => { settings.filter = f.id; renderSettings(); });
  $('filters').append(chip);
}

$('timer-btn').addEventListener('click', () => {
  settings.timer = TIMERS[(TIMERS.indexOf(settings.timer) + 1) % TIMERS.length];
  renderSettings();
});
$('mode-btn').addEventListener('click', () => {
  settings.mode = MODES[(MODES.findIndex((m) => m.id === settings.mode) + 1) % MODES.length].id;
  renderSettings();
});

// ---------- 카메라 ----------
let stream = null;
let facing = 'user';

const setStep = (step) => { app.dataset.step = step; };

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

async function startCamera() {
  stopCamera();
  $('shutter').disabled = true;
  $('camera-msg').hidden = true;

  if (!navigator.mediaDevices?.getUserMedia) {
    return cameraFailed('이 주소에서는 카메라를 쓸 수 없어요. HTTPS 주소나 localhost로 접속해주세요.');
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    video.srcObject = stream;
    video.classList.toggle('mirror', facing === 'user');
    await video.play();
    $('shutter').disabled = false;
  } catch (err) {
    cameraFailed(
      err.name === 'NotAllowedError'
        ? '카메라 권한이 꺼져 있어요. 브라우저 설정에서 카메라를 허용한 뒤 새로고침해주세요.'
        : '카메라를 열 수 없어요. 다른 앱이 카메라를 쓰고 있는지 확인해주세요.',
    );
  }
}

function cameraFailed(text) {
  $('camera-msg').textContent = text;
  $('camera-msg').hidden = false;
}

$('flip').addEventListener('click', () => {
  facing = facing === 'user' ? 'environment' : 'user';
  startCamera();
});

// ---------- 필터 계산 ----------
// 각 op을 [3x3 행렬, 오프셋(0~255)]로 바꿔 하나로 합친다. 식은 CSS filter 명세와 같다.
function opMatrix(name, v) {
  const s = 1 - v;
  switch (name) {
    case 'grayscale':
      return [[0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s,
               0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s,
               0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s], [0, 0, 0]];
    case 'sepia':
      return [[0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s,
               0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s,
               0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s], [0, 0, 0]];
    case 'saturate':
      return [[0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v,
               0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v,
               0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v], [0, 0, 0]];
    case 'brightness':
      return [[v, 0, 0, 0, v, 0, 0, 0, v], [0, 0, 0]];
    case 'contrast': {
      const o = 255 * (0.5 - 0.5 * v);
      return [[v, 0, 0, 0, v, 0, 0, 0, v], [o, o, o]];
    }
    default:
      throw new Error(`unknown filter op: ${name}`);
  }
}

function composeOps(ops) {
  let m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  let o = [0, 0, 0];
  for (const [name, v] of ops) {
    const [bm, bo] = opMatrix(name, v);
    const nm = [];
    const no = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        nm.push(bm[r * 3] * m[c] + bm[r * 3 + 1] * m[3 + c] + bm[r * 3 + 2] * m[6 + c]);
      }
      no.push(bm[r * 3] * o[0] + bm[r * 3 + 1] * o[1] + bm[r * 3 + 2] * o[2] + bo[r]);
    }
    m = nm;
    o = no;
  }
  return [m, o];
}

function applyFilter(ctx, w, h, ops) {
  if (!ops.length) return;
  const [m, o] = composeOps(ops);
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data; // Uint8ClampedArray: 0~255로 알아서 잘린다
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i] = m[0] * r + m[1] * g + m[2] * b + o[0];
    d[i + 1] = m[3] * r + m[4] * g + m[5] * b + o[1];
    d[i + 2] = m[6] * r + m[7] * g + m[8] * b + o[2];
  }
  ctx.putImageData(image, 0, 0);
}

// ---------- 사진 만들기 ----------
// 지금 화면에 보이는 그대로(좌우 반전·필터 포함) 한 컷을 캔버스로 뜬다.
function grabFrame(maxEdge) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.min(1, maxEdge / Math.max(vw, vh));
  const c = document.createElement('canvas');
  c.width = Math.round(vw * scale);
  c.height = Math.round(vh * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (video.classList.contains('mirror')) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, c.width, c.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  applyFilter(ctx, c.width, c.height, currentFilter().ops);
  return c;
}

// 4컷을 흰 프레임의 2x2로 합친다. 아래 여백에 날짜가 들어간다.
function composeFourCut(frames) {
  const { width: w, height: h } = frames[0];
  const pad = Math.round(w * 0.05);
  const gap = Math.round(w * 0.03);
  const footer = Math.round(w * 0.17);
  const c = document.createElement('canvas');
  c.width = pad * 2 + w * 2 + gap;
  c.height = pad + h * 2 + gap + footer;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  frames.forEach((f, i) => {
    ctx.drawImage(f, pad + (i % 2) * (w + gap), pad + Math.floor(i / 2) * (h + gap), w, h);
  });
  const now = new Date();
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('.');
  ctx.fillStyle = '#3a3d3b';
  ctx.font = `600 ${Math.round(w * 0.055)}px "Pretendard Variable", Pretendard, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(date, c.width / 2, c.height - footer / 2);
  return c;
}

const toBlob = (c) => new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- 촬영 진행 (타이머 · 여러 컷) ----------
let run = 0; // 촬영이 시작/취소될 때마다 올라간다. 값이 바뀌었으면 그 촬영은 취소된 것.
let busy = false;

function setBusy(next) {
  busy = next;
  app.toggleAttribute('data-busy', next);
  document.querySelectorAll('[data-lock]').forEach((el) => { el.disabled = next; });
  $('shutter').classList.toggle('cancel', next);
  $('shutter').setAttribute('aria-label', next ? '촬영 취소' : '촬영');
  if (!next) $('countdown').hidden = true;
}

async function countdown(seconds, token, caption) {
  $('countdown-cap').textContent = caption;
  $('countdown').hidden = false;
  for (let n = seconds; n > 0; n--) {
    $('countdown-num').textContent = n;
    if (!reducedMotion()) {
      $('countdown-num').animate(
        [{ transform: 'scale(1.25)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 300, easing: 'ease-out' },
      );
    }
    await sleep(1000);
    if (token !== run) return false;
  }
  $('countdown-num').textContent = '';
  return true;
}

function flash() {
  if (reducedMotion()) return;
  $('flash').animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
}

$('shutter').addEventListener('click', async () => {
  if (busy) { // 진행 중에 다시 누르면 취소
    run++;
    setBusy(false);
    return;
  }
  const token = ++run;
  const { shots } = currentMode();
  const wait = shots > 1 ? settings.timer || FOUR_CUT_DEFAULT_WAIT : settings.timer;
  setBusy(true);
  try {
    const frames = [];
    for (let i = 0; i < shots; i++) {
      if (wait && !(await countdown(wait, token, shots > 1 ? `${i + 1} / ${shots}` : ''))) return;
      flash();
      frames.push(grabFrame(shots > 1 ? CELL_MAX_EDGE : SINGLE_MAX_EDGE));
    }
    const result = shots > 1 ? composeFourCut(frames) : frames[0];
    review(await toBlob(result));
  } finally {
    if (token === run) setBusy(false);
  }
});

// ---------- 확인 · 업로드 ----------
let blob = null; // 확인 단계에 올라와 있는 사진

function review(nextBlob) {
  if (!nextBlob) return;
  blob = nextBlob;
  URL.revokeObjectURL($('preview').src);
  $('preview').src = URL.createObjectURL(blob);
  $('review-msg').textContent = '';
  $('save').disabled = false;
  stopCamera();
  setStep('review');
}

$('save').addEventListener('click', async () => {
  $('save').disabled = true;
  $('review-msg').textContent = '저장하는 중…';
  try {
    const res = await fetch('/api/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob,
    });
    if (!res.ok) throw new Error(res.status);
    const photo = await res.json();
    $('qr').src = photo.qrUrl;
    $('page-link').href = photo.pageUrl;
    $('page-link').textContent = photo.pageUrl.replace(/^https?:\/\//, '');
    $('download').href = photo.downloadUrl;
    setStep('done');
  } catch {
    $('review-msg').textContent = '저장하지 못했어요. 다시 눌러주세요.';
    $('save').disabled = false;
  }
});

function restart() {
  blob = null;
  setStep('camera');
  startCamera();
}
$('retake').addEventListener('click', restart);
$('again').addEventListener('click', restart);

renderSettings();
startCamera();
