-- JS의 IEEE-754 number 변환을 거치지 않고 임의 크기 순자산을 왕복한다.
-- 클라이언트는 정수 센트와 수익률을 문자열로 제출하고, 조회 결과도 text로 받는다.

create or replace function public.submit_leaderboard_precise(
  p_display_name text,
  p_net_worth text,
  p_return_rate text,
  p_initial_cash text,
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
begin
  if p_net_worth !~ '^-?[0-9]+$' then
    raise exception 'invalid exact net worth';
  end if;
  if p_initial_cash !~ '^[0-9]+$' then
    raise exception 'invalid exact initial cash';
  end if;
  if p_return_rate !~ '^-?[0-9]+([.][0-9]+)?$' then
    raise exception 'invalid exact return rate';
  end if;

  perform public.submit_leaderboard(
    p_display_name,
    p_net_worth::numeric,
    p_return_rate::numeric,
    p_initial_cash::bigint,
    p_market_session,
    p_top_tier,
    p_luxury_count,
    p_showcase,
    p_reputation,
    p_title,
    p_trade_count,
    p_win_rate,
    p_prestige
  );
end;
$$;

revoke all on function public.submit_leaderboard_precise(
  text, text, text, text, bigint, int, int, text[], bigint,
  text, int, numeric, int
) from public, anon;
grant execute on function public.submit_leaderboard_precise(
  text, text, text, text, bigint, int, int, text[], bigint,
  text, int, numeric, int
) to authenticated;

create or replace function public.get_leaderboard_exact(
  p_limit int default 100,
  p_sort text default 'netWorth'
) returns table (
  user_id uuid,
  display_name text,
  net_worth_exact text,
  return_rate_exact text,
  weekly_return_exact text,
  top_tier int,
  luxury_count int,
  showcase text[],
  updated_at timestamptz,
  title text,
  trade_count int,
  win_rate numeric,
  prestige int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.user_id,
    l.display_name,
    l.net_worth::text,
    l.return_rate::text,
    coalesce(l.weekly_return, 0)::text,
    l.top_tier,
    l.luxury_count,
    l.showcase,
    l.updated_at,
    l.title,
    l.trade_count,
    l.win_rate,
    coalesce(l.prestige, 0)
  from public.leaderboard l
  order by
    case when p_sort = 'weekly' then l.weekly_return end desc nulls last,
    case when p_sort = 'prestige' then l.prestige end desc nulls last,
    case when p_sort not in ('weekly', 'prestige') then l.net_worth end desc nulls last,
    l.net_worth desc,
    l.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.get_leaderboard_exact(int, text)
  from public;
grant execute on function public.get_leaderboard_exact(int, text)
  to anon, authenticated;
