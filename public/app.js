const $ = (id) => document.getElementById(id);
const app = document.querySelector('.app');
const video = $('video');

const JPEG_QUALITY = 0.95;
// 결과물은 항상 1장, A4 가로(297x210mm) 300dpi.
const PAGE = [3508, 2480];
const PAGE_ASPECT = PAGE[0] / PAGE[1];
const PRINT_DPI = 300;
const SHARPEN = 0.15; // 확대 전에 걸어주는 선명화 세기 (0이면 끔)

const TIMERS = [0, 3, 5, 10];
const DEFAULT_TIMER = 3;
const STORAGE_KEY = 'photo-booth:v2'; // 기본값을 바꾸면 올려서 예전 저장값을 버린다
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
  filter: FILTERS.some((f) => f.id === saved.filter) ? saved.filter : 'none',
};
const currentFilter = () => FILTERS.find((f) => f.id === settings.filter);

// 미리보기도 저장될 영역(A4 가로)만 보이게 자른다 (가운데 기준, grabFrame과 같은 방식)
video.style.setProperty('--crop', PAGE_ASPECT);

function renderSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* 저장 못 해도 동작엔 지장 없음 */ }

  $('timer-btn').textContent = settings.timer ? `타이머 ${settings.timer}초` : '타이머 끔';
  $('timer-btn').classList.toggle('on', settings.timer > 0);

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
      // 카메라가 낼 수 있는 가장 큰 해상도를 받는다. 4:3쪽으로 물어봐야 4:3 센서(폰 등)의
      // 최대 모드가 골라지고, A4 가로(1.41)로 자를 때 버리는 픽셀도 16:9보다 적다.
      video: { facingMode: facing, width: { ideal: 4096 }, height: { ideal: 3072 } },
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
// 가운데를 aspect 비율로 잘라내고, 카메라 원본 픽셀 그대로(축소 없이) 뜬다.
function grabFrame(aspect) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  let sw = vw;
  let sh = vh;
  if (vw / vh > aspect) sw = vh * aspect;
  else sh = vw / aspect;
  const c = document.createElement('canvas');
  c.width = Math.round(sw);
  c.height = Math.round(sh);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (video.classList.contains('mirror')) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  // 잘라낸 영역이 가운데라 좌우 반전 전후 위치가 같다
  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  applyFilter(ctx, c.width, c.height, currentFilter().ops);
  sharpen(ctx, c.width, c.height, SHARPEN);
  return c;
}

// 원본 해상도에서 가볍게 선명하게 해두면 A4로 키웠을 때 덜 뿌옇다.
// 라플라시안 샤프닝: 자기 + a*(자기*4 - 상하좌우). 테두리 1px은 그대로.
function sharpen(ctx, w, h, a) {
  if (!a) return;
  const image = ctx.getImageData(0, 0, w, h);
  const s = image.data;
  const d = new Uint8ClampedArray(s);
  const row = w * 4;
  const k = 1 + 4 * a;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * row + x * 4;
      for (let j = i; j < i + 3; j++) {
        d[j] = k * s[j] - a * (s[j - 4] + s[j + 4] + s[j - row] + s[j + row]);
      }
    }
  }
  image.data.set(d);
  ctx.putImageData(image, 0, 0);
}

function resizeTo(src, [w, h]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

const toBlob = (c) => new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));

// JFIF 헤더(APP0)의 해상도를 dpi로 고친다. 인쇄할 때 '실제 크기'로 뽑으면 용지 크기가 된다.
// 브라우저가 JFIF 헤더를 안 넣었으면 그대로 둔다.
async function withDpi(jpeg, dpi) {
  const b = new Uint8Array(await jpeg.arrayBuffer());
  const jfif = b[2] === 0xff && b[3] === 0xe0 && String.fromCharCode(...b.subarray(6, 11)) === 'JFIF\0';
  if (!jfif) return jpeg;
  b[13] = 1; // 단위: inch
  b[14] = b[16] = dpi >> 8;
  b[15] = b[17] = dpi & 0xff;
  return new Blob([b], { type: 'image/jpeg' });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- 촬영 진행 (타이머) ----------
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

async function countdown(seconds, token) {
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
  setBusy(true);
  try {
    if (settings.timer && !(await countdown(settings.timer, token))) return;
    flash();
    const jpeg = await toBlob(resizeTo(grabFrame(PAGE_ASPECT), PAGE));
    review(jpeg && await withDpi(jpeg, PRINT_DPI));
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
