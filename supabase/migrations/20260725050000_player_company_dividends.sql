-- 유저 회사 배당 원장 — 창업주가 선언한 배당을 모든 보유자 클라이언트가 읽어
-- 배당일(dividend_session)에 보유 좌수 비례로 지급받는다.
create table if not exists public.player_company_dividends (
  id uuid primary key default gen_random_uuid(),
  stock_id text not null,
  ticker text not null,
  per_share_cents bigint not null check (per_share_cents > 0),
  dividend_session bigint not null,
  total_cents numeric not null default 0,
  declared_by uuid not null,
  created_at timestamptz not null default now(),
  -- 같은 종목·같은 배당일에는 한 번만 선언 가능(중복 지급 방지).
  unique (stock_id, dividend_session)
);

create index if not exists player_company_dividends_stock_idx
  on public.player_company_dividends (stock_id);

alter table public.player_company_dividends enable row level security;

drop policy if exists player_company_dividends_read on public.player_company_dividends;
create policy player_company_dividends_read on public.player_company_dividends
  for select to authenticated using (true);

-- 창업주 검증 후 배당을 선언한다. auth.uid() 가 해당 티커의 회사 설립 신청을
-- 허가(accepted)·완료(shipped)받은 이력이 있어야 한다(그리핑·인플레 방지).
create or replace function public.declare_player_company_dividend(
  p_ticker text,
  p_stock_id text,
  p_per_share_cents bigint,
  p_total_cents numeric,
  p_dividend_session bigint
)
returns public.player_company_dividends
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticker text := upper(trim(coalesce(p_ticker, '')));
  v_row public.player_company_dividends;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if v_ticker !~ '^[A-Z0-9]{2,6}$' then raise exception 'invalid_ticker'; end if;
  if coalesce(p_per_share_cents, 0) <= 0 then raise exception 'invalid_amount'; end if;

  if not exists (
    select 1 from public.stock_requests r
    where r.user_id = auth.uid()
      and r.status in ('accepted', 'shipped')
      and r.description like '%[PLAYER_COMPANY_FOUNDATION]%'
      and r.description like '%"ticker":"' || v_ticker || '"%'
  ) then
    raise exception 'not_founder';
  end if;

  insert into public.player_company_dividends
    (stock_id, ticker, per_share_cents, total_cents, dividend_session, declared_by)
  values
    (trim(p_stock_id), v_ticker, p_per_share_cents,
     greatest(0, coalesce(p_total_cents, 0)), p_dividend_session, auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.declare_player_company_dividend(text, text, bigint, numeric, bigint)
  from public, anon;
grant execute on function public.declare_player_company_dividend(text, text, bigint, numeric, bigint)
  to authenticated;
