# 2DStock — 가상 모의투자

토스증권 스타일 UI의 웹 모의투자 게임.

**시장은 항상 클라이언트에서 고정 기원점 기반 결정론으로 계산**되므로, 모든
플레이어가 서버 없이도 **같은 시장**을 봅니다. **Supabase는 별도 "서버 시장
모드"가 아니라 계정 레이어**(로그인·지갑 저장·랭킹) 전용입니다. 프론트엔드는
**정적 사이트(GitHub Pages)**로 배포하며 Vercel이 필요 없습니다.

## 로컬 개발

```bash
# 루트에 .env.local 생성 (아래 두 값 필수 — 로그인·랭킹에 사용)
#   NEXT_PUBLIC_SUPABASE_URL=...
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
npm install
npm run dev
```

브라우저: http://localhost:3000 — 지갑은 LocalStorage에 저장되고, 로그인하면
클라우드(Supabase)에 동기화됩니다.

## 배포 (GitHub Pages + Supabase)

### 1. Supabase 프로젝트

시장은 클라이언트가 계산하므로 Supabase에는 **계정 레이어**(로그인·지갑 저장·랭킹)만 있으면 됩니다.

1. [supabase.com](https://supabase.com) 에서 프로젝트 생성
2. **SQL Editor** → 계정 레이어 마이그레이션을 순서대로 실행
   - `20260705051226_minimal_auth.sql`
   - `20260712111614_game_accounts.sql`
   - `20260712113126_game_saves.sql`
   - `20260713050503_leaderboard.sql`
   - `20260713102800_leaderboard_extra.sql`
   - `20260713113917_basic_leaderboard_integrity.sql`
   - `20260713121554_leaderboard_permissions.sql`
3. **Authentication** → Email 활성화

> `initial_schema`, `cron_tick_market`, `cron_tick_10s`, `limit_orders`,
> `fixed_salary`, `periodic_distributions` 마이그레이션은 예전 "서버 시장 엔진"(가격을 서버에서
> 틱하던 구조)의 잔재로, 현재 클라이언트 로컬 시장에서는 **사용하지 않습니다.**
> 이력 보존용으로만 남겨 두었으니 신규 설치에서는 실행하지 않아도 됩니다.

### 2. Edge Function 배포 (game-account 하나)

```bash
npm i -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF

supabase functions deploy game-account
```

`game-account`는 첫 아이디 입력 시 이메일 확인 없는 내부 계정을 생성합니다.
PIN은 별도 테이블에 저장하지 않고 Supabase Auth 비밀번호 해시만 사용합니다.
시장을 서버에서 틱하지 않으므로 `tick-market`·`trade` 함수나 pg_cron 스케줄은
필요 없습니다.

### 3. GitHub Pages

1. GitHub 저장소 생성 후 push (`main` 브랜치)
2. Supabase 값 주입 — 둘 중 하나:
   - `.github/workflows/deploy.yml` 의 `env:` 에 직접 기입 (anon 키는 공개용이라 안전)
   - 또는 **Settings → Secrets and variables → Actions** 에 등록 후 워크플로에서 참조
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. **Settings → Pages → Source: GitHub Actions** 선택
4. push 하면 `.github/workflows/deploy.yml` 이 자동 빌드·배포
   - 프로젝트 페이지: `https://<user>.github.io/<repo>/`
   - `<user>.github.io` 저장소라면 워크플로의 `NEXT_PUBLIC_BASE_PATH` 줄 삭제
5. **Supabase → Authentication → URL Configuration** 의 Site URL을 Pages 주소로 설정

## 아키텍처

**시장(주가·호가·이벤트·급여·배당)은 전부 클라이언트에서 고정 기원점 기반
결정론으로 계산**되므로 서버가 필요 없습니다. Supabase는 아래 계정 데이터만
담당합니다.

| 구분 | 저장 위치 | 비고 |
|---|---|---|
| 로그인 계정 | Supabase Auth + `game_accounts` | 아이디+PIN, Edge Function `game-account` |
| 유저 지갑 (현금·보유·거래·회차·사치재) | `game_saves` (JSON 1행) | supabase-js 직접 upsert, 본인 행 RLS |
| 순자산 랭킹 | `leaderboard` | 공개 읽기 + 검증 RPC 쓰기, RLS |

랭킹 쓰기는 `20260713113917_basic_leaderboard_integrity.sql`과
`20260713121554_leaderboard_permissions.sql` 적용 후 `submit_leaderboard` RPC만
허용합니다. 서버가 저장 지갑·수익률·시장 회차·급격한 자산 점프를 기본 검증합니다.
완전한 e스포츠급 검증이 아니라 캐주얼 경쟁의 단순 조작 억제용입니다.

## 연속 시장 사건과 투자 의뢰

- 5거래일마다 캐릭터 회사 하나를 중심으로 `발표 예고 → 단서 → 결말` 사건이 진행됩니다.
- 캐릭터 성격 태그에 따라 단서 신뢰도가 달라지며, 결말 전 현물·공매도·옵션으로 대응할 수 있습니다.
- 단서 공개 후 `상승 베팅·하락 헤지·관망` 중 하나를 고르면 결말에 따라 투자 평판을 얻거나 잃습니다.
- 성장·시장 초과·리스크 관리 의뢰 중 하나를 선택하면 수락 시점부터 5거래일간 진행됩니다.
- 의뢰 보상은 현금이 아니라 투자 평판이므로 시장 재화 인플레이션을 만들지 않습니다.
- 사치재는 구매가의 70%만 순자산으로 인정되며 나머지 30%는 소비·감가됩니다.

## 거래일 마감 성적표

- 직전 3시간 거래일의 실현손익·승률·회전율·최고/최악 청산·마진콜을 계산해 S~F 등급을 표시합니다.
- 성적표는 거래 기록을 평가만 하며 현금이나 보유 포지션에는 영향을 주지 않습니다.

## 시장 국면 카드와 사건 결과 기록관

- 위험 선호·위험 회피·변동성 폭풍·저변동 상승 중 하나의 국면이 5거래일 동안 유지되며, 위험자산 방향과 변동성 배율에 실제로 반영됩니다.
- 별도로 200거래일 장기 사이클이 저점 축적 → 돌파 급상승 → 확장 → 과열 급등 → 급조정 → 회복 → 박스권 → 후반 랠리 순으로 진행됩니다.
- 각 거래일의 사이클 강도는 결정론적 펄스와 역방향 숨 고르기로 달라지며, 조정기에는 변동성과 뉴스 충격이 커집니다.
- 기업 종목은 명시 베타가 없어도 기본 시장 베타 0.65를 적용해 지수 공통 충격에 동반 반응하고, 채권은 낮은 음의 베타로 방어 성격을 가집니다.
- V-나스닥 200거래일 결정론 검증은 약 +19.45%로, 급등락을 포함하면서 장기적으로 우상향하도록 조정돼 있습니다.
- `/decisions` 기록관은 최근 사건 판단 30건의 단서·선택·결말·평판을 보존하고 적중·오판·관망별로 조회합니다.
- 회사 뉴스 대사는 이벤트 충격의 부호를 함께 확인하므로 악재 뉴스에 낙관적인 대사가 붙지 않습니다.

- **시장 엔진**: `src/lib/market/*` — 접속 시각까지 결정론으로 리플레이해 모두가 동일 상태에 도달
- **매매·급여·배당**: 클라이언트 로컬 정산 (`trading.ts`, `cashflows.ts`)
- **클라이언트**: 정적 페이지 + supabase-js (로그인·지갑·랭킹만)

## 20거래일 고정급

- 계정 생성(로컬은 게임 초기화) 시점부터 20거래일마다 `$10,000`을 현금으로 지급합니다.
- 앱을 오래 닫아 여러 주기가 지난 경우 누락된 급여를 다음 실행에서 한 번에 정산합니다.
- 지급 내역은 로컬 `cashPayments` 원장으로 중복 없이 정산하고, 로그인 시 지갑과
  함께 클라우드에 저장됩니다.
- 금액과 주기는 `src/lib/market/salary.ts`의 `SALARY_AMOUNT`,
  `SALARY_INTERVAL_DAYS`에서 조정합니다.

## 투자 현금흐름

- `VNCC`는 V-NASDAQ 상승·하락의 65%에 참여하면서 옵션 프리미엄을 쌓고
  20거래일마다 변동형 분배금을 지급합니다.
- 캐릭터 기업의 단일 종목 커버드콜은 기초자산 상승·하락을 0.7배로 추종하고,
  종목 id로 결정되는 연 목표 30~45%를 5거래일 단위 변동형 분배금으로 지급합니다.
- 종목 목록의 `커버드콜` 필터에서 지수형과 단일 종목형을 함께 확인합니다.
- 도감 관계 우선순위는 레버리지(핑크) → 인버스·곱버스 적대(빨강) →
  커버드콜(노랑) → 일반 보유(파랑)입니다. 인버스만 보유하면 상세 도감은 잠깁니다.
- 일반 주식·ETF의 `quarterlyDividend`는 주당 센트 금액이며 60거래일마다
  분기 배당으로 지급합니다. 빈칸은 무배당입니다.
- 지급일 직전 보유 수량을 기준으로 입금하고, 지급액만큼 배당락 가격을 반영합니다.
- 앱을 오래 닫아 여러 회차가 밀린 경우 다음 실행에서 이어서 정산하며, 로컬
  `cashPayments` 원장으로 같은 회차의 중복 지급을 막습니다.

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
| `npm run import:companies` | `data/companies.csv` → 종목·캐릭터 생성 |
