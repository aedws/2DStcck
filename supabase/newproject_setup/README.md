# 새 Supabase 프로젝트로 이전하기

기존 org가 무료 한도를 초과해(전체 API 402) 새 org의 새 프로젝트로 옮깁니다.
시장은 100% 클라이언트 계산이라 백엔드는 **로그인·저장·리더보드**만 담당합니다.

## 순서

### 1. 새 프로젝트 생성 (본인)
- 새 org 안에서 **New project** 생성 (region: **ap-northeast-2 (Seoul)** 권장)

### 2. 스키마 넣기 (본인)
- 새 프로젝트 → **SQL Editor** → `01_schema.sql` 전체 붙여넣기 → Run
- 테이블·함수·트리거·RLS·RPC(`register_game_account` 등)가 생성됩니다.

### 3. 데이터 넣기 (본인)
- 같은 SQL Editor에서 **`02_data.sql`**(별도 전달, 비공개) 붙여넣기 → Run
- 계정 15명(비밀번호 유지)+저장데이터+리더보드가 들어가고, `auth.users` 삽입 시
  트리거가 `profiles`·`game_accounts`를 자동 생성합니다.
- ⚠️ `02_data.sql`은 비밀번호 해시가 있어 **공개 저장소에 커밋하지 않습니다.**

### 4. 키 알려주기 (본인 → 나)
- 새 프로젝트 → **Settings → API** 에서 아래 2개를 전달:
  - `Project URL` (예: `https://xxxx.supabase.co`)
  - `anon public` key

### 5. 앱 연결 교체 + 배포 (내가)
- `src/lib/supabase/client.ts`와 `.github/workflows/deploy.yml`의 URL/anon key를
  새 프로젝트로 교체 → main 머지 → 자동 배포

## 확인 팁
- 스키마 실행 후: `select count(*) from public.game_accounts;` → 0 (아직 데이터 전)
- 데이터 실행 후: `select count(*) from public.game_saves;` → 15,
  `select count(*) from public.game_accounts;` → 15
- 로그인 테스트: 새 배포에서 `dorothy`로 로그인되면 성공

## 안 터지게 (무료 유지)
- Edge Function은 **배포하지 않음** → 호출 0
- tick 크론 **없음** (이 스키마에 포함 안 됨)
- 클라이언트 `/user` 폭주는 `getSession()`으로 이미 제거
- → 무료 한도(egress 5GB/월 등)를 15명 규모로는 거의 안 씁니다.
