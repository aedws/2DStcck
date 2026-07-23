-- 순자산 랭킹 수익률을 최초 재화 대비가 아닌 실제 7거래일 전 대비로 계산한다.
-- 제출값은 numeric으로 유지하고 조회만 text로 내보내 JS 정밀도 손실을 피한다.

create table if not exists public.leaderboard_session_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  market_session bigint not null,
  net_worth numeric not null,
  created_at timestamptz not null default now(),
  primary key (user_id, market_session)
);

create index if not exists leaderboard_snapshots_user_session_idx
  on public.leaderboard_session_snapshots (user_id, market_session desc);

alter table public.leaderboard_session_snapshots enable row level security;
revoke all on public.leaderboard_session_snapshots from public, anon, authenticated;

create or replace function public.submit_leaderboard(
  p_display_name text,
  p_net_worth numeric,
  p_return_rate numeric,
  p_initial_cash bigint,
  p_market_session bigint,
  p_top_tier int,
  p_luxury_count int,
  p_showcase text[],
  p_reputation bigint,
  p_title text,
  p_trade_count int,
  p_win_rate numeric,
  p_prestige int default 0
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_saved_initial bigint;
  v_saved_luxury_count int;
  v_saved_trade_count int;
  v_expected_return numeric;
  v_return_tolerance numeric;
  v_now_session bigint;
  v_baseline_session bigint;
  v_baseline numeric;
  v_rolling_return numeric := 0;
  v_previous public.leaderboard%rowtype;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select leaderboard_initial_cash, leaderboard_luxury_count, leaderboard_trade_count
    into v_saved_initial, v_saved_luxury_count, v_saved_trade_count
  from public.game_saves
  where user_id = v_uid;

  if not found then raise exception 'game save required before leaderboard submission'; end if;
  v_now_session := floor(extract(epoch from now()) * 1000 / 3600000)::bigint;

  if p_initial_cash <= 0 or p_initial_cash <> v_saved_initial then raise exception 'initial cash mismatch'; end if;
  if p_luxury_count <> v_saved_luxury_count or p_luxury_count < 0 or p_luxury_count > 100 then raise exception 'luxury count mismatch'; end if;
  if p_trade_count <> v_saved_trade_count or p_trade_count < 0 or p_trade_count > 500 then raise exception 'trade count mismatch'; end if;
  if p_win_rate < 0 or p_win_rate > 100 then raise exception 'win rate outside allowed range'; end if;
  if length(p_title) > 30 then raise exception 'title too long'; end if;
  if abs(p_market_session - v_now_session) > 2 then raise exception 'stale market session'; end if;
  if p_net_worth < -100000000000 then raise exception 'net worth outside allowed range'; end if;
  if p_reputation < 0 or p_reputation > 1000000000 then raise exception 'reputation outside allowed range'; end if;
  if p_prestige < 0 or p_prestige > 100000000 then raise exception 'prestige outside allowed range'; end if;

  v_expected_return := ((p_net_worth - p_initial_cash::numeric) / p_initial_cash::numeric) * 100;
  v_return_tolerance := greatest(0.06, abs(v_expected_return) * 0.0001);
  if abs(v_expected_return - p_return_rate) > v_return_tolerance then
    raise exception 'return rate mismatch';
  end if;

  select * into v_previous from public.leaderboard where user_id = v_uid;
  if found and now() - v_previous.updated_at < interval '30 seconds' and
     p_net_worth > v_previous.net_worth + 50000000 + abs(v_previous.net_worth) * 2 then
    raise exception 'implausible rapid net worth increase';
  end if;

  insert into public.leaderboard_session_snapshots (
    user_id, market_session, net_worth, created_at
  ) values (
    v_uid, p_market_session, p_net_worth, now()
  )
  on conflict (user_id, market_session) do update set
    net_worth = excluded.net_worth,
    created_at = now();

  -- 정확히 7세션 전 또는 그보다 가까운 과거의 마지막 스냅샷을 기준으로 쓴다.
  select s.market_session, s.net_worth
    into v_baseline_session, v_baseline
  from public.leaderboard_session_snapshots s
  where s.user_id = v_uid
    and s.market_session <= p_market_session - 7
  order by s.market_session desc
  limit 1;

  if v_baseline is not null and v_baseline > 0 then
    v_rolling_return := ((p_net_worth - v_baseline) / v_baseline) * 100;
  else
    v_baseline_session := p_market_session;
    v_baseline := greatest(1, p_net_worth);
    v_rolling_return := 0;
  end if;

  delete from public.leaderboard_session_snapshots
  where user_id = v_uid and market_session < p_market_session - 30;

  insert into public.leaderboard (
    user_id, display_name, net_worth, return_rate, initial_cash, market_session,
    top_tier, luxury_count, showcase, reputation, integrity_status,
    weekly_start, weekly_start_net_worth, weekly_return, title,
    trade_count, win_rate, prestige, updated_at
  ) values (
    v_uid, left(p_display_name, 40), p_net_worth, p_return_rate, p_initial_cash,
    p_market_session, p_top_tier, p_luxury_count, coalesce(p_showcase, '{}'),
    p_reputation, 'basic',
    (timestamp with time zone 'epoch' + v_baseline_session * interval '1 hour')
      at time zone 'Asia/Seoul',
    v_baseline, round(v_rolling_return, 8), left(p_title, 30),
    p_trade_count, round(p_win_rate, 2), greatest(0, p_prestige), now()
  )
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    net_worth = excluded.net_worth,
    return_rate = excluded.return_rate,
    initial_cash = excluded.initial_cash,
    market_session = excluded.market_session,
    top_tier = excluded.top_tier,
    luxury_count = excluded.luxury_count,
    showcase = excluded.showcase,
    reputation = excluded.reputation,
    integrity_status = 'basic',
    weekly_start = excluded.weekly_start,
    weekly_start_net_worth = excluded.weekly_start_net_worth,
    weekly_return = excluded.weekly_return,
    title = excluded.title,
    trade_count = excluded.trade_count,
    win_rate = excluded.win_rate,
    prestige = excluded.prestige,
    updated_at = now();
end;
$$;

revoke all on function public.submit_leaderboard(
  text, numeric, numeric, bigint, bigint, int, int, text[], bigint,
  text, int, numeric, int
) from public, anon;
grant execute on function public.submit_leaderboard(
  text, numeric, numeric, bigint, bigint, int, int, text[], bigint,
  text, int, numeric, int
) to authenticated;

-- 기존 달력 주간 누적값은 새 기준과 섞이지 않게 즉시 초기화한다.
update public.leaderboard
set weekly_return = 0,
    weekly_start_net_worth = greatest(1, net_worth),
    weekly_start = timezone('Asia/Seoul', now())::date;
