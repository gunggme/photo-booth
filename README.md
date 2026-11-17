# photo-booth

사진을 찍으면 QR/링크가 나오고, 그 링크에서 사진을 다운로드 받는 서비스.

- 촬영 화면에서 찍고 → 확인하고 → 저장하면 QR이 뜬다.
- QR을 폰으로 찍으면 다운로드 페이지가 열린다.
- 사진은 서버를 돌리는 컴퓨터의 `uploads/` 폴더에 파일로 쌓인다. 클라우드나 DB는 쓰지 않는다.

## 빠른 실행 (내 컴퓨터에서만)

Node.js 20 이상이 필요하다.

```sh
npm install
npm start          # http://localhost:3000
npm run dev        # 파일이 바뀌면 자동 재시작
```

같은 컴퓨터의 브라우저에서 `http://localhost:3000`을 열면 된다.

> 브라우저 카메라는 **HTTPS 또는 localhost**에서만 열린다.
> 같은 와이파이의 폰에서 `http://192.168.x.x:3000`처럼 IP로 들어오면 카메라가 안 열리고 안내 문구만 나온다.
> 폰에서 찍거나, 폰으로 QR을 받아가려면 아래 "외부에서 접속하게 하기"를 따른다.

## 다른 컴퓨터(서버)에 설치하기

### 1. Node.js와 cloudflared 설치

Windows (PowerShell):

```powershell
winget install OpenJS.NodeJS.LTS
winget install Cloudflare.cloudflared
```

설치 후 PowerShell 창을 닫았다가 다시 열어야 `node`, `cloudflared` 명령이 잡힌다.

macOS:

```sh
brew install node cloudflared
```

Linux는 Node.js 20 이상과 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)를 배포판 방식대로 설치한다.

### 2. 코드 받기

zip 파일을 받았다면 원하는 위치에 풀고 그 폴더로 들어간다. 저장소에서 받으려면:

```sh
git clone https://github.com/gunggme/photo-booth.git
cd photo-booth
```

### 3. 의존성 설치 후 실행 확인

```sh
npm install
npm start
```

`photo-booth → http://localhost:3000`이 찍히고, 그 컴퓨터 브라우저에서 `http://localhost:3000`이 열리면 된다. 확인했으면 `Ctrl+C`로 끈다.

## 외부에서 접속하게 하기 (Cloudflare Tunnel)

공유기 포트포워딩 없이 HTTPS 주소를 받는 방법이다. 주소가 HTTPS라서 폰에서도 카메라가 열리고, LTE 폰으로 QR을 찍어도 사진이 받아진다.

### 방법 A. 임시 주소 (계정·도메인 불필요)

터미널 창을 두 개 쓴다.

**창 1 — 터널을 먼저 켠다**

```sh
cloudflared tunnel --url http://127.0.0.1:3000
```

로그에 `https://무작위-단어들.trycloudflare.com` 주소가 찍힌다. 이게 외부 주소다. 이 창은 켜둔다.

**창 2 — 그 주소를 넣어서 서버를 켠다**

Windows (PowerShell):

```powershell
$env:PUBLIC_BASE_URL="https://무작위-단어들.trycloudflare.com"
npm start
```

Windows (명령 프롬프트):

```bat
set PUBLIC_BASE_URL=https://무작위-단어들.trycloudflare.com
npm start
```

macOS / Linux:

```sh
PUBLIC_BASE_URL=https://무작위-단어들.trycloudflare.com npm start
```

`PUBLIC_BASE_URL`은 QR 코드에 들어가는 주소다. 이걸 안 넣고 `localhost:3000`으로 촬영하면 QR이 `localhost`를 가리켜서 폰에서 열리지 않는다.

알아둘 것:

- 터널을 껐다 켜면 **주소가 바뀐다.** 그때마다 새 주소로 서버를 다시 켜야 한다.
- 순서는 항상 터널 먼저, 서버 나중이다.
- 주소를 아는 사람은 누구나 사진을 올릴 수 있다. 주소는 필요한 사람에게만 알려준다.

### 방법 B. 고정 주소 (내 도메인 사용)

행사 내내 같은 주소를 쓰거나 계속 운영할 때 쓴다. Cloudflare 계정과, Cloudflare에 연결된 도메인이 필요하다.

```sh
cloudflared tunnel login
cloudflared tunnel create photo-booth
cloudflared tunnel route dns photo-booth photo.내도메인.com
```

`create`가 터널 ID와 인증 파일(`<터널ID>.json`) 경로를 알려준다. 그 값으로 설정 파일을 만든다.

- Windows: `C:\Users\<사용자>\.cloudflared\config.yml`
- macOS / Linux: `~/.cloudflared/config.yml`

```yaml
tunnel: photo-booth
credentials-file: C:\Users\<사용자>\.cloudflared\<터널ID>.json

ingress:
  - hostname: photo.내도메인.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

실행:

```sh
cloudflared tunnel run photo-booth
```

서버는 고정 주소를 넣어서 켠다.

```powershell
$env:PUBLIC_BASE_URL="https://photo.내도메인.com"
npm start
```

부팅할 때 터널이 자동으로 뜨게 하려면 Cloudflare Zero Trust 대시보드(Networks → Tunnels)에서 터널을 만들고, 거기서 보여주는 `cloudflared service install <토큰>` 명령을 관리자 권한 터미널에서 실행하는 쪽이 간단하다. 이 경우 주소 연결(Public Hostname)도 대시보드에서 `http://127.0.0.1:3000`으로 지정한다.

### 다른 방법

- **ngrok**: `ngrok http 3000`. 사용법이 비슷하고 무료 계정에 고정 주소가 하나 나온다. 받은 주소를 `PUBLIC_BASE_URL`에 넣는 것은 같다.
- **공유기 포트포워딩 + DDNS**: HTTPS 인증서를 직접 붙여야 하고 IP가 노출된다. 권하지 않는다.

## 운영할 때

- **촬영용 기기가 서버 컴퓨터 자신이면** 그 컴퓨터에서는 `http://localhost:3000`으로 열어도 카메라가 된다. 외부 주소는 QR로 받아가는 쪽에 필요하므로 `PUBLIC_BASE_URL`은 그대로 넣어야 한다.
- **절전을 끈다.** 컴퓨터가 잠들면 서버와 터널이 같이 멈춘다. (Windows: 설정 → 시스템 → 전원 → 절전 "안 함")
- **사진 위치**: 프로젝트 폴더의 `uploads/<id>.jpg`. 자동으로 지워지지 않으니 디스크를 가끔 확인하고, 행사가 끝나면 폴더를 비운다.
- **끄기**: 서버 창과 터널 창에서 각각 `Ctrl+C`.
- **코드 수정 반영**: `public/` 안의 파일은 새로고침만 하면 되고, `server.js`를 고치면 서버를 다시 켠다.

### 환경 변수

- `PORT` — 서버 포트 (기본 3000). 바꾸면 터널 명령의 포트도 같이 바꾼다.
- `PUBLIC_BASE_URL` — QR과 공유 링크에 들어갈 외부 주소. 비우면 요청이 들어온 주소를 그대로 쓴다.
- `UPLOAD_DIR` — 사진 저장 폴더 (기본 `./uploads`)

### 안 될 때

- **카메라 화면 대신 "이 주소에서는 카메라를 쓸 수 없어요"** — `http://` IP 주소로 들어온 것이다. 터널의 `https://` 주소나 `localhost`로 접속한다.
- **"카메라 권한이 꺼져 있어요"** — 브라우저 주소창의 사이트 설정에서 카메라를 허용하고 새로고침한다.
- **QR을 찍었는데 안 열린다** — QR 아래 표시된 주소가 `localhost`나 예전 터널 주소인지 본다. 그렇다면 `PUBLIC_BASE_URL`을 지금 터널 주소로 넣고 서버를 다시 켠다.
- **터널 주소가 502 / 연결 오류** — 서버가 꺼져 있거나 포트가 다르다. `npm start` 창이 살아 있는지, 터널 명령의 포트가 서버 포트와 같은지 본다.
- **`node` / `cloudflared` 명령을 못 찾는다 (Windows)** — 설치 후 터미널을 새로 연다.
- **`EADDRINUSE`** — 3000번 포트를 다른 프로그램이 쓰고 있다. `PORT`를 바꿔서 켠다.

## 기능

1. `/` — 촬영 → 확인 → 저장
   - 타이머: 끔 / 3초(기본) / 5초 / 10초 (촬영 중 셔터를 다시 누르면 취소)
   - 필터: 원본 / 흑백 / 따뜻 / 선명 / 화사
   - 결과물은 항상 1장, A4 가로 300dpi(3508x2480). 미리보기도 저장될 영역만 보이게 잘린다. 인쇄할 때 "실제 크기"로 뽑으면 A4에 꽉 찬다
   - 카메라는 지원하는 최대 해상도로 연다. 화질은 카메라에 달려 있다: 1080p 웹캠은 A4에서 눈에 띄게 뿌옇고, 4K(또는 4:3 고화소) 카메라를 써야 인쇄 품질이 나온다
   - 전면 카메라는 화면에 보이는 대로(좌우 반전) 저장된다
   - 설정은 브라우저에 저장돼 새로고침해도 유지된다
2. 저장되면 QR + 링크 표시
3. `/p/:id` — QR로 들어오는 다운로드 페이지

## API

- `POST /api/photos` — 본문에 JPEG 바이너리 (`Content-Type: image/jpeg`, 최대 15MB) → `{ id, pageUrl, fileUrl, downloadUrl, qrUrl }`
- `GET /api/photos/:id` — 메타 정보
- `GET /api/photos/:id/file` — 이미지 보기
- `GET /api/photos/:id/download` — 첨부파일로 다운로드
- `GET /api/photos/:id/qr` — 다운로드 페이지 QR (SVG)

## 구조

```
server.js          Express 서버 + API
public/index.html  촬영 화면
public/app.js      카메라 / 타이머 / 필터 / 업로드 로직
public/photo.html  다운로드 페이지
public/style.css
uploads/           저장된 사진 (git 제외)
```

## 아직 없는 것

- 사진 만료/삭제 (지금은 계속 쌓인다)
- 업로드 인증·요청 제한 (주소를 알면 누구나 올릴 수 있다)
- 프레임 디자인 고르기, 스티커/문구, 촬영음
- 외부 스토리지(S3 등), DB
