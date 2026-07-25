-- 마지막 보유자가 전량 상환하면 total_shares가 0이 되어야 하는데, 기존 제약
-- (total_shares > 0)이 이를 거부해 잔여 좌(예: KOELP 10.000005)를 팔 수 없었다
-- (@monoch). NAV 계산은 이미 greatest(total_shares, 0.000001)로 0 나눗셈을
-- 방어하므로 total_shares 0을 허용한다.
alter table public.amc_listed_funds
  drop constraint if exists amc_listed_funds_total_shares_check;
alter table public.amc_listed_funds
  add constraint amc_listed_funds_total_shares_check check (total_shares >= 0);
