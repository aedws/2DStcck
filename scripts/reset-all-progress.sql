-- 일회성 정상화: 모든 유저 게임 진행(지갑·랭킹)만 초기화한다.
-- 계정(auth.users / game_accounts)은 유지한다.
--
-- 유저에게 초기화 권한을 주지 않는다. 이 파일은 Supabase SQL Editor에서
-- 프로젝트 소유자가 직접 한 번 실행한다. 앱 RPC/UI로 노출하지 말 것.
--
-- 실행 후:
--   1) 클라이언트의 WALLET_EPOCH=1 배포가 함께 나가면 로컬 구세대 지갑도 폐기된다.
--   2) 유저가 다시 로그인하면 초기 자금으로 새 game_saves 가 올라간다.

truncate table public.leaderboard;
truncate table public.game_saves;
