-- 창업주 계좌 파산과 법인 존속을 분리한다.
-- 설립자는 영구 보존하고 현재 경영권자만 M&A로 이전할 수 있으며, 한 플레이어가
-- 여러 회사를 인수해도 stock_id별 단일 경영권 원장으로 권한을 판정한다.

alter table public.player_company_market_listings
  add column if not exists original_founder_id uuid;

update public.player_company_market_listings
set original_founder_id = founder_id
where original_founder_id is null;

alter table public.player_company_market_listings
  alter column original_founder_id set not null;

create table if not exists public.player_company_control_rights (
  stock_id text primary key
    references public.player_company_market_listings (stock_id)
    on delete cascade,
  original_founder_id uuid not null references auth.users (id),
  controller_id uuid not null references auth.users (id),
  control_source text not null default 'founder'
    check (control_source in ('founder', 'trust', 'rehabilitation', 'rescue-loan', 'm-and-a')),
  control_vote_weight numeric not null default 0
    check (control_vote_weight >= 0),
  acquired_session bigint,
  updated_at timestamptz not null default now()
);

insert into public.player_company_control_rights (
  stock_id,
  original_founder_id,
  controller_id,
  control_source
)
select
  listing.stock_id,
  listing.original_founder_id,
  listing.founder_id,
  'founder'
from public.player_company_market_listings listing
on conflict (stock_id) do nothing;

create index if not exists player_company_control_rights_controller_idx
  on public.player_company_control_rights (controller_id, updated_at desc);

alter table public.player_company_control_rights enable row level security;
revoke all on public.player_company_control_rights
  from public, anon, authenticated;

create table if not exists public.player_company_insolvency_cases (
  id uuid primary key default gen_random_uuid(),
  stock_id text not null
    references public.player_company_market_listings (stock_id)
    on delete cascade,
  insolvent_controller_id uuid not null references auth.users (id),
  margin_call_at_ms bigint not null,
  option_type text not null
    check (option_type in ('rehabilitation', 'trust', 'rescue-loan', 'm-and-a')),
  status text not null
    check (status in ('rehabilitation', 'trust', 'loan-active', 'auction', 'transferred', 'closed')),
  opened_session bigint not null,
  resolves_session bigint,
  protected_vote_weight numeric not null default 0
    check (protected_vote_weight >= 0),
  rescue_loan_cents numeric not null default 0
    check (rescue_loan_cents >= 0),
  rescue_loan_due_session bigint,
  auction_price_cents numeric not null default 0
    check (auction_price_cents >= 0),
  buyer_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (stock_id, insolvent_controller_id, margin_call_at_ms)
);

create index if not exists player_company_insolvency_open_idx
  on public.player_company_insolvency_cases (status, opened_session desc);

alter table public.player_company_insolvency_cases enable row level security;
revoke all on public.player_company_insolvency_cases
  from public, anon, authenticated;

create or replace function public.player_company_saved_cash(
  p_state jsonb
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_state ->> 'cashExact', p_state ->> 'cash', '') ~ '^-?[0-9]+$'
    then coalesce(p_state ->> 'cashExact', p_state ->> 'cash')::numeric
    else 0
  end;
$$;

revoke all on function public.player_company_saved_cash(jsonb)
  from public, anon, authenticated;

create or replace function public.player_company_set_saved_cash(
  p_state jsonb,
  p_cash numeric
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_set(
    jsonb_set(
      coalesce(p_state, '{}'::jsonb),
      '{cash}',
      to_jsonb(p_cash),
      true
    ),
    '{cashExact}',
    to_jsonb(round(p_cash)::text),
    true
  );
$$;

revoke all on function public.player_company_set_saved_cash(jsonb, numeric)
  from public, anon, authenticated;

create or replace function public.player_company_mark_recovery(
  p_original_founder_id uuid,
  p_case_id uuid,
  p_option text,
  p_status text,
  p_resolves_session bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb;
  v_company jsonb;
begin
  select state into v_state
  from public.game_saves
  where user_id = p_original_founder_id
  for update;
  if jsonb_typeof(v_state -> 'playerCompany') <> 'object' then return; end if;
  v_company := v_state -> 'playerCompany';
  v_company := jsonb_set(
    v_company,
    '{insolvency}',
    jsonb_build_object(
      'caseId', p_case_id,
      'option', p_option,
      'status', p_status,
      'resolvesSession', p_resolves_session,
      'updatedAt', (extract(epoch from clock_timestamp()) * 1000)::bigint
    ),
    true
  );
  if p_status in ('rehabilitation', 'auction') then
    v_company := jsonb_set(v_company, '{status}', to_jsonb('paused'::text), true);
  end if;
  update public.game_saves
  set state = jsonb_set(v_state, '{playerCompany}', v_company, true),
      wallet_revision = wallet_revision + 1,
      updated_at = now()
  where user_id = p_original_founder_id;
end;
$$;

revoke all on function public.player_company_mark_recovery(
  uuid, uuid, text, text, bigint
) from public, anon, authenticated;

create or replace function public.player_company_finish_recovery(
  p_original_founder_id uuid,
  p_case_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb;
  v_company jsonb;
  v_insolvency jsonb;
begin
  select state into v_state
  from public.game_saves
  where user_id = p_original_founder_id
  for update;
  if jsonb_typeof(v_state -> 'playerCompany') <> 'object' then return; end if;
  v_company := v_state -> 'playerCompany';
  v_insolvency := coalesce(v_company -> 'insolvency', '{}'::jsonb);
  v_insolvency := jsonb_set(v_insolvency, '{caseId}', to_jsonb(p_case_id), true);
  v_insolvency := jsonb_set(v_insolvency, '{status}', to_jsonb(p_status), true);
  v_insolvency := jsonb_set(
    v_insolvency,
    '{updatedAt}',
    to_jsonb((extract(epoch from clock_timestamp()) * 1000)::bigint),
    true
  );
  v_company := jsonb_set(v_company, '{insolvency}', v_insolvency, true);
  v_company := jsonb_set(v_company, '{status}', to_jsonb('listed'::text), true);
  update public.game_saves
  set state = jsonb_set(v_state, '{playerCompany}', v_company, true),
      wallet_revision = wallet_revision + 1,
      updated_at = now()
  where user_id = p_original_founder_id;
end;
$$;

revoke all on function public.player_company_finish_recovery(
  uuid, uuid, text
) from public, anon, authenticated;

create or replace function public.get_player_company_insolvency_status(
  p_stock_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_stock_id text := lower(trim(coalesce(p_stock_id, '')));
  v_control public.player_company_control_rights;
  v_state jsonb;
  v_margin_call bigint := 0;
  v_session bigint := floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
  v_case public.player_company_insolvency_cases;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select * into v_control
  from public.player_company_control_rights
  where stock_id = v_stock_id and controller_id = v_user;
  if not found then raise exception 'not_controller'; end if;

  select state into v_state
  from public.game_saves
  where user_id = v_user;
  if coalesce(v_state ->> 'marginCallAt', '') ~ '^[0-9]+$' then
    v_margin_call := (v_state ->> 'marginCallAt')::bigint;
  end if;

  select * into v_case
  from public.player_company_insolvency_cases insolvency
  where insolvency.stock_id = v_stock_id
  order by insolvency.created_at desc
  limit 1;

  if found
     and v_case.status = 'loan-active'
     and coalesce(v_case.rescue_loan_due_session, v_session + 1) <= v_session
  then
    update public.player_company_insolvency_cases
    set status = 'auction',
        auction_price_cents = greatest(
          1,
          round(v_case.rescue_loan_cents * 1.15)
        )
    where id = v_case.id
    returning * into v_case;
    update public.player_company_control_rights
    set control_source = 'rehabilitation', updated_at = now()
    where stock_id = v_stock_id;
    perform public.player_company_mark_recovery(
      v_control.original_founder_id,
      v_case.id,
      'm-and-a',
      'auction',
      v_session + 24
    );
  end if;

  if found
     and v_case.status = 'rehabilitation'
     and coalesce(v_case.resolves_session, v_session + 1) <= v_session
  then
    update public.player_company_insolvency_cases
    set status = 'closed', resolved_at = now()
    where id = v_case.id
    returning * into v_case;
    update public.player_company_control_rights
    set control_source = case
          when controller_id = original_founder_id then 'founder'
          else 'm-and-a'
        end,
        control_vote_weight = case
          when controller_id = original_founder_id then 0
          else control_vote_weight
        end,
        updated_at = now()
    where stock_id = v_stock_id;
    perform public.player_company_finish_recovery(
      v_control.original_founder_id,
      v_case.id,
      'closed'
    );
  end if;

  select * into v_control
  from public.player_company_control_rights
  where stock_id = v_stock_id;

  return jsonb_build_object(
    'stockId', v_stock_id,
    'currentSession', v_session,
    'eligible',
      v_margin_call > 0
      and not exists (
        select 1
        from public.player_company_insolvency_cases handled
        where handled.stock_id = v_stock_id
          and handled.insolvent_controller_id = v_user
          and handled.margin_call_at_ms = v_margin_call
      ),
    'marginCallAtMs', v_margin_call,
    'controlSource', v_control.control_source,
    'controlVoteWeight', v_control.control_vote_weight,
    'case', case
      when v_case.id is null then null
      else jsonb_build_object(
        'id', v_case.id,
        'optionType', v_case.option_type,
        'status', v_case.status,
        'openedSession', v_case.opened_session,
        'resolvesSession', v_case.resolves_session,
        'protectedVoteWeight', v_case.protected_vote_weight,
        'rescueLoanCents', v_case.rescue_loan_cents,
        'rescueLoanDueSession', v_case.rescue_loan_due_session,
        'auctionPriceCents', v_case.auction_price_cents,
        'buyerId', v_case.buyer_id
      )
    end
  );
end;
$$;

revoke all on function public.get_player_company_insolvency_status(text)
  from public, anon;
grant execute on function public.get_player_company_insolvency_status(text)
  to authenticated;

create or replace function public.choose_player_company_insolvency_option(
  p_stock_id text,
  p_option text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_stock_id text := lower(trim(coalesce(p_stock_id, '')));
  v_control public.player_company_control_rights;
  v_controller_save jsonb;
  v_founder_save jsonb;
  v_company jsonb;
  v_margin_call bigint := 0;
  v_session bigint := floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
  v_total numeric := 1;
  v_capital numeric := 1;
  v_cash numeric := 0;
  v_vote_weight numeric := 0;
  v_loan numeric := 0;
  v_auction numeric := 0;
  v_case public.player_company_insolvency_cases;
  v_status text;
  v_resolves bigint;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_option not in ('rehabilitation', 'trust', 'rescue-loan', 'm-and-a') then
    raise exception 'invalid_option';
  end if;
  select * into v_control
  from public.player_company_control_rights
  where stock_id = v_stock_id and controller_id = v_user
  for update;
  if not found then raise exception 'not_controller'; end if;

  select state into v_controller_save
  from public.game_saves
  where user_id = v_user
  for update;
  if coalesce(v_controller_save ->> 'marginCallAt', '') ~ '^[0-9]+$' then
    v_margin_call := (v_controller_save ->> 'marginCallAt')::bigint;
  end if;
  if v_margin_call <= 0 then raise exception 'no_bankruptcy_event'; end if;
  if exists (
    select 1
    from public.player_company_insolvency_cases handled
    where handled.stock_id = v_stock_id
      and handled.insolvent_controller_id = v_user
      and handled.margin_call_at_ms = v_margin_call
  ) then
    raise exception 'already_handled';
  end if;

  select state into v_founder_save
  from public.game_saves
  where user_id = v_control.original_founder_id
  for update;
  v_company := v_founder_save -> 'playerCompany';
  if jsonb_typeof(v_company) <> 'object' then raise exception 'company_missing'; end if;
  if coalesce(v_company ->> 'totalShares', '') ~ '^[0-9]+$' then
    v_total := greatest(1, (v_company ->> 'totalShares')::numeric);
  end if;
  if coalesce(v_company ->> 'cumulativeCapitalBurned', '') ~ '^[0-9]+(\.[0-9]+)?$' then
    v_capital := greatest(1, (v_company ->> 'cumulativeCapitalBurned')::numeric);
  end if;
  v_cash := public.player_company_saved_cash(v_controller_save);
  v_resolves := v_session + 24;

  if p_option = 'rehabilitation' then
    v_status := 'rehabilitation';
    v_vote_weight := greatest(1, v_control.control_vote_weight);
  elsif p_option = 'trust' then
    v_status := 'trust';
    v_vote_weight := greatest(
      v_control.control_vote_weight,
      1,
      floor(v_total * 0.10)
    );
  elsif p_option = 'rescue-loan' then
    v_status := 'loan-active';
    v_vote_weight := v_control.control_vote_weight;
    v_loan := greatest(
      1,
      least(
        round(v_capital * 0.20),
        greatest(round(v_capital * 0.05), -v_cash + round(v_capital * 0.02))
      )
    );
    v_controller_save := public.player_company_set_saved_cash(
      v_controller_save,
      v_cash + v_loan
    );
    update public.game_saves
    set state = v_controller_save,
        wallet_revision = wallet_revision + 1,
        updated_at = now()
    where user_id = v_user;
  else
    v_status := 'auction';
    v_auction := greatest(1, round(v_capital * 0.25));
  end if;

  insert into public.player_company_insolvency_cases (
    stock_id,
    insolvent_controller_id,
    margin_call_at_ms,
    option_type,
    status,
    opened_session,
    resolves_session,
    protected_vote_weight,
    rescue_loan_cents,
    rescue_loan_due_session,
    auction_price_cents
  )
  values (
    v_stock_id,
    v_user,
    v_margin_call,
    p_option,
    v_status,
    v_session,
    v_resolves,
    v_vote_weight,
    v_loan,
    case when p_option = 'rescue-loan' then v_resolves else null end,
    v_auction
  )
  returning * into v_case;

  update public.player_company_control_rights
  set control_source = case p_option
        when 'rehabilitation' then 'rehabilitation'
        when 'trust' then 'trust'
        when 'rescue-loan' then 'rescue-loan'
        else 'rehabilitation'
      end,
      control_vote_weight = v_vote_weight,
      updated_at = now()
  where stock_id = v_stock_id;

  perform public.player_company_mark_recovery(
    v_control.original_founder_id,
    v_case.id,
    p_option,
    v_status,
    v_resolves
  );
  return public.get_player_company_insolvency_status(v_stock_id);
end;
$$;

revoke all on function public.choose_player_company_insolvency_option(text, text)
  from public, anon;
grant execute on function public.choose_player_company_insolvency_option(text, text)
  to authenticated;

create or replace function public.repay_player_company_rescue_loan(
  p_case_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_case public.player_company_insolvency_cases;
  v_control public.player_company_control_rights;
  v_save jsonb;
  v_cash numeric;
  v_due numeric;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select * into v_case
  from public.player_company_insolvency_cases
  where id = p_case_id
  for update;
  if not found or v_case.status <> 'loan-active' then
    raise exception 'loan_not_active';
  end if;
  select * into v_control
  from public.player_company_control_rights
  where stock_id = v_case.stock_id and controller_id = v_user;
  if not found then raise exception 'not_controller'; end if;
  select state into v_save
  from public.game_saves
  where user_id = v_user
  for update;
  v_cash := public.player_company_saved_cash(v_save);
  v_due := round(v_case.rescue_loan_cents * 1.15);
  if v_cash < v_due then raise exception 'insufficient_cash'; end if;
  update public.game_saves
  set state = public.player_company_set_saved_cash(v_save, v_cash - v_due),
      wallet_revision = wallet_revision + 1,
      updated_at = now()
  where user_id = v_user;
  update public.player_company_insolvency_cases
  set status = 'closed', resolved_at = now()
  where id = p_case_id;
  update public.player_company_control_rights
  set control_source = case
        when controller_id = original_founder_id then 'founder'
        else 'm-and-a'
      end,
      updated_at = now()
  where stock_id = v_case.stock_id;
  perform public.player_company_finish_recovery(
    v_control.original_founder_id,
    v_case.id,
    'closed'
  );
  return jsonb_build_object('success', true, 'repaidCents', v_due);
end;
$$;

revoke all on function public.repay_player_company_rescue_loan(uuid)
  from public, anon;
grant execute on function public.repay_player_company_rescue_loan(uuid)
  to authenticated;

create or replace function public.list_open_player_company_auctions()
returns table (
  case_id uuid,
  stock_id text,
  ticker text,
  company_name text,
  original_founder_game_id text,
  auction_price_cents numeric,
  opened_session bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    insolvency.id,
    insolvency.stock_id,
    listing.ticker,
    coalesce(
      founder_save.state -> 'playerCompany' ->> 'name',
      listing.ticker
    ),
    coalesce(account.game_id, 'unknown'),
    insolvency.auction_price_cents,
    insolvency.opened_session
  from public.player_company_insolvency_cases insolvency
  join public.player_company_market_listings listing
    on listing.stock_id = insolvency.stock_id
  left join public.game_saves founder_save
    on founder_save.user_id = listing.original_founder_id
  left join public.game_accounts account
    on account.user_id = listing.original_founder_id
  where insolvency.status = 'auction'
  order by insolvency.opened_session asc;
$$;

revoke all on function public.list_open_player_company_auctions()
  from public, anon;
grant execute on function public.list_open_player_company_auctions()
  to authenticated;

create or replace function public.acquire_player_company_control(
  p_case_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_case public.player_company_insolvency_cases;
  v_control public.player_company_control_rights;
  v_buyer_save jsonb;
  v_seller_save jsonb;
  v_buyer_cash numeric;
  v_seller_cash numeric;
  v_total numeric := 1;
  v_vote_weight numeric := 1;
  v_session bigint := floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
begin
  if v_buyer is null then raise exception 'not_authenticated'; end if;
  select * into v_case
  from public.player_company_insolvency_cases
  where id = p_case_id
  for update;
  if not found or v_case.status <> 'auction' then
    raise exception 'auction_closed';
  end if;
  if v_case.insolvent_controller_id = v_buyer then
    raise exception 'self_acquisition';
  end if;
  select * into v_control
  from public.player_company_control_rights
  where stock_id = v_case.stock_id
  for update;

  select state into v_buyer_save
  from public.game_saves
  where user_id = v_buyer
  for update;
  v_buyer_cash := public.player_company_saved_cash(v_buyer_save);
  if v_buyer_cash < v_case.auction_price_cents then
    raise exception 'insufficient_cash';
  end if;
  update public.game_saves
  set state = public.player_company_set_saved_cash(
        v_buyer_save,
        v_buyer_cash - v_case.auction_price_cents
      ),
      wallet_revision = wallet_revision + 1,
      updated_at = now()
  where user_id = v_buyer;

  select state into v_seller_save
  from public.game_saves
  where user_id = v_case.insolvent_controller_id
  for update;
  v_seller_cash := public.player_company_saved_cash(v_seller_save);
  update public.game_saves
  set state = public.player_company_set_saved_cash(
        v_seller_save,
        v_seller_cash + v_case.auction_price_cents
      ),
      wallet_revision = wallet_revision + 1,
      updated_at = now()
  where user_id = v_case.insolvent_controller_id;

  select greatest(1, state.total_shares)
    into v_total
  from public.player_company_market_state state
  where state.stock_id = v_case.stock_id;
  v_vote_weight := greatest(1, floor(coalesce(v_total, 1) * 0.10));

  update public.player_company_control_rights
  set controller_id = v_buyer,
      control_source = 'm-and-a',
      control_vote_weight = v_vote_weight,
      acquired_session = v_session,
      updated_at = now()
  where stock_id = v_case.stock_id;
  update public.player_company_market_listings
  set founder_id = v_buyer
  where stock_id = v_case.stock_id;
  update public.player_company_market_state
  set founder_id = v_buyer, updated_at = now()
  where stock_id = v_case.stock_id;
  update public.player_company_insolvency_cases
  set status = 'transferred',
      buyer_id = v_buyer,
      resolved_at = now()
  where id = p_case_id;
  perform public.player_company_finish_recovery(
    v_control.original_founder_id,
    v_case.id,
    'transferred'
  );
  return jsonb_build_object(
    'success', true,
    'stockId', v_case.stock_id,
    'controlVoteWeight', v_vote_weight
  );
end;
$$;

revoke all on function public.acquire_player_company_control(uuid)
  from public, anon;
grant execute on function public.acquire_player_company_control(uuid)
  to authenticated;

create or replace function public.list_my_controlled_player_companies()
returns table (
  stock_id text,
  ticker text,
  company_name text,
  sector text,
  original_founder_game_id text,
  is_original_founder boolean,
  control_source text,
  control_vote_weight numeric,
  acquired_session bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    control.stock_id,
    listing.ticker,
    coalesce(
      founder_save.state -> 'playerCompany' ->> 'name',
      listing.ticker
    ),
    coalesce(
      founder_save.state -> 'playerCompany' ->> 'sector',
      '기타'
    ),
    coalesce(account.game_id, 'unknown'),
    control.original_founder_id = auth.uid(),
    control.control_source,
    control.control_vote_weight,
    control.acquired_session
  from public.player_company_control_rights control
  join public.player_company_market_listings listing
    on listing.stock_id = control.stock_id
  left join public.game_saves founder_save
    on founder_save.user_id = control.original_founder_id
  left join public.game_accounts account
    on account.user_id = control.original_founder_id
  where control.controller_id = auth.uid()
  order by
    case when control.original_founder_id = auth.uid() then 0 else 1 end,
    control.acquired_session asc nulls first,
    listing.ticker asc;
$$;

revoke all on function public.list_my_controlled_player_companies()
  from public, anon;
grant execute on function public.list_my_controlled_player_companies()
  to authenticated;

-- 경영권자는 의사결정을 내리되, 결과는 원 설립자의 법인 장부에 반영한다.
-- 이렇게 해야 한 플레이어가 여러 회사를 인수해도 개인 지갑이나 자기 회사 장부에
-- 다른 회사의 실적·자본 작업이 중복 기록되지 않는다.
create or replace function public.choose_player_company_board_decision(
  p_stock_id text,
  p_decision_type text
)
returns public.player_company_board_decisions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_stock_id text := lower(trim(coalesce(p_stock_id, '')));
  v_listing public.player_company_market_listings;
  v_control public.player_company_control_rights;
  v_session bigint := floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
  v_resolve_session bigint;
  v_row public.player_company_board_decisions;
  v_success boolean;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_decision_type not in ('research', 'dividend', 'buyback', 'acquisition') then
    raise exception 'invalid_decision_type';
  end if;
  select * into v_control
  from public.player_company_control_rights
  where stock_id = v_stock_id and controller_id = v_user;
  if not found then raise exception 'not_founder'; end if;
  select * into v_listing
  from public.player_company_market_listings
  where stock_id = v_stock_id;
  if not found then raise exception 'listing_missing'; end if;

  v_resolve_session := v_session + 24;
  if exists (
    select 1 from public.player_company_board_decisions
    where stock_id = v_stock_id and resolve_session = v_resolve_session
  ) then
    raise exception 'already_chosen';
  end if;

  v_success := mod(
    abs(hashtext(v_stock_id || ':' || v_resolve_session::text)),
    100
  ) < 65;

  insert into public.player_company_board_decisions (
    stock_id, ticker, founder_id, decision_type,
    selected_session, resolve_session, outcome_label,
    earnings_growth_delta, price_factor, reputation_delta
  )
  values (
    v_stock_id,
    v_listing.ticker,
    v_control.original_founder_id,
    p_decision_type,
    v_session,
    v_resolve_session,
    case p_decision_type
      when 'research' then '연구개발 성과'
      when 'dividend' then '주주환원 강화'
      when 'buyback' then '자사주 매입 효과'
      else case when v_success then '인수 시너지 성공' else '인수 통합 비용 발생' end
    end,
    case p_decision_type
      when 'research' then 4.5
      when 'dividend' then -0.5
      when 'buyback' then 0.5
      else case when v_success then 6 else -4 end
    end,
    case p_decision_type
      when 'research' then 1.04
      when 'dividend' then 1.02
      when 'buyback' then 1.035
      else case when v_success then 1.06 else 0.94 end
    end,
    case p_decision_type
      when 'research' then 4
      when 'dividend' then 3
      when 'buyback' then 2
      else case when v_success then 5 else -3 end
    end
  )
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.create_player_company_governance_proposal(
  p_stock_id text,
  p_proposal_type text,
  p_proposed_value numeric
)
returns public.player_company_governance_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_stock_id text := lower(trim(coalesce(p_stock_id, '')));
  v_listing public.player_company_market_listings;
  v_control public.player_company_control_rights;
  v_save jsonb;
  v_company jsonb;
  v_session bigint := floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
  v_value numeric := coalesce(p_proposed_value, 0);
  v_row public.player_company_governance_proposals;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select * into v_control
  from public.player_company_control_rights
  where stock_id = v_stock_id and controller_id = v_user;
  if not found then raise exception 'not_founder'; end if;
  select * into v_listing
  from public.player_company_market_listings
  where stock_id = v_stock_id;
  if not found then raise exception 'listing_missing'; end if;
  if p_proposal_type not in (
    'dividend',
    'issue',
    'retire',
    'expansion',
    'ceo_change',
    'asset_sale'
  ) then
    raise exception 'invalid_proposal_type';
  end if;
  if exists (
    select 1 from public.player_company_governance_proposals
    where stock_id = v_stock_id and status = 'open'
  ) then
    raise exception 'open_proposal_exists';
  end if;

  if p_proposal_type = 'dividend' then
    if v_value < 0 or v_value > 0.5 then raise exception 'invalid_value'; end if;
  elsif p_proposal_type in ('issue', 'retire', 'asset_sale') then
    if v_value < 0.01 or v_value > 0.2 then raise exception 'invalid_value'; end if;
  else
    v_value := 1;
  end if;

  select state into v_save
  from public.game_saves
  where user_id = v_control.original_founder_id;
  v_company := v_save -> 'playerCompany';
  insert into public.player_company_governance_proposals (
    stock_id, ticker, company_name, founder_id, proposal_type,
    proposed_value, opened_session, closes_session
  )
  values (
    v_stock_id,
    v_listing.ticker,
    coalesce(v_company ->> 'name', v_listing.ticker),
    v_control.original_founder_id,
    p_proposal_type,
    v_value,
    v_session,
    v_session + 24
  )
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.choose_player_company_board_decision(text, text)
  from public, anon;
grant execute on function public.choose_player_company_board_decision(text, text)
  to authenticated;
revoke all on function public.create_player_company_governance_proposal(text, text, numeric)
  from public, anon;
grant execute on function public.create_player_company_governance_proposal(text, text, numeric)
  to authenticated;

-- 신탁·M&A 계약의 의결권 블록은 실제 계좌 보유분과 별도로 더한다.
create or replace function public.player_company_effective_voting_weight(
  p_user_id uuid,
  p_stock_id text
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select
    public.player_company_account_holding_quantity(p_user_id, p_stock_id) +
    coalesce((
      select control.control_vote_weight
      from public.player_company_control_rights control
      where control.stock_id = lower(trim(coalesce(p_stock_id, '')))
        and control.controller_id = p_user_id
    ), 0);
$$;

revoke all on function public.player_company_effective_voting_weight(uuid, text)
  from public, anon, authenticated;

create or replace function public.cast_player_company_governance_vote(
  p_proposal_id uuid,
  p_vote text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session bigint := floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
  v_proposal public.player_company_governance_proposals;
  v_weight numeric := 0;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_vote not in ('yes', 'no') then raise exception 'invalid_vote'; end if;
  select * into v_proposal
  from public.player_company_governance_proposals
  where id = p_proposal_id
  for update;
  if not found or v_proposal.status <> 'open'
     or v_session >= v_proposal.closes_session
  then
    raise exception 'vote_closed';
  end if;

  if exists (
    select 1
    from public.player_company_control_rights control
    where control.stock_id = v_proposal.stock_id
      and control.controller_id = v_user
  ) then
    v_weight := public.player_company_effective_voting_weight(
      v_user,
      v_proposal.stock_id
    );
  else
    select greatest(0, current_quantity)
      into v_weight
    from public.player_company_shareholder_streaks
    where user_id = v_user
      and stock_id = v_proposal.stock_id
      and current_quantity >= 1
      and held_since_session is not null
      and held_since_session <= v_session - 90;
  end if;
  if coalesce(v_weight, 0) <= 0 then raise exception 'not_eligible'; end if;

  insert into public.player_company_governance_votes (
    proposal_id, voter_id, vote, voting_weight
  )
  values (p_proposal_id, v_user, p_vote, v_weight)
  on conflict (proposal_id, voter_id) do update
  set vote = excluded.vote,
      voting_weight = excluded.voting_weight,
      cast_at = now();
end;
$$;

create or replace function public.list_player_company_governance_proposals()
returns table (
  id uuid,
  stock_id text,
  ticker text,
  company_name text,
  proposal_type text,
  proposed_value numeric,
  opened_session bigint,
  closes_session bigint,
  status text,
  yes_weight numeric,
  no_weight numeric,
  eligible boolean,
  voting_weight numeric,
  is_founder boolean,
  my_vote text,
  reputation_delta integer
)
language sql
stable
security definer
set search_path = public
as $$
  with current_clock as (
    select
      auth.uid() as user_id,
      floor(extract(epoch from clock_timestamp()) / 3600)::bigint as session
  ),
  totals as (
    select
      proposal_id,
      coalesce(sum(voting_weight) filter (where vote = 'yes'), 0) as yes_weight,
      coalesce(sum(voting_weight) filter (where vote = 'no'), 0) as no_weight
    from public.player_company_governance_votes
    group by proposal_id
  )
  select
    proposal.id,
    proposal.stock_id,
    proposal.ticker,
    proposal.company_name,
    proposal.proposal_type,
    proposal.proposed_value,
    proposal.opened_session,
    proposal.closes_session,
    proposal.status,
    coalesce(totals.yes_weight, 0),
    coalesce(totals.no_weight, 0),
    case
      when control.controller_id = current_clock.user_id then
        public.player_company_effective_voting_weight(
          current_clock.user_id,
          proposal.stock_id
        ) >= 1
      else (
        streak.current_quantity >= 1
        and streak.held_since_session is not null
        and streak.held_since_session <= current_clock.session - 90
      )
    end as eligible,
    case
      when control.controller_id = current_clock.user_id then
        public.player_company_effective_voting_weight(
          current_clock.user_id,
          proposal.stock_id
        )
      else coalesce(streak.current_quantity, 0)
    end as voting_weight,
    control.controller_id = current_clock.user_id as is_founder,
    own_vote.vote,
    proposal.reputation_delta
  from public.player_company_governance_proposals proposal
  cross join current_clock
  left join totals on totals.proposal_id = proposal.id
  left join public.player_company_governance_votes own_vote
    on own_vote.proposal_id = proposal.id
   and own_vote.voter_id = current_clock.user_id
  left join public.player_company_shareholder_streaks streak
    on streak.user_id = current_clock.user_id
   and streak.stock_id = proposal.stock_id
  left join public.player_company_control_rights control
    on control.stock_id = proposal.stock_id
  where proposal.status = 'open'
     or proposal.closes_session >= current_clock.session - 72
  order by
    case when proposal.status = 'open' then 0 else 1 end,
    proposal.closes_session asc;
$$;

revoke all on function public.cast_player_company_governance_vote(uuid, text)
  from public, anon;
grant execute on function public.cast_player_company_governance_vote(uuid, text)
  to authenticated;
revoke all on function public.list_player_company_governance_proposals()
  from public, anon;
grant execute on function public.list_player_company_governance_proposals()
  to authenticated;
