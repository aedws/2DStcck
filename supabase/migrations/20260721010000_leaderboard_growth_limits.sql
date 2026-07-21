-- 리더보드 서버 검증 한도를 클라이언트 정책과 다시 맞춘다.
--
-- 1) 순자산 상한: 7/19 자금 상한 폐지(무한 성장) 이후에도 서버는 $10조
--    (1e15센트)에서 제출을 거부해, 그 이상 성장한 계정의 랭킹이 멈췄다.
--    클라이언트 제출 상한(LEADERBOARD_MAX_NET_WORTH = 9e18, int8 안전값)과
--    동일하게 올린다.
-- 2) 거래 수 상한: 저장 지갑의 거래 내역 보존이 200 → 500건으로 늘어나
--    (단타 계정 당일 내역 보존), 200 초과 계정이 'trade count mismatch'로
--    거부되던 것을 500까지 허용한다.
-- 나머지 검증(저장 지갑 대조·수익률·회차·급등 점프)은 그대로 유지한다.

create or replace function public.submit_leaderboard(
  p_display_name text,
  p_net_worth bigint,
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
  v_save jsonb;
  v_saved_initial bigint;
  v_saved_luxury_count int;
  v_saved_trade_count int;
  v_expected_return numeric;
  v_now_session bigint;
  v_week_start date := date_trunc('week', timezone('Asia/Seoul', now()))::date;
  v_weekly_baseline bigint;
  v_weekly_return numeric := 0;
  v_previous public.leaderboard%rowtype;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select state into v_save from public.game_saves where user_id = v_uid;
  if v_save is null then raise exception 'game save required before leaderboard submission'; end if;

  v_saved_initial := coalesce((v_save->>'initialCash')::bigint, 0);
  v_saved_luxury_count := coalesce(jsonb_array_length(coalesce(v_save->'ownedLuxuries', '[]'::jsonb)), 0);
  v_saved_trade_count := coalesce(jsonb_array_length(coalesce(v_save->'trades', '[]'::jsonb)), 0);
  v_now_session := floor(extract(epoch from now()) * 1000 / 3600000)::bigint;

  if p_initial_cash <= 0 or p_initial_cash <> v_saved_initial then raise exception 'initial cash mismatch'; end if;
  if p_luxury_count <> v_saved_luxury_count or p_luxury_count < 0 or p_luxury_count > 100 then raise exception 'luxury count mismatch'; end if;
  if p_trade_count <> v_saved_trade_count or p_trade_count < 0 or p_trade_count > 500 then raise exception 'trade count mismatch'; end if;
  if p_win_rate < 0 or p_win_rate > 100 then raise exception 'win rate outside allowed range'; end if;
  if length(p_title) > 30 then raise exception 'title too long'; end if;
  if abs(p_market_session - v_now_session) > 2 then raise exception 'stale market session'; end if;
  if p_net_worth < -100000000000 or p_net_worth > 9000000000000000000 then raise exception 'net worth outside allowed range'; end if;
  if p_reputation < 0 or p_reputation > 1000000000 then raise exception 'reputation outside allowed range'; end if;
  if p_prestige < 0 or p_prestige > 100000000 then raise exception 'prestige outside allowed range'; end if;

  v_expected_return := ((p_net_worth - p_initial_cash)::numeric / p_initial_cash::numeric) * 100;
  if abs(v_expected_return - p_return_rate) > 0.06 then raise exception 'return rate mismatch'; end if;

  select * into v_previous from public.leaderboard where user_id = v_uid;
  if found and now() - v_previous.updated_at < interval '30 seconds' and
     p_net_worth > v_previous.net_worth + 50000000 + abs(v_previous.net_worth) * 2 then
    raise exception 'implausible rapid net worth increase';
  end if;

  if found and v_previous.weekly_start = v_week_start and v_previous.weekly_start_net_worth > 0 then
    v_weekly_baseline := v_previous.weekly_start_net_worth;
    v_weekly_return := ((p_net_worth - v_weekly_baseline)::numeric / v_weekly_baseline::numeric) * 100;
  else
    v_weekly_baseline := greatest(1, p_net_worth);
  end if;

  insert into public.leaderboard (
    user_id, display_name, net_worth, return_rate, initial_cash, market_session,
    top_tier, luxury_count, showcase, reputation, integrity_status,
    weekly_start, weekly_start_net_worth, weekly_return, title,
    trade_count, win_rate, prestige, updated_at
  ) values (
    v_uid, left(p_display_name, 40), p_net_worth, p_return_rate, p_initial_cash,
    p_market_session, p_top_tier, p_luxury_count, coalesce(p_showcase, '{}'),
    p_reputation, 'basic', v_week_start, v_weekly_baseline,
    round(v_weekly_return, 2), left(p_title, 30), p_trade_count,
    round(p_win_rate, 2), greatest(0, p_prestige), now()
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
