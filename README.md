# 2DStock — 가상 모의투자

토스증권 스타일 UI의 웹 모의투자 게임. Supabase 연동 시 **모든 유저가 같은 시장**을 봅니다.

## 로컬 개발 (Supabase 없음)

```bash
npm install
npm run dev
```

브라우저: http://localhost:3000 — 각 PC마다 독립 시장 (LocalStorage)

## Supabase + Vercel 배포 (공통 시장 MVP)

### 1. Supabase 프로젝트

1. [supabase.com](https://supabase.com) 에서 프로젝트 생성
2. **SQL Editor** → `supabase/migrations/001_initial.sql` 내용 실행
3. **Authentication** → Email 활성화
4. **Settings → API** 에서 URL / anon key / service_role key 복사

### 2. 환경 변수

`.env.local` (로컬) 및 Vercel Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=랜덤_긴_문자열
```

### 3. Vercel 배포

```bash
npm i -g vercel
vercel
```

Vercel 대시보드에서 위 env 변수 등록.

`vercel.json` cron이 **매 1분** `/api/cron/tick-market` 호출 → 10틱씩 시장 진행.

### 4. GitHub

```bash
git init
git add .
git commit -m "feat: Supabase shared market MVP"
gh repo create 2dstock --public --source=. --push
```

## 아키텍처

| 구분 | 저장 위치 | 동기화 |
|---|---|---|
| 주가·호가·이벤트 | `market_global` (Supabase) | Realtime |
| 유저 현금·보유 | `profiles`, `holdings` | API + Realtime |
| 거래 | `trades` | API |

- **서버 시장 엔진**: Vercel Cron → `/api/cron/tick-market`
- **주문**: 로그인 후 `/api/trade` (서버가 현재 시세로 체결)
- **클라이언트**: Supabase Realtime 구독 (`MarketServerSync`)

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run dev:clean` | `.next` 삭제 후 dev |
| `npm run build` | 프로덕션 빌드 |
