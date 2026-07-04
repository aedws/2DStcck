# 2DStock — 가상 모의투자

토스증권 스타일 UI의 웹 모의투자 게임. Supabase 연동 시 **모든 유저가 같은 시장**을 봅니다.
프론트엔드는 **정적 사이트(GitHub Pages)**, 서버 로직은 **Supabase Edge Functions**로 동작합니다. Vercel 불필요.

## 로컬 개발 (Supabase 없음)

```bash
npm install
npm run dev
```

브라우저: http://localhost:3000 — 각 PC마다 독립 시장 (LocalStorage)

## 배포 (GitHub Pages + Supabase)

### 1. Supabase 프로젝트

1. [supabase.com](https://supabase.com) 에서 프로젝트 생성
2. **SQL Editor** → `supabase/migrations/001_initial.sql` 실행
3. **Authentication** → Email 활성화

### 2. Edge Functions 배포

```bash
npm i -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# 시장 tick 로직이 바뀌었으면 먼저 동기화
npm run sync:functions

supabase functions deploy tick-market
supabase functions deploy trade
```

`tick-market`은 anon key JWT + 시간 게이트(50초 내 재호출 무시)로 보호되어
별도 시크릿이 필요 없습니다.

### 3. 1분 tick 스케줄 (pg_cron)

`supabase/migrations/002_cron_tick.sql` 을 열어 `YOUR_PROJECT_REF`, `YOUR_ANON_KEY` 를
교체한 뒤 **SQL Editor** 에서 실행. (Dashboard → Integrations → Cron 에서도 확인 가능)

### 4. GitHub Pages

1. GitHub 저장소 생성 후 push (`main` 브랜치)
2. **Settings → Secrets and variables → Actions** 에 등록:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. **Settings → Pages → Source: GitHub Actions** 선택
4. push 하면 `.github/workflows/deploy.yml` 이 자동 빌드·배포
   - 프로젝트 페이지: `https://<user>.github.io/<repo>/`
   - `<user>.github.io` 저장소라면 워크플로의 `NEXT_PUBLIC_BASE_PATH` 줄 삭제
5. **Supabase → Authentication → URL Configuration** 의 Site URL을 Pages 주소로 설정

## 아키텍처

| 구분 | 저장 위치 | 동기화 |
|---|---|---|
| 주가·호가·이벤트 | `market_global` (Supabase) | Realtime |
| 유저 현금·보유 | `profiles`, `holdings` | supabase-js 직접 조회 + Realtime |
| 거래 | `trades` | Edge Function `trade` |

- **서버 시장 엔진**: pg_cron(1분) → Edge Function `tick-market` → 10틱 진행
- **주문**: 로그인 후 Edge Function `trade` (서버가 현재 시세로 체결, JWT 검증)
- **클라이언트**: 정적 페이지 + supabase-js (RLS로 보호) + Realtime 구독
- **공유 로직**: `src/lib/market/*` 이 원본, `supabase/functions/_shared/` 는
  `npm run sync:functions` 로 생성되는 복사본 (직접 수정 금지)

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run dev:clean` | `.next` 삭제 후 dev |
| `npm run build` | 정적 export 빌드 (`out/`) |
| `npm run sync:functions` | 시장 로직을 Edge Functions로 복사 |
