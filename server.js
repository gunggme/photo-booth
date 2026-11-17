import express from 'express';
import QRCode from 'qrcode';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
// QR/공유 링크에 들어갈 외부 주소. 비워두면 요청의 Host 헤더를 쓴다.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const MAX_BYTES = 15 * 1024 * 1024;

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

await mkdir(UPLOAD_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');

const newId = () => randomBytes(8).toString('base64url'); // 11자
const fileOf = (id) => path.join(UPLOAD_DIR, `${id}.jpg`);
const baseUrl = (req) => PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
const isJpeg = (buf) => buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

// :id 가 들어간 모든 라우트에서 형식 검증 + 파일 존재 확인
app.param('id', async (req, res, next, id) => {
  if (!ID_RE.test(id)) return res.status(404).json({ error: 'not_found' });
  try {
    req.photo = { id, file: fileOf(id), stat: await stat(fileOf(id)) };
    next();
  } catch {
    res.status(404).json({ error: 'not_found' });
  }
});

// 업로드: 본문에 JPEG 바이너리를 그대로 보낸다.
app.post(
  '/api/photos',
  express.raw({ type: 'image/jpeg', limit: MAX_BYTES }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !isJpeg(req.body)) {
      return res.status(415).json({ error: 'jpeg_required' });
    }
    const id = newId();
    await writeFile(fileOf(id), req.body);
    res.status(201).json({
      id,
      pageUrl: `${baseUrl(req)}/p/${id}`,
      fileUrl: `/api/photos/${id}/file`,
      downloadUrl: `/api/photos/${id}/download`,
      qrUrl: `/api/photos/${id}/qr`,
    });
  },
);

app.get('/api/photos/:id', (req, res) => {
  const { id, stat: s } = req.photo;
  res.json({ id, bytes: s.size, createdAt: s.mtime.toISOString() });
});

app.get('/api/photos/:id/file', (req, res) => {
  res.type('image/jpeg').sendFile(req.photo.file);
});

app.get('/api/photos/:id/download', (req, res) => {
  res.download(req.photo.file, `photo-${req.photo.id}.jpg`);
});

app.get('/api/photos/:id/qr', async (req, res) => {
  const svg = await QRCode.toString(`${baseUrl(req)}/p/${req.photo.id}`, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  res.type('image/svg+xml').send(svg);
});

// 다운로드 페이지 (QR로 들어오는 곳)
app.get('/p/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'photo.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large' });
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

app.listen(PORT, () => {
  console.log(`photo-booth → http://localhost:${PORT}`);
});
