-- 플레이어 회사 경영실 결과를 모든 계정이 재생하는 공통 주가·뉴스 원장에 연결한다.

create table if not exists public.player_company_strategy_events (
  id uuid primary key default gen_random_uuid(),
  stock_id text not null,
  founder_id uuid not null references auth.users (id) on delete cascade,
  event_key text not null,
  event_type text not null check (
    event_type in ('guidance', 'crisis', 'credit', 'dividend', 'supply', 'talent')
  ),
  event_session bigint not null,
  tone text not null check (tone in ('positive', 'neutral', 'negative')),
  created_at timestamptz not null default now(),
  unique (stock_id, event_key),
  unique (stock_id, event_type, event_session)
);

alter table public.player_company_strategy_events enable row level security;
revoke all on public.player_company_strategy_events
  from public, anon, authenticated;

create or replace function public.record_player_company_strategy_event(
  p_stock_id text,
  p_event_key text,
  p_event_type text,
  p_event_session bigint,
  p_title text,
  p_description text,
  p_tone text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_stock_id text := lower(trim(coalesce(p_stock_id, '')));
  v_listing public.player_company_market_listings;
  v_save jsonb;
  v_company jsonb;
  v_event jsonb;
  v_result_id uuid;
  v_factor numeric := 1;
  v_tick bigint;
  v_epoch_seconds bigint := 1783728000;
  v_total bigint;
  v_public bigint;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_event_type not in (
    'guidance', 'crisis', 'credit', 'dividend', 'supply', 'talent'
  ) then
    raise exception 'invalid_event_type';
  end if;
  if p_tone not in ('positive', 'neutral', 'negative') then
    raise exception 'invalid_tone';
  end if;
  if length(trim(coalesce(p_event_key, ''))) < 3
     or length(p_event_key) > 160
     or length(trim(coalesce(p_title, ''))) < 2
     or length(p_title) > 120
     or length(trim(coalesce(p_description, ''))) < 2
     or length(p_description) > 500
  then
    raise exception 'invalid_event';
  end if;

  select * into v_listing
  from public.player_company_market_listings
  where stock_id = v_stock_id and founder_id = v_user;
  if not found then raise exception 'not_founder'; end if;

  select state into v_save
  from public.game_saves
  where user_id = v_user;
  v_company := v_save -> 'playerCompany';
  select item into v_event
  from jsonb_array_elements(
    coalesce(v_company #> '{management,history}', '[]'::jsonb)
  ) item
  where item ->> 'id' = p_event_key
  limit 1;
  if v_event is null
     or coalesce((v_event ->> 'session')::bigint, -1) <> p_event_session
     or v_event ->> 'title' <> p_title
     or v_event ->> 'description' <> p_description
     or v_event ->> 'tone' <> p_tone
  then
    raise exception 'event_not_saved';
  end if;

  if p_event_type = 'guidance' then
    v_factor := case p_tone when 'positive' then 1.05 when 'negative' then 0.92 else 1 end;
  elsif p_event_type = 'crisis' then
    v_factor := case p_tone when 'positive' then 1.04 when 'negative' then 0.95 else 1 end;
  elsif p_event_type = 'credit' then
    v_factor := case p_tone when 'positive' then 1.02 when 'negative' then 0.94 else 0.995 end;
  elsif p_event_type = 'dividend' then
    v_factor := case p_tone when 'positive' then 1.02 when 'negative' then 0.96 else 1 end;
  elsif p_event_type = 'supply' then
    v_factor := case p_tone when 'positive' then 1.025 when 'negative' then 0.98 else 1 end;
  else
    v_factor := case p_tone when 'positive' then 1.02 when 'negative' then 0.98 else 1 end;
  end if;

  insert into public.player_company_strategy_events (
    stock_id, founder_id, event_key, event_type, event_session, tone
  )
  values (
    v_stock_id, v_user, p_event_key, p_event_type, p_event_session, p_tone
  )
  on conflict do nothing
  returning id into v_result_id;
  if v_result_id is null then return true; end if;

  v_total := greatest(1, coalesce((v_company ->> 'totalShares')::bigint, 1));
  v_public := greatest(0, coalesce((v_company ->> 'publicShares')::bigint, 0));
  v_tick := greatest(0, p_event_session * 3600 - v_epoch_seconds);
  select greatest(v_tick, coalesce(max(effective_tick) + 1, v_tick))
    into v_tick
  from public.player_company_market_actions
  where stock_id = v_stock_id;

  insert into public.player_company_market_actions (
    request_id, stock_id, ticker, action_type, shares,
    total_shares_before, public_shares_before,
    total_shares_after, public_shares_after,
    price_factor, price_cents, effective_tick, declared_by,
    decision_type, headline, description,
    reputation_delta, earnings_growth_delta
  )
  values (
    v_result_id, v_stock_id, v_listing.ticker, 'board', 0,
    v_total, v_public, v_total, v_public,
    v_factor, 1, v_tick, v_user,
    p_event_type, v_listing.ticker || ' · ' || p_title, p_description,
    0, 0
  )
  on conflict (request_id) do nothing;
  return true;
end;
$$;

revoke all on function public.record_player_company_strategy_event(
  text, text, text, bigint, text, text, text
) from public, anon;
grant execute on function public.record_player_company_strategy_event(
  text, text, text, bigint, text, text, text
) to authenticated;
