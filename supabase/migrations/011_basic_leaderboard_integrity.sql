-- 캐주얼 경쟁용 기본 무결성 검사.
-- 완전한 부정행위 방지는 주문 원장 서버 검증이 필요하지만, 이 함수는 직접 랭킹
-- upsert를 막고 저장 지갑·수익률·시장 회차·급격한 점프를 서버에서 확인한다.

alter table public.leaderboard
  add column if not exists initial_cash bigint not null default 10000000,
  add column if not exists market_session bigint not null default 0,
  add column if not exists reputation bigint not null default 0,
  add column if not exists integrity_status text not null default 'legacy';

create or replace function public.submit_leaderboard(
  p_display_name text,
  p_net_worth bigint,
  p_return_rate numeric,
  p_initial_cash bigint,
  p_market_session bigint,
  p_top_tier int,
  p_luxury_count int,
  p_showcase text[],
  p_reputation bigint
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
  v_expected_return numeric;
  v_now_session bigint;
  v_previous public.leaderboard%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select state into v_save from public.game_saves where user_id = v_uid;
  if v_save is null then
    raise exception 'game save required before leaderboard submission';
  end if;

  v_saved_initial := coalesce((v_save->>'initialCash')::bigint, 0);
  v_saved_luxury_count := coalesce(jsonb_array_length(coalesce(v_save->'ownedLuxuries', '[]'::jsonb)), 0);
  v_now_session := floor(extract(epoch from now()) * 1000 / 10800000)::bigint;

  if p_initial_cash <= 0 or p_initial_cash <> v_saved_initial then
    raise exception 'initial cash mismatch';
  end if;
  if p_luxury_count <> v_saved_luxury_count or p_luxury_count < 0 or p_luxury_count > 100 then
    raise exception 'luxury count mismatch';
  end if;
  if abs(p_market_session - v_now_session) > 2 then
    raise exception 'stale market session';
  end if;
  if p_net_worth < -100000000000 or p_net_worth > 1000000000000000 then
    raise exception 'net worth outside allowed range';
  end if;
  if p_reputation < 0 or p_reputation > 1000000000 then
    raise exception 'reputation outside allowed range';
  end if;

  v_expected_return := ((p_net_worth - p_initial_cash)::numeric / p_initial_cash::numeric) * 100;
  if abs(v_expected_return - p_return_rate) > 0.06 then
    raise exception 'return rate mismatch';
  end if;

  select * into v_previous from public.leaderboard where user_id = v_uid;
  if found and now() - v_previous.updated_at < interval '30 seconds' then
    if p_net_worth > v_previous.net_worth + 50000000 + abs(v_previous.net_worth) * 2 then
      raise exception 'implausible rapid net worth increase';
    end if;
  end if;

  insert into public.leaderboard (
    user_id, display_name, net_worth, return_rate, initial_cash,
    market_session, top_tier, luxury_count, showcase, reputation,
    integrity_status, updated_at
  ) values (
    v_uid, left(p_display_name, 40), p_net_worth, p_return_rate, p_initial_cash,
    p_market_session, p_top_tier, p_luxury_count, coalesce(p_showcase, '{}'),
    p_reputation, 'basic', now()
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
    updated_at = now();
end;
$$;

revoke insert, update on public.leaderboard from authenticated;
grant execute on function public.submit_leaderboard(
  text, bigint, numeric, bigint, bigint, int, int, text[], bigint
) to authenticated;
