# 작업 지침

## 브랜치·머지 방침

- 작업은 지정된 feature 브랜치에서 진행하되, **완료·검증된 변경은 항상 `main`까지 머지해서 푸시한다** (소유자 승인: 2026-07-20). 별도 PR 승인 대기 없이 fast-forward 머지를 우선 사용하고, fast-forward가 불가능하면 일반 머지 커밋을 만든다.
- 머지 전 최소 검증: `npx tsc --noEmit` + `npm run build` (빌드가 체크포인트 재생성과 market-bootstrap 테스트를 포함한다).

## 리포지토리 메모

- 게임 현금 단위는 **센트**다. 예: `INITIAL_CASH = 10_000_000` = $100,000, $10M = `1_000_000_000`.
- `src/data/market-checkpoint.json`은 `npm run build` 시 자동 재생성된다 — 재생성본을 그대로 커밋해도 된다.
- **프로덕션 Supabase는 `fzkrnzxflfvpmmkeaxlj`다** (`src/lib/supabase/client.ts`에 하드코딩, 조직 `ttbixghvantcnfjwbwyg`). 2026-07-21부터 Supabase MCP가 이 프로젝트에 연결돼 있다 — `list_projects`에 이 프로젝트가 보이는지 먼저 확인하고 작업할 것. 다른 조직의 "2DStock"(`mhhyolagigidjwecelet`)은 데이터가 2026-07-13에 멈춘 옛 프로젝트다.
- 버그 리포트 회신은 `bug_reports.status`/`admin_note`를 SQL로 갱신하면 되고, `fixed` 처리 시 클라이언트가 다음 접속에서 보상 $50,000를 자동 지급한다(`resolveBugReports`, 멱등).
- Supabase 마이그레이션 파일이 라이브 DB에 적용돼 있다고 가정하지 말 것.
- 전 계정 1회 보상은 `src/lib/market/operationalCompensation.ts`의 `OPERATIONAL_COMPENSATIONS`에 항목을 추가하면 된다(지갑 `claimedCompensationIds`로 멱등 지급).
