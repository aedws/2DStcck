-- Qa 이상 순자산과 500건 거래 지갑의 랭킹 제출을 빠르고 정확하게 처리한다.
--
-- 1) leaderboard.net_worth를 bigint에서 numeric으로 바꿔 $90Qa 부근의 int8
--    한계를 없앤다. 게임 클라이언트가 표현할 수 있는 모든 유한 순자산을 받는다.
-- 2) game_saves의 대형 state JSON을 랭킹 제출 때마다 다시 펼치지 않도록, 검증에
--    필요한 세 값만 STORED 생성 열로 미리 계산한다. 500건 거래 내역이 있어도
--    submit_leaderboard는 작은 고정 크기 열만 읽는다.
-- 3) 거액 수익률 검증 오차를 값 크기에 비례해 허용하고, 제출 간격 단축은
--    클라이언트(10분 -> 1분)에서 담당한다.

alter table public.leaderboard
  alter column net_worth type numeric using net_worth::numeric,
  alter column weekly_start_net_worth type numeric
    using weekly_start_net_worth::numeric;

alter table public.game_saves
  add column if not exists leaderboard_initial_cash bigint
    generated always as (
      coalesce((state ->> 'initialCash')::bigint, 0)
    ) stored,
  add column if not exists leaderboard_luxury_count int
    generated always as (
      coalesce(
        jsonb_array_length(coalesce(state -> 'ownedLuxuries', '[]'::jsonb)),
        0
      )
    ) stored,
  add column if not exists leaderboard_trade_count int
    generated always as (
      coalesce(
        jsonb_array_length(coalesce(state -> 'trades', '[]'::jsonb)),
        0
      )
    ) stored;

drop function if exists public.submit_leaderboard(
  text, bigint, numeric, bigint, bigint, int, int, text[], bigint,
  text, int, numeric, int
);

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
  v_week_start date := date_trunc('week', timezone('Asia/Seoul', now()))::date;
  v_weekly_baseline numeric;
  v_weekly_return numeric := 0;
  v_previous public.leaderboard%rowtype;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select
    leaderboard_initial_cash,
    leaderboard_luxury_count,
    leaderboard_trade_count
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
  if abs(v_expected_return - p_return_rate) > v_return_tolerance then raise exception 'return rate mismatch'; end if;

  select * into v_previous from public.leaderboard where user_id = v_uid;
  if found and now() - v_previous.updated_at < interval '30 seconds' and
     p_net_worth > v_previous.net_worth + 50000000 + abs(v_previous.net_worth) * 2 then
    raise exception 'implausible rapid net worth increase';
  end if;

  if found and v_previous.weekly_start = v_week_start and v_previous.weekly_start_net_worth > 0 then
    v_weekly_baseline := v_previous.weekly_start_net_worth;
    v_weekly_return := ((p_net_worth - v_weekly_baseline) / v_weekly_baseline) * 100;
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
  text, numeric, numeric, bigint, bigint, int, int, text[], bigint,
  text, int, numeric, int
) from public, anon;
grant execute on function public.submit_leaderboard(
  text, numeric, numeric, bigint, bigint, int, int, text[], bigint,
  text, int, numeric, int
) to authenticated;
