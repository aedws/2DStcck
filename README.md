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

## 종목(캐릭터 회사) 추가 — CSV

`data/companies.csv` 에 한 줄 추가 후 `npm run import:companies` 실행.
(생성물 `src/data/generated.ts` 는 직접 수정 금지)

| 컬럼 | 필수 | 설명 | 예시 |
|---|---|---|---|
| `ticker` | ✅ | 영문 대문자·숫자 1~6자, 고유. id는 소문자 변환 | `RIDC` |
| `name` | ✅ | 회사명 | `RIO Defense Corporation` |
| `sector` | ✅ | 섹터 — 같은 문자열끼리 섹터 이벤트로 묶임 | `방산` |
| `initialPrice` | ✅ | 상장가, 양의 정수(원) | `98000` |
| `volatility` | ✅ | 틱당 변동성 계수, 0.01~0.06 권장 | `0.03` |
| `drift` | ✅ | 장기 성향, -0.001~0.002 권장 | `0.0005` |
| `beta` | ✅ | 시장(선물) 민감도, 1 = 시장과 동일 | `0.7` |
| `description` | | 회사 한 줄 소개 | `궤도 방위 시스템...` |
| `eventBias` | | 이벤트 태그별 가중치 `태그:배수;태그:배수` (기본 1) | `수주:4;스캔들:0.5` |
| `ceoName` | | 캐릭터 이름 (빈칸이면 캐릭터 없는 회사) | `츠카츠키 리오` |
| `ceoTitle` | | 직함 (기본 CEO) | `CEO` |
| `ceoTraits` | | 성격 태그, 세미콜론 구분 | `천재;은둔형;회피형` |
| `ceoBio` | | 캐릭터 한 줄 설정 | `모습을 드러내지 않고...` |
| `ceoEmoji` | | 아바타 이모지 (기본 👤) | `🛰️` |

- UTF-8 인코딩. 필드에 쉼표가 들어가면 `"..."` 로 감싼다(엑셀 저장 그대로 OK).
- 현재 이벤트 태그: `수주` `신제품` `실적` `스캔들` `행보` (company) — `eventBias` 로 회사별 발생 확률을 조절.
- 이미 코드에 있는 티커(지수·선물·기본 회사)와 id가 겹치면 CSV가 우선한다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run dev:clean` | `.next` 삭제 후 dev |
| `npm run build` | 정적 export 빌드 (`out/`) |
| `npm run sync:functions` | 시장 로직을 Edge Functions로 복사 |
| `npm run import:companies` | `data/companies.csv` → 종목·캐릭터 생성 (+sync) |
