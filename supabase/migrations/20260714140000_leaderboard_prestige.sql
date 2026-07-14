-- 프레스티지(수집·경쟁 종합) 점수를 리더보드에 동기화한다.
-- 정체성: "돈은 연료, 대표 성취는 수집·경쟁". 순자산은 부가 지표로 남기고
-- 프레스티지를 별도 순위 축으로 제공한다.
--
-- 하위호환: 새 인자 p_prestige 는 DEFAULT 0 이라, 프레스티지를 보내지 않는
-- 기존(구버전) 클라이언트가 12개 인자로 호출해도 그대로 동작한다.

alter table public.leaderboard
  add column if not exists prestige int not null default 0;

create index if not exists leaderboard_prestige_idx
  on public.leaderboard (prestige desc);

-- 구 시그니처(12인자)를 제거해 오버로드 모호성을 피하고, 프레스티지 포함
-- 신 시그니처(13인자, 마지막 기본값)로 교체한다.
drop function if exists public.submit_leaderboard(
  text, bigint, numeric, bigint, bigint, int, int, text[], bigint,
  text, int, numeric
);

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
  if p_trade_count <> v_saved_trade_count or p_trade_count < 0 or p_trade_count > 200 then raise exception 'trade count mismatch'; end if;
  if p_win_rate < 0 or p_win_rate > 100 then raise exception 'win rate outside allowed range'; end if;
  if length(p_title) > 30 then raise exception 'title too long'; end if;
  if abs(p_market_session - v_now_session) > 2 then raise exception 'stale market session'; end if;
  if p_net_worth < -100000000000 or p_net_worth > 1000000000000000 then raise exception 'net worth outside allowed range'; end if;
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

revoke all on function public.submit_leaderboard(
  text, bigint, numeric, bigint, bigint, int, int, text[], bigint,
  text, int, numeric, int
) from public, anon;
grant execute on function public.submit_leaderboard(
  text, bigint, numeric, bigint, bigint, int, int, text[], bigint,
  text, int, numeric, int
) to authenticated;
