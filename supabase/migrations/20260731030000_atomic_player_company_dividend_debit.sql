-- 플레이어 회사 배당 예약과 창업주 현금 차감을 하나의 서버 트랜잭션으로 묶는다.
-- 기존 구현은 배당 원장만 서버에 기록하고 차감은 클라이언트 후속 저장에 맡겨,
-- 저장 충돌·새로고침 때 배당은 남지만 현금 차감이 되돌아올 수 있었다.

-- 초고액 계정의 좌당 배당은 bigint 상한을 넘을 수 있으므로 numeric 원장으로 넓힌다.
drop function if exists public.declare_player_company_dividend(
  text, text, bigint, numeric, bigint
);
alter table public.player_company_dividends
  alter column per_share_cents type numeric
  using per_share_cents::numeric;

create or replace function public.declare_player_company_dividend(
  p_ticker text,
  p_stock_id text,
  p_per_share_cents numeric,
  p_total_cents numeric,
  p_dividend_session bigint
)
returns public.player_company_dividends
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ticker text := upper(trim(coalesce(p_ticker, '')));
  v_stock_id text := lower(trim(coalesce(p_stock_id, '')));
  v_row public.player_company_dividends;
  v_save jsonb;
  v_company jsonb;
  v_cash numeric;
  v_total_shares numeric;
  v_distributable numeric;
  v_now_ms bigint;
  v_now_session bigint;
  v_payment jsonb;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if v_ticker !~ '^[A-Z0-9]{2,6}$' then raise exception 'invalid_ticker'; end if;
  if v_stock_id !~ '^[a-z][a-z0-9]{1,31}$' then
    raise exception 'invalid_stock_id';
  end if;
  if coalesce(p_per_share_cents, 0) <= 0
     or coalesce(p_total_cents, 0) <= 0
     or trunc(p_total_cents) <> p_total_cents
  then
    raise exception 'invalid_amount';
  end if;

  if not exists (
    select 1
    from public.stock_requests request
    where request.user_id = v_user
      and request.status in ('accepted', 'shipped')
      and request.description like '%[PLAYER_COMPANY_FOUNDATION]%'
      and request.description like '%"ticker":"' || v_ticker || '"%'
  ) then
    raise exception 'not_founder';
  end if;

  select saves.state
    into v_save
  from public.game_saves saves
  where saves.user_id = v_user
  for update;
  if not found then raise exception 'save_not_found'; end if;

  v_company := v_save -> 'playerCompany';
  if jsonb_typeof(v_company) <> 'object'
     or upper(coalesce(v_company ->> 'ticker', '')) <> v_ticker
     or lower(coalesce(v_company ->> 'ipoListingStockId', '')) <> v_stock_id
     or coalesce(v_company ->> 'status', '') <> 'listed'
  then
    raise exception 'not_listed_founder';
  end if;

  v_total_shares := case
    when coalesce(v_company ->> 'totalShares', '') ~ '^[0-9]+$'
      then (v_company ->> 'totalShares')::numeric
    else 0
  end;
  v_distributable := p_per_share_cents::numeric * v_total_shares;
  -- 좌당 금액은 총예산을 총발행주식수로 내림한 값이다. 내림 뒤 남는 금액만
  -- 허용해 클라이언트가 작은 총예산으로 과도한 좌당 배당을 만들지 못하게 한다.
  if v_total_shares <= 0
     or v_distributable > p_total_cents
     or p_total_cents - v_distributable >= v_total_shares
  then
    raise exception 'invalid_dividend_budget';
  end if;

  v_cash := case
    when coalesce(v_save ->> 'cashExact', v_save ->> 'cash', '') ~ '^-?[0-9]+$'
      then coalesce(v_save ->> 'cashExact', v_save ->> 'cash')::numeric
    else 0
  end;
  if v_cash < p_total_cents then raise exception 'insufficient_cash'; end if;

  v_now_ms := floor(extract(epoch from clock_timestamp()) * 1000);
  v_now_session := floor(v_now_ms / 3600000);
  if p_dividend_session <= v_now_session
     or p_dividend_session > v_now_session + 20
     or mod(p_dividend_session, 20) <> 0
  then
    raise exception 'invalid_dividend_session';
  end if;

  insert into public.player_company_dividends (
    stock_id,
    ticker,
    per_share_cents,
    total_cents,
    dividend_session,
    declared_by
  )
  values (
    v_stock_id,
    v_ticker,
    p_per_share_cents,
    p_total_cents,
    p_dividend_session,
    v_user
  )
  returning * into v_row;

  v_payment := jsonb_build_object(
    'id', 'pcdiv-burn-' || v_row.id::text,
    'kind', 'company_capital',
    'sourceId', coalesce(v_company ->> 'id', v_stock_id),
    'ticker', v_ticker,
    'dueSession', v_now_session,
    'amount', -p_total_cents,
    'amountExact', (-p_total_cents)::text,
    'timestamp', v_now_ms
  );
  v_save := jsonb_set(v_save, '{cash}', to_jsonb(v_cash - p_total_cents), true);
  v_save := jsonb_set(
    v_save,
    '{cashExact}',
    to_jsonb((v_cash - p_total_cents)::text),
    true
  );
  v_save := jsonb_set(
    v_save,
    '{cashPayments}',
    jsonb_build_array(v_payment) ||
      coalesce(v_save -> 'cashPayments', '[]'::jsonb),
    true
  );
  v_company := jsonb_set(v_company, '{dividendRate}', '0'::jsonb, true);
  v_company := jsonb_set(
    v_company,
    '{lastActionAt}',
    to_jsonb(v_now_ms),
    true
  );
  v_save := jsonb_set(v_save, '{playerCompany}', v_company, true);

  update public.game_saves
  set state = v_save,
      wallet_revision = wallet_revision + 1,
      updated_at = now()
  where user_id = v_user;

  return v_row;
end;
$$;

revoke all on function public.declare_player_company_dividend(
  text, text, numeric, numeric, bigint
) from public, anon;
grant execute on function public.declare_player_company_dividend(
  text, text, numeric, numeric, bigint
) to authenticated;
