-- Postgres에는 finite(double precision)이 없음 → isfinite 대체.
-- (라이브에서 ETF 매수 시 "function finite(double precision) does not exist")

create or replace function public.amc_adjust_shares(
  p_fund_id text,
  p_delta double precision,
  p_cash_delta bigint default 0
)
returns public.amc_listed_funds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.amc_listed_funds;
  v_next_shares double precision;
  v_next_seed bigint;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  -- NaN/±Inf/null/0 거부 (finite() 미존재 환경 호환)
  if p_delta is null
     or p_delta = 0
     or p_delta <> p_delta
     or p_delta = 'Infinity'::double precision
     or p_delta = '-Infinity'::double precision then
    raise exception 'invalid_delta';
  end if;
  if p_cash_delta is null then
    raise exception 'invalid_cash_delta';
  end if;

  select * into v_row
  from public.amc_listed_funds
  where id = p_fund_id
  for update;

  if not found then
    raise exception 'fund_not_found';
  end if;
  if v_row.status = 'delisted' then
    raise exception 'fund_delisted';
  end if;
  if v_row.status = 'grace' and p_delta > 0 then
    raise exception 'fund_grace_no_buy';
  end if;

  v_next_shares := v_row.total_shares + p_delta;
  if v_next_shares <= 0 then
    raise exception 'insufficient_shares';
  end if;

  v_next_seed := v_row.seed_nav_value + p_cash_delta;
  if v_next_seed < 0 then
    raise exception 'insufficient_nav';
  end if;
  if (p_delta > 0 and p_cash_delta < 0) or (p_delta < 0 and p_cash_delta > 0) then
    raise exception 'cash_delta_sign_mismatch';
  end if;

  update public.amc_listed_funds
  set
    total_shares = v_next_shares,
    seed_nav_value = v_next_seed,
    updated_at = now()
  where id = p_fund_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.amc_adjust_shares(text, double precision, bigint) from public;
grant execute on function public.amc_adjust_shares(text, double precision, bigint) to authenticated;
