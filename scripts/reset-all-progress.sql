-- 일회성 정상화: 모든 유저 게임 진행(지갑·랭킹)만 초기화한다.
-- 계정(auth.users / game_accounts)은 유지한다.
--
-- 유저에게 초기화 권한을 주지 않는다. 이 파일은 Supabase SQL Editor에서
-- 프로젝트 소유자가 직접 한 번 실행한다. 앱 RPC/UI로 노출하지 말 것.
--
-- WALLET_EPOCH=3 배포와 함께 실행:
--   1) 클라이언트가 구 LocalStorage(분배 복제 잔액)를 폐기한다.
--   2) 아래 truncate 로 서버 저장분·랭킹을 비운다.
--   3) 유저가 새로고침·로그인하면 초기 자금으로 새 game_saves 가 올라간다.
--
-- 주의: SQL만 먼저 실행하고 구 클라이언트가 접속하면 로컬 복제 자산이
-- 다시 클라우드로 올라갈 수 있다. 배포 후 새로고침 → 필요 시 재 truncate.

truncate table public.leaderboard;
truncate table public.game_saves;
