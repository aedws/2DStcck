-- 일회성 정상화: 모든 유저 게임 진행(지갑·랭킹)만 초기화한다.
-- 계정(auth.users / game_accounts)은 유지한다.
--
-- 유저에게 초기화 권한을 주지 않는다. 이 파일은 Supabase SQL Editor에서
-- 프로젝트 소유자가 직접 한 번 실행한다. 앱 RPC/UI로 노출하지 말 것.
--
-- WALLET_EPOCH=2 배포와 함께 실행:
--   1) 클라이언트가 구세대(분배 복제·비정상 자산) 로컬 지갑을 폐기한다.
--   2) 아래 truncate 로 서버 저장분·랭킹을 비운다.
--   3) 유저가 다시 로그인하면 초기 자금으로 새 game_saves 가 올라간다.

truncate table public.leaderboard;
truncate table public.game_saves;
