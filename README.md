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
2. **SQL Editor** → 아래 스키마 마이그레이션을 순서대로 실행
   - `001_initial.sql`
   - `004_minimal_auth.sql`
   - `005_limit_orders.sql`
   - `006_fixed_salary.sql`
   - `007_periodic_distributions.sql`
   - `008_game_accounts.sql`
   - `009_game_saves.sql`
   - `010_leaderboard.sql`
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
supabase functions deploy game-account
```

`game-account`는 첫 아이디 입력 시 이메일 확인 없는 내부 계정을 생성합니다.
PIN은 별도 테이블에 저장하지 않고 Supabase Auth 비밀번호 해시만 사용합니다.

`tick-market`은 anon key JWT + 시간 게이트(8초 내 재호출 무시)로 보호되어
별도 시크릿이 필요 없습니다.

### 3. 10초 tick 스케줄 (pg_cron)

`supabase/migrations/003_cron_10s.sql` 을 열어 `YOUR_PROJECT_REF`, `YOUR_ANON_KEY` 를
교체한 뒤 **SQL Editor** 에서 실행. (Dashboard → Integrations → Cron 에서도 확인 가능)
`002_cron_tick.sql`은 과거 1분 스케줄용이므로 신규 설치에서는 실행하지 않습니다.

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
| 고정급 지급 원장 | `salary_payments` | Edge Function `tick-market` + 원자 RPC |
| 월 분배·분기 배당 원장 | `distribution_events`, `distribution_payments` | Edge Function `tick-market` + 원자 RPC |

- **서버 시장 엔진**: pg_cron(10초) → Edge Function `tick-market` → 1틱 진행
- **주문**: 로그인 후 Edge Function `trade` (서버가 현재 시세로 체결, JWT 검증)
- **클라이언트**: 정적 페이지 + supabase-js (RLS로 보호) + Realtime 구독
- **공유 로직**: `src/lib/market/*` 이 원본, `supabase/functions/_shared/` 는
  `npm run sync:functions` 로 생성되는 복사본 (직접 수정 금지)

## 20거래일 고정급

- 계정 생성(로컬은 게임 초기화) 시점부터 20거래일마다 `$10,000`을 현금으로 지급합니다.
- 앱을 오래 닫아 여러 주기가 지난 경우 누락된 급여를 다음 실행에서 한 번에 정산합니다.
- Supabase 모드는 `salary_payments` 원장으로 같은 급여의 중복 지급을 막습니다.
- 금액과 주기는 `src/lib/market/salary.ts`의 `SALARY_AMOUNT`,
  `SALARY_INTERVAL_DAYS`에서 조정합니다. 변경 후 `npm run sync:functions`와
  `tick-market` 재배포가 필요합니다.

## 투자 현금흐름

- `VNCC`는 V-NASDAQ 하락을 그대로 반영하고 상승의 65%에 참여하면서 옵션
  프리미엄을 쌓는 커버드콜 ETF입니다. 20거래일마다 당시 기준가와 연 목표
  분배율을 바탕으로 변동형 월 분배금을 지급합니다.
- 일반 주식·ETF의 `quarterlyDividend`는 주당 센트 금액이며 60거래일마다
  분기 배당으로 지급합니다. 빈칸은 무배당입니다.
- 지급일 직전 보유 수량을 기준으로 입금하고, 지급액만큼 배당락 가격을 반영합니다.
- 앱이나 서버가 오래 멈춘 경우 밀린 회차를 이어서 처리합니다. 서버 모드는 지급
  이벤트·보유 수량·현금 입금을 한 트랜잭션에 기록해 재시도 중복을 막습니다.

## 차트와 종목명

- 종목 차트는 `1분`, `일`, `주`, `월` 봉을 전환할 수 있습니다. 게임 기준
  1거래일은 3시간이며, 주봉은 5거래일, 월봉은 20거래일을 집계합니다.
- 화면에는 한국어 종목명을 표시하고 티커는 영문을 유지합니다. CSV 원문명은
  보존하며 표시명 번역은 `src/data/stocks.ts`의 `KOREAN_STOCK_NAMES`에서 관리합니다.

## 종목(캐릭터 회사) 추가 — CSV

`data/companies.csv` 에 한 줄 추가 후 `npm run import:companies` 실행.
(생성물 `src/data/generated.ts` 는 직접 수정 금지)

| 컬럼 | 필수 | 설명 | 예시 |
|---|---|---|---|
| `ticker` | ✅ | 영문 대문자·숫자 1~6자, 고유. id는 소문자 변환 | `RIDC` |
| `name` | ✅ | 회사명 | `RIO Defense Corporation` |
| `sector` | ✅ | 섹터 — 같은 문자열끼리 섹터 이벤트로 묶임 | `방산` |
| `subsector` | | 선택형 세부 섹터 — 표시와 검색에 사용하며 빈칸이면 기본 분류 적용 | `병기 제조` |
| `initialPrice` | ✅ | 상장가, 양의 정수(원) | `98000` |
| `volatility` | ✅ | 틱당 변동성 계수, 0.01~0.06 권장 | `0.03` |
| `drift` | ✅ | 장기 성향, -0.001~0.002 권장 | `0.0005` |
| `beta` | ✅ | 시장(선물) 민감도, 1 = 시장과 동일 | `0.7` |
| `description` | | 회사 한 줄 소개 | `궤도 방위 시스템...` |
| `logo` | | 로고 경로/URL. 빈칸이면 `public/logos/<id>.png` 자동 시도, 그것도 없으면 티커 이니셜 | `/logos/ridc.png` |
| `eventBias` | | 이벤트 태그별 가중치 `태그:배수;태그:배수` (기본 1) | `수주:4;스캔들:0.5` |
| `ceoName` | | 캐릭터 이름 (빈칸이면 캐릭터 없는 회사) | `츠카츠키 리오` |
| `ceoTitle` | | 직함 (기본 CEO) | `CEO` |
| `ceoTraits` | | 성격 태그, 세미콜론 구분 | `천재;은둔형;회피형` |
| `ceoBio` | | 캐릭터 한 줄 설정 | `모습을 드러내지 않고...` |
| `ceoEmoji` | | 아바타 이모지 (기본 👤) | `🛰️` |
| `etfHoldings` | | ETF 구성종목 `티커:비중;티커:비중` — 설정 시 NAV 추종(가격이 구성종목 가중 수익률을 따라감), 비중 자동 정규화 | `BAGDI:0.3;BAVTS:0.2` |
| `quarterlyDividend` | | 60거래일마다 지급할 주당 배당금(센트). 빈칸은 무배당 | `125` |

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
