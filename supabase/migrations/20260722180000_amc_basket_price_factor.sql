-- 유저 ETF NAV는 펀드 생성·리밸런싱 시점 이후의 구성종목 수익률만 반영한다.
-- 구 펀드는 1을 기본값으로 사용해 배포 전 가격을 그대로 보존한다.

alter table public.amc_listed_funds
  add column if not exists basket_price_factor double precision not null default 1
    check (
      basket_price_factor > 0
      and basket_price_factor <> 'Infinity'::double precision
      and basket_price_factor <> '-Infinity'::double precision
      and basket_price_factor = basket_price_factor
    );
