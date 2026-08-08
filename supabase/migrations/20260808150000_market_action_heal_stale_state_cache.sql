-- record_player_company_market_action: market_state 캐시가 창업주 세이브와 어긋나
-- 자사주매입·소각·신주발행이 stale_company_state 로 영구 잠기던 문제(버그리포트
-- 33d99a81)를 고친다. 세이브 CAS(첫 검사)와 game_saves FOR UPDATE 락이 동시성을
-- 보장하므로, 서버 캐시 market_state 가 창업주의 시장 매매·정합으로 드리프트하면
-- 세이브 기준으로 자가 치유(창업주 본인 한정)한 뒤 진행한다.
--
-- (전체 함수 본문은 라이브 DB에 apply_migration 으로 적용됨. 변경 지점은
--  market_state 불일치 시 raise 대신 세이브 기준으로 UPDATE 후 재조회하는 부분.)
create or replace function public.record_player_company_market_action(
  p_request_id uuid, p_ticker text, p_stock_id text, p_action_type text,
  p_shares bigint, p_total_shares_before bigint, p_public_shares_before bigint,
  p_price_cents numeric
)
returns player_company_market_actions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_ticker text := upper(trim(coalesce(p_ticker, '')));
  v_stock_id text := lower(trim(coalesce(p_stock_id, '')));
  v_save jsonb;
  v_company jsonb;
  v_company_after jsonb;
  v_state public.player_company_market_state;
  v_existing public.player_company_market_actions;
  v_row public.player_company_market_actions;
  v_total_after bigint;
  v_public_after bigint;
  v_factor numeric;
  v_now_tick bigint;
  v_effective_tick bigint;
  v_capital numeric;
  v_cash numeric;
  v_cost numeric;
  v_now_ms bigint;
  v_payment jsonb;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_request_id is null then raise exception 'invalid_request_id'; end if;
  if v_ticker !~ '^[A-Z0-9]{2,6}$' then raise exception 'invalid_ticker'; end if;
  if v_stock_id !~ '^[a-z][a-z0-9]{1,31}$' then raise exception 'invalid_stock_id'; end if;
  if p_action_type not in ('issue', 'buyback', 'retire') then
    raise exception 'invalid_action_type';
  end if;
  if coalesce(p_shares, 0) <= 0 then raise exception 'invalid_shares'; end if;
  if coalesce(p_price_cents, 0) <= 0 then raise exception 'invalid_price'; end if;

  select * into v_existing
  from public.player_company_market_actions
  where request_id = p_request_id and declared_by = v_user;
  if found then return v_existing; end if;

  select saves.state into v_save
  from public.game_saves saves
  where saves.user_id = v_user
  for update;
  v_company := v_save -> 'playerCompany';

  if jsonb_typeof(v_company) <> 'object'
     or upper(coalesce(v_company ->> 'ticker', '')) <> v_ticker
     or lower(coalesce(v_company ->> 'ipoListingStockId', '')) <> v_stock_id
     or coalesce(v_company ->> 'status', '') <> 'listed'
  then
    raise exception 'not_listed_founder';
  end if;

  if not exists (
    select 1 from public.stock_requests request
    where request.user_id = v_user
      and request.status in ('accepted', 'shipped')
      and request.description like '%[PLAYER_COMPANY_FOUNDATION]%'
      and request.description like '%"ticker":"' || v_ticker || '"%'
  ) then
    raise exception 'not_founder';
  end if;
  if not exists (
    select 1 from public.player_company_market_listings listing
    where listing.stock_id = v_stock_id
      and listing.ticker = v_ticker
      and listing.founder_id = v_user
  ) then
    raise exception 'unregistered_company_listing';
  end if;

  -- 세이브 CAS: before 값이 창업주 세이브의 현재 지분과 일치해야 한다.
  if coalesce((v_company ->> 'totalShares')::numeric, -1) <> p_total_shares_before
     or coalesce((v_company ->> 'publicShares')::numeric, -1) <> p_public_shares_before
  then
    raise exception 'stale_company_state';
  end if;

  insert into public.player_company_market_state (
    stock_id, ticker, founder_id, total_shares, public_shares
  )
  values (
    v_stock_id, v_ticker, v_user, p_total_shares_before, p_public_shares_before
  )
  on conflict (stock_id) do nothing;

  select * into v_state
  from public.player_company_market_state
  where stock_id = v_stock_id
  for update;

  if v_state.founder_id <> v_user or v_state.ticker <> v_ticker then
    raise exception 'not_founder';
  end if;
  -- 세이브(위 CAS 통과)와 서버 캐시가 어긋나면 세이브 기준으로 자가 치유(영구 잠금
  -- 방지). 세이브가 권위 기준이고 game_saves 락이 동시성을 보장한다.
  if v_state.total_shares <> p_total_shares_before
     or v_state.public_shares <> p_public_shares_before
  then
    update public.player_company_market_state
    set total_shares = p_total_shares_before,
        public_shares = p_public_shares_before,
        updated_at = now()
    where stock_id = v_stock_id;
    select * into v_state
    from public.player_company_market_state
    where stock_id = v_stock_id
    for update;
  end if;

  if p_action_type = 'issue' then
    v_total_after := v_state.total_shares + p_shares;
    v_public_after := v_state.public_shares + p_shares;
    v_factor := greatest(0.85::numeric, v_state.total_shares::numeric / v_total_after::numeric);
  elsif p_action_type = 'buyback' then
    if p_shares > v_state.public_shares then
      raise exception 'insufficient_public_shares';
    end if;
    v_total_after := v_state.total_shares;
    v_public_after := v_state.public_shares - p_shares;
    v_factor := least(1.15::numeric, 1::numeric + p_shares::numeric / v_state.total_shares::numeric);
  else
    if p_shares > v_state.public_shares or p_shares >= v_state.total_shares then
      raise exception 'insufficient_public_shares';
    end if;
    v_total_after := v_state.total_shares - p_shares;
    v_public_after := v_state.public_shares - p_shares;
    v_factor := least(1.15::numeric, v_state.total_shares::numeric / v_total_after::numeric);
  end if;

  v_now_tick := greatest(0, floor(extract(epoch from (
    clock_timestamp() - timestamptz '2026-07-11 00:00:00+00'
  )))::bigint);
  select greatest(v_now_tick + 15, coalesce(max(effective_tick) + 1, v_now_tick + 15))
    into v_effective_tick
  from public.player_company_market_actions
  where stock_id = v_stock_id;

  insert into public.player_company_market_actions (
    request_id, stock_id, ticker, action_type, shares,
    total_shares_before, public_shares_before, total_shares_after,
    public_shares_after, price_factor, price_cents, effective_tick, declared_by
  )
  values (
    p_request_id, v_stock_id, v_ticker, p_action_type, p_shares,
    v_state.total_shares, v_state.public_shares, v_total_after,
    v_public_after, v_factor, p_price_cents, v_effective_tick, v_user
  )
  returning * into v_row;

  update public.player_company_market_state
  set total_shares = v_total_after, public_shares = v_public_after, updated_at = now()
  where stock_id = v_stock_id;

  v_now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_capital := greatest(0, coalesce((v_company ->> 'cumulativeCapitalBurned')::numeric, 0));
  v_company_after := v_company;
  v_company_after := jsonb_set(v_company_after, '{totalShares}', to_jsonb(v_total_after), true);
  v_company_after := jsonb_set(v_company_after, '{publicShares}', to_jsonb(v_public_after), true);
  v_company_after := jsonb_set(v_company_after, '{lastActionAt}', to_jsonb(v_now_ms), true);

  if p_action_type = 'issue' then
    v_company_after := jsonb_set(v_company_after, '{cumulativeCapitalBurned}',
      to_jsonb(v_capital + p_price_cents * p_shares), true);
  elsif p_action_type = 'buyback' then
    v_cost := p_price_cents * p_shares;
    v_cash := case
      when coalesce(v_save ->> 'cashExact', '') ~ '^-?[0-9]+$' then (v_save ->> 'cashExact')::numeric
      when coalesce(v_save ->> 'cash', '') ~ '^-?[0-9]+([.][0-9]+)?$' then (v_save ->> 'cash')::numeric
      else 0
    end;
    if v_cash < v_cost then raise exception 'insufficient_cash'; end if;
    v_company_after := jsonb_set(v_company_after, '{founderShares}',
      to_jsonb(coalesce((v_company ->> 'founderShares')::bigint, 0) + p_shares), true);
    v_save := jsonb_set(v_save, '{cash}', to_jsonb(v_cash - v_cost), true);
    v_save := jsonb_set(v_save, '{cashExact}', to_jsonb((v_cash - v_cost)::text), true);
    v_payment := jsonb_build_object(
      'id', 'company-buyback-market-' || v_row.id::text,
      'kind', 'company_capital',
      'sourceId', coalesce(v_company ->> 'id', v_stock_id),
      'ticker', v_ticker,
      'dueSession', floor(v_now_ms / 3600000),
      'amount', -v_cost,
      'timestamp', v_now_ms
    );
    v_save := jsonb_set(v_save, '{cashPayments}',
      jsonb_build_array(v_payment) || coalesce(v_save -> 'cashPayments', '[]'::jsonb), true);
  else
    v_company_after := jsonb_set(v_company_after, '{cumulativeCapitalBurned}',
      to_jsonb(greatest(0, v_capital - p_price_cents * p_shares)), true);
  end if;

  v_save := jsonb_set(v_save, '{playerCompany}', v_company_after, true);
  update public.game_saves
  set state = v_save, wallet_revision = wallet_revision + 1, updated_at = now()
  where user_id = v_user;

  return v_row;
end;
$function$;
