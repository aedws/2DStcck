-- 유저 ETF 배당(NAV 차감) 공유 원장 필드 + 적용 RPC.

alter table public.amc_listed_funds
  add column if not exists dividend_interval_days integer not null default 60
    check (dividend_interval_days in (5, 20, 60));

alter table public.amc_listed_funds
  add column if not exists dividend_rate double precision not null default 0
    check (dividend_rate >= 0 and dividend_rate <= 0.05);

alter table public.amc_listed_funds
  add column if not exists last_dividend_session bigint;

alter table public.amc_listed_funds
  add column if not exists cumulative_dividends_paid bigint not null default 0
    check (cumulative_dividends_paid >= 0);

alter table public.amc_listed_funds
  add column if not exists dividend_history jsonb not null default '[]'::jsonb;

update public.amc_listed_funds
set last_dividend_session = coalesce(last_dividend_session, created_session)
where last_dividend_session is null;

alter table public.amc_listed_funds
  alter column last_dividend_session set not null;

create or replace function public.amc_apply_dividend(
  p_fund_id text,
  p_due_session bigint,
  p_per_share bigint,
  p_total bigint,
  p_new_seed_nav_value bigint,
  p_new_last_dividend_session bigint,
  p_new_cumulative_dividends_paid bigint,
  p_dividend_history jsonb
)
returns public.amc_listed_funds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.amc_listed_funds;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_per_share < 0 or p_total < 0 or p_new_seed_nav_value < 0
     or p_new_cumulative_dividends_paid < 0 then
    raise exception 'invalid_dividend_payload';
  end if;

  select * into v_row
  from public.amc_listed_funds
  where id = p_fund_id
  for update;

  if not found then
    raise exception 'fund_not_found';
  end if;
  if v_row.manager_user_id <> auth.uid() then
    raise exception 'not_manager';
  end if;
  if v_row.status = 'delisted' then
    raise exception 'fund_delisted';
  end if;
  if v_row.last_dividend_session >= p_new_last_dividend_session then
    return v_row;
  end if;

  update public.amc_listed_funds
  set
    seed_nav_value = p_new_seed_nav_value,
    last_dividend_session = p_new_last_dividend_session,
    cumulative_dividends_paid = p_new_cumulative_dividends_paid,
    dividend_history = coalesce(p_dividend_history, '[]'::jsonb),
    updated_at = now()
  where id = p_fund_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.amc_apply_dividend(text, bigint, bigint, bigint, bigint, bigint, bigint, jsonb) from public;
grant execute on function public.amc_apply_dividend(text, bigint, bigint, bigint, bigint, bigint, bigint, jsonb) to authenticated;
