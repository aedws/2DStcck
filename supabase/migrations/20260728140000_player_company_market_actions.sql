-- 상장 플레이어 회사의 자본관리 기업행동을 모든 계정의 공통 시세에 반영한다.
-- 클라이언트가 로컬 주가를 직접 바꾸지 않고, 서버가 미래의 결정론 틱을 배정한다.
-- 모든 클라이언트와 리플레이 워커는 이 원장을 읽어 같은 틱에 같은 계수를 1회 적용한다.

create table if not exists public.player_company_market_actions (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  request_id uuid not null unique,
  stock_id text not null,
  ticker text not null,
  action_type text not null
    check (action_type in ('issue', 'buyback', 'retire')),
  shares bigint not null check (shares > 0),
  total_shares_before bigint not null check (total_shares_before > 0),
  public_shares_before bigint not null check (public_shares_before >= 0),
  total_shares_after bigint not null check (total_shares_after > 0),
  public_shares_after bigint not null check (public_shares_after >= 0),
  price_factor numeric not null check (price_factor between 0.85 and 1.15),
  price_cents numeric not null check (price_cents > 0),
  effective_tick bigint not null check (effective_tick >= 0),
  declared_by uuid not null,
  created_at timestamptz not null default now(),
  unique (stock_id, effective_tick)
);

create index if not exists player_company_market_actions_tick_idx
  on public.player_company_market_actions (effective_tick, sequence);

alter table public.player_company_market_actions enable row level security;
revoke all on public.player_company_market_actions from public, anon, authenticated;
grant select on public.player_company_market_actions to anon, authenticated;

drop policy if exists player_company_market_actions_read
  on public.player_company_market_actions;
create policy player_company_market_actions_read
  on public.player_company_market_actions
  for select to anon, authenticated using (true);

-- 주가를 움직일 수 있는 플레이어 회사 종목↔창업주 고정 명부. game_saves의 종목 id를
-- 사용자가 임의 종목으로 바꿔 시장을 조작하지 못하도록 마이그레이션 시점에 잠근다.
create table if not exists public.player_company_market_listings (
  stock_id text primary key,
  ticker text not null unique,
  founder_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.player_company_market_listings enable row level security;
revoke all on public.player_company_market_listings from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'player_company_market_listings'
      and column_name = 'original_founder_id'
  ) then
    insert into public.player_company_market_listings (
      stock_id,
      ticker,
      founder_id,
      original_founder_id
    )
    select
      lower(saves.state -> 'playerCompany' ->> 'ipoListingStockId'),
      upper(saves.state -> 'playerCompany' ->> 'ticker'),
      saves.user_id,
      saves.user_id
    from public.game_saves saves
    where jsonb_typeof(saves.state -> 'playerCompany') = 'object'
      and coalesce(saves.state -> 'playerCompany' ->> 'status', '')
        in ('ipo-requested', 'listed')
      and lower(coalesce(
        saves.state -> 'playerCompany' ->> 'ipoListingStockId', ''
      )) ~ '^[a-z][a-z0-9]{1,31}$'
      and upper(coalesce(
        saves.state -> 'playerCompany' ->> 'ticker', ''
      )) ~ '^[A-Z0-9]{2,6}$'
      and exists (
        select 1
        from public.stock_requests request
        where request.user_id = saves.user_id
          and request.status in ('accepted', 'shipped')
          and request.description like '%[PLAYER_COMPANY_FOUNDATION]%'
          and request.description like
            '%"ticker":"' ||
            upper(saves.state -> 'playerCompany' ->> 'ticker') ||
            '"%'
      )
    on conflict (stock_id) do nothing;
  else
    insert into public.player_company_market_listings (
      stock_id,
      ticker,
      founder_id
    )
    select
      lower(saves.state -> 'playerCompany' ->> 'ipoListingStockId'),
      upper(saves.state -> 'playerCompany' ->> 'ticker'),
      saves.user_id
    from public.game_saves saves
    where jsonb_typeof(saves.state -> 'playerCompany') = 'object'
      and coalesce(saves.state -> 'playerCompany' ->> 'status', '')
        in ('ipo-requested', 'listed')
      and lower(coalesce(
        saves.state -> 'playerCompany' ->> 'ipoListingStockId', ''
      )) ~ '^[a-z][a-z0-9]{1,31}$'
      and upper(coalesce(
        saves.state -> 'playerCompany' ->> 'ticker', ''
      )) ~ '^[A-Z0-9]{2,6}$'
      and exists (
        select 1
        from public.stock_requests request
        where request.user_id = saves.user_id
          and request.status in ('accepted', 'shipped')
          and request.description like '%[PLAYER_COMPANY_FOUNDATION]%'
          and request.description like
            '%"ticker":"' ||
            upper(saves.state -> 'playerCompany' ->> 'ticker') ||
            '"%'
      )
    on conflict (stock_id) do nothing;
  end if;
end;
$$;

-- 기업별 권위 캡테이블. RPC가 행 잠금 후 갱신해 여러 탭의 동시 행동과 중복 요청을 막는다.
create table if not exists public.player_company_market_state (
  stock_id text primary key,
  ticker text not null,
  founder_id uuid not null,
  total_shares bigint not null check (total_shares > 0),
  public_shares bigint not null check (
    public_shares >= 0 and public_shares <= total_shares
  ),
  updated_at timestamptz not null default now()
);

alter table public.player_company_market_state enable row level security;
revoke all on public.player_company_market_state from public, anon, authenticated;

create or replace function public.record_player_company_market_action(
  p_request_id uuid,
  p_ticker text,
  p_stock_id text,
  p_action_type text,
  p_shares bigint,
  p_total_shares_before bigint,
  p_public_shares_before bigint,
  p_price_cents numeric
)
returns public.player_company_market_actions
language plpgsql
security definer
set search_path = public
as $$
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

  select *
    into v_existing
  from public.player_company_market_actions
  where request_id = p_request_id
    and declared_by = v_user;
  if found then return v_existing; end if;

  select saves.state
    into v_save
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
    select 1
    from public.stock_requests request
    where request.user_id = v_user
      and request.status in ('accepted', 'shipped')
      and request.description like '%[PLAYER_COMPANY_FOUNDATION]%'
      and request.description like '%"ticker":"' || v_ticker || '"%'
  ) then
    raise exception 'not_founder';
  end if;
  if not exists (
    select 1
    from public.player_company_market_listings listing
    where listing.stock_id = v_stock_id
      and listing.ticker = v_ticker
      and listing.founder_id = v_user
  ) then
    raise exception 'unregistered_company_listing';
  end if;

  if coalesce((v_company ->> 'totalShares')::numeric, -1) <> p_total_shares_before
     or coalesce((v_company ->> 'publicShares')::numeric, -1) <> p_public_shares_before
  then
    raise exception 'stale_company_state';
  end if;

  insert into public.player_company_market_state (
    stock_id, ticker, founder_id, total_shares, public_shares
  )
  values (
    v_stock_id, v_ticker, v_user,
    p_total_shares_before, p_public_shares_before
  )
  on conflict (stock_id) do nothing;

  select *
    into v_state
  from public.player_company_market_state
  where stock_id = v_stock_id
  for update;

  if v_state.founder_id <> v_user or v_state.ticker <> v_ticker then
    raise exception 'not_founder';
  end if;
  if v_state.total_shares <> p_total_shares_before
     or v_state.public_shares <> p_public_shares_before
  then
    raise exception 'stale_company_state';
  end if;

  if p_action_type = 'issue' then
    v_total_after := v_state.total_shares + p_shares;
    v_public_after := v_state.public_shares + p_shares;
    v_factor := greatest(
      0.85::numeric,
      v_state.total_shares::numeric / v_total_after::numeric
    );
  elsif p_action_type = 'buyback' then
    if p_shares > v_state.public_shares then
      raise exception 'insufficient_public_shares';
    end if;
    v_total_after := v_state.total_shares;
    v_public_after := v_state.public_shares - p_shares;
    v_factor := least(
      1.15::numeric,
      1::numeric + p_shares::numeric / v_state.total_shares::numeric
    );
  else
    if p_shares > v_state.public_shares
       or p_shares >= v_state.total_shares
    then
      raise exception 'insufficient_public_shares';
    end if;
    v_total_after := v_state.total_shares - p_shares;
    v_public_after := v_state.public_shares - p_shares;
    v_factor := least(
      1.15::numeric,
      v_state.total_shares::numeric / v_total_after::numeric
    );
  end if;

  -- 5초 폴링 중인 모든 클라이언트가 미리 원장을 받도록 최소 15초 뒤로 예약한다.
  v_now_tick := greatest(
    0,
    floor(extract(epoch from (
      clock_timestamp() - timestamptz '2026-07-11 00:00:00+00'
    )))::bigint
  );
  select greatest(
    v_now_tick + 15,
    coalesce(max(effective_tick) + 1, v_now_tick + 15)
  )
    into v_effective_tick
  from public.player_company_market_actions
  where stock_id = v_stock_id;

  insert into public.player_company_market_actions (
    request_id,
    stock_id,
    ticker,
    action_type,
    shares,
    total_shares_before,
    public_shares_before,
    total_shares_after,
    public_shares_after,
    price_factor,
    price_cents,
    effective_tick,
    declared_by
  )
  values (
    p_request_id,
    v_stock_id,
    v_ticker,
    p_action_type,
    p_shares,
    v_state.total_shares,
    v_state.public_shares,
    v_total_after,
    v_public_after,
    v_factor,
    p_price_cents,
    v_effective_tick,
    v_user
  )
  returning * into v_row;

  update public.player_company_market_state
  set
    total_shares = v_total_after,
    public_shares = v_public_after,
    updated_at = now()
  where stock_id = v_stock_id;

  -- 캡테이블과 자사주 매입 현금도 같은 트랜잭션에서 game_saves에 반영한다.
  -- 원장만 성공하고 비용·지분 저장이 실패해 주가만 움직이는 경로를 차단한다.
  v_now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_capital := greatest(
    0,
    coalesce((v_company ->> 'cumulativeCapitalBurned')::numeric, 0)
  );
  v_company_after := v_company;
  v_company_after := jsonb_set(
    v_company_after,
    '{totalShares}',
    to_jsonb(v_total_after),
    true
  );
  v_company_after := jsonb_set(
    v_company_after,
    '{publicShares}',
    to_jsonb(v_public_after),
    true
  );
  v_company_after := jsonb_set(
    v_company_after,
    '{lastActionAt}',
    to_jsonb(v_now_ms),
    true
  );

  if p_action_type = 'issue' then
    v_company_after := jsonb_set(
      v_company_after,
      '{cumulativeCapitalBurned}',
      to_jsonb(v_capital + p_price_cents * p_shares),
      true
    );
  elsif p_action_type = 'buyback' then
    v_cost := p_price_cents * p_shares;
    v_cash := case
      when coalesce(v_save ->> 'cashExact', '') ~ '^-?[0-9]+$'
        then (v_save ->> 'cashExact')::numeric
      when coalesce(v_save ->> 'cash', '') ~ '^-?[0-9]+([.][0-9]+)?$'
        then (v_save ->> 'cash')::numeric
      else 0
    end;
    if v_cash < v_cost then raise exception 'insufficient_cash'; end if;
    v_company_after := jsonb_set(
      v_company_after,
      '{founderShares}',
      to_jsonb(coalesce((v_company ->> 'founderShares')::bigint, 0) + p_shares),
      true
    );
    v_save := jsonb_set(v_save, '{cash}', to_jsonb(v_cash - v_cost), true);
    v_save := jsonb_set(
      v_save,
      '{cashExact}',
      to_jsonb((v_cash - v_cost)::text),
      true
    );
    v_payment := jsonb_build_object(
      'id', 'company-buyback-market-' || v_row.id::text,
      'kind', 'company_capital',
      'sourceId', coalesce(v_company ->> 'id', v_stock_id),
      'ticker', v_ticker,
      'dueSession', floor(v_now_ms / 3600000),
      'amount', -v_cost,
      'timestamp', v_now_ms
    );
    v_save := jsonb_set(
      v_save,
      '{cashPayments}',
      jsonb_build_array(v_payment) ||
        coalesce(v_save -> 'cashPayments', '[]'::jsonb),
      true
    );
  else
    v_company_after := jsonb_set(
      v_company_after,
      '{cumulativeCapitalBurned}',
      to_jsonb(greatest(0, v_capital - p_price_cents * p_shares)),
      true
    );
  end if;

  v_save := jsonb_set(
    v_save,
    '{playerCompany}',
    v_company_after,
    true
  );
  update public.game_saves
  set
    state = v_save,
    wallet_revision = wallet_revision + 1,
    updated_at = now()
  where user_id = v_user;

  return v_row;
end;
$$;

revoke all on function public.record_player_company_market_action(
  uuid, text, text, text, bigint, bigint, bigint, numeric
) from public, anon;
grant execute on function public.record_player_company_market_action(
  uuid, text, text, text, bigint, bigint, bigint, numeric
) to authenticated;
