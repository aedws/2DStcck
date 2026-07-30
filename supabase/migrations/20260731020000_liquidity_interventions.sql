-- 연기금·월가·개인 투자자가 공동으로 유동성 위기를 진화하는 서버 공통 원장.
-- 모금 총액과 목표액은 해당 위기에 실제로 자본을 투입한 사용자에게만 공개한다.

create table if not exists public.liquidity_interventions (
  crisis_key text primary key,
  kind text not null check (
    kind in (
      'credit-crunch',
      'bank-liquidity',
      'liquidity-drought',
      'sudden-bank-run'
    )
  ),
  start_session bigint not null,
  end_session bigint not null check (end_session > start_session),
  target_cents numeric not null check (target_cents > 0),
  institutional_cents numeric not null check (institutional_cents >= 0),
  player_cents numeric not null default 0 check (player_cents >= 0),
  resolved_at timestamptz,
  effective_tick bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.liquidity_contributions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  crisis_key text not null references public.liquidity_interventions(crisis_key),
  user_id uuid not null,
  amount_cents numeric not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);

create index if not exists liquidity_contributions_crisis_idx
  on public.liquidity_contributions (crisis_key, amount_cents desc, created_at);
create index if not exists liquidity_contributions_user_idx
  on public.liquidity_contributions (user_id, created_at desc);

alter table public.liquidity_interventions enable row level security;
alter table public.liquidity_contributions enable row level security;
revoke all on public.liquidity_interventions from public, anon, authenticated;
revoke all on public.liquidity_contributions from public, anon, authenticated;

create or replace function public.liquidity_crisis_target_cents(p_kind text)
returns numeric
language sql
immutable
security definer
set search_path = public
as $$
  select case p_kind
    when 'credit-crunch' then 100000000000000000::numeric
    when 'bank-liquidity' then 200000000000000000::numeric
    when 'liquidity-drought' then 300000000000000000::numeric
    when 'sudden-bank-run' then 500000000000000000::numeric
    else null
  end
$$;

revoke all on function public.liquidity_crisis_target_cents(text) from public;

create or replace function public.ensure_liquidity_intervention(
  p_crisis_key text,
  p_kind text,
  p_start_session bigint,
  p_end_session bigint
)
returns public.liquidity_interventions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target numeric := public.liquidity_crisis_target_cents(p_kind);
  v_row public.liquidity_interventions;
begin
  if coalesce(p_crisis_key, '') !~ '^[a-z0-9-]{4,80}$' then
    raise exception 'invalid_crisis_key';
  end if;
  if v_target is null then raise exception 'invalid_crisis_kind'; end if;
  if p_start_session is null
     or p_end_session is null
     or p_end_session <= p_start_session
  then
    raise exception 'invalid_crisis_window';
  end if;

  insert into public.liquidity_interventions (
    crisis_key,
    kind,
    start_session,
    end_session,
    target_cents,
    institutional_cents
  )
  values (
    p_crisis_key,
    p_kind,
    p_start_session,
    p_end_session,
    v_target,
    floor(v_target * 0.30)
  )
  on conflict (crisis_key) do nothing;

  select *
    into v_row
  from public.liquidity_interventions
  where crisis_key = p_crisis_key;

  if v_row.kind <> p_kind
     or v_row.start_session <> p_start_session
     or v_row.end_session <> p_end_session
     or v_row.target_cents <> v_target
  then
    raise exception 'crisis_definition_mismatch';
  end if;
  return v_row;
end;
$$;

revoke all on function public.ensure_liquidity_intervention(text, text, bigint, bigint)
  from public;

create or replace function public.get_liquidity_intervention_status(
  p_crisis_key text,
  p_kind text,
  p_start_session bigint,
  p_end_session bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.liquidity_interventions;
  v_contributed boolean := false;
  v_my_cents numeric := 0;
begin
  v_row := public.ensure_liquidity_intervention(
    p_crisis_key,
    p_kind,
    p_start_session,
    p_end_session
  );

  if v_user is not null then
    select coalesce(sum(amount_cents), 0)
      into v_my_cents
    from public.liquidity_contributions
    where crisis_key = p_crisis_key
      and user_id = v_user;
    v_contributed := v_my_cents > 0;
  end if;

  return jsonb_build_object(
    'crisis_key', v_row.crisis_key,
    'kind', v_row.kind,
    'start_session', v_row.start_session,
    'end_session', v_row.end_session,
    'resolved', v_row.resolved_at is not null,
    'effective_tick', v_row.effective_tick,
    'contributed', v_contributed,
    'target_cents', case when v_contributed then v_row.target_cents end,
    'institutional_cents',
      case when v_contributed then v_row.institutional_cents end,
    'player_cents', case when v_contributed then v_row.player_cents end,
    'total_cents',
      case
        when v_contributed
        then v_row.institutional_cents + v_row.player_cents
      end,
    'my_cents', case when v_contributed then v_my_cents end
  );
end;
$$;

revoke all on function public.get_liquidity_intervention_status(
  text, text, bigint, bigint
) from public;
grant execute on function public.get_liquidity_intervention_status(
  text, text, bigint, bigint
) to anon, authenticated;

create or replace function public.list_public_liquidity_interventions()
returns table (
  crisis_key text,
  kind text,
  start_session bigint,
  end_session bigint,
  resolved boolean,
  effective_tick bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    intervention.crisis_key,
    intervention.kind,
    intervention.start_session,
    intervention.end_session,
    intervention.resolved_at is not null,
    intervention.effective_tick
  from public.liquidity_interventions intervention
  order by intervention.start_session, intervention.crisis_key
$$;

revoke all on function public.list_public_liquidity_interventions() from public;
grant execute on function public.list_public_liquidity_interventions()
  to anon, authenticated;

create or replace function public.contribute_liquidity_intervention(
  p_request_id uuid,
  p_crisis_key text,
  p_kind text,
  p_start_session bigint,
  p_end_session bigint,
  p_amount_cents numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.liquidity_interventions;
  v_existing public.liquidity_contributions;
  v_save jsonb;
  v_cash numeric;
  v_amount_dollars numeric;
  v_now_session bigint;
  v_now_tick bigint;
  v_effective_tick bigint;
  v_was_resolved boolean;
  v_my_cents numeric;
  v_achievements jsonb;
  v_top_user uuid;
  v_payment jsonb;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_request_id is null then raise exception 'invalid_request_id'; end if;
  if coalesce(p_amount_cents, 0) < 100000000000::numeric then
    raise exception 'minimum_contribution';
  end if;
  if trunc(p_amount_cents) <> p_amount_cents
     or mod(p_amount_cents, 100) <> 0
  then
    raise exception 'invalid_contribution_amount';
  end if;

  select *
    into v_existing
  from public.liquidity_contributions
  where request_id = p_request_id
    and user_id = v_user;

  v_row := public.ensure_liquidity_intervention(
    p_crisis_key,
    p_kind,
    p_start_session,
    p_end_session
  );

  if v_existing.id is not null then
    select coalesce(sum(amount_cents), 0)
      into v_my_cents
    from public.liquidity_contributions
    where crisis_key = p_crisis_key and user_id = v_user;
    select state -> 'achievements'
      into v_achievements
    from public.game_saves
    where user_id = v_user;
    return jsonb_build_object(
      'crisis_key', v_row.crisis_key,
      'kind', v_row.kind,
      'start_session', v_row.start_session,
      'end_session', v_row.end_session,
      'resolved', v_row.resolved_at is not null,
      'effective_tick', v_row.effective_tick,
      'contributed', true,
      'target_cents', v_row.target_cents,
      'institutional_cents', v_row.institutional_cents,
      'player_cents', v_row.player_cents,
      'total_cents', v_row.institutional_cents + v_row.player_cents,
      'my_cents', v_my_cents,
      'cash_exact', (
        select coalesce(state ->> 'cashExact', state ->> 'cash')
        from public.game_saves where user_id = v_user
      ),
      'achievement_ids', coalesce(v_achievements, '[]'::jsonb)
    );
  end if;

  v_now_session := floor(
    extract(epoch from clock_timestamp()) * 1000 / 3600000
  )::bigint;
  if v_now_session < p_start_session or v_now_session >= p_end_session then
    raise exception 'crisis_not_active';
  end if;

  -- 모든 기여 요청이 공통 위기 행을 먼저 잠그게 해, 해결 시 참여자 지갑을
  -- 일괄 갱신하는 경로와 동시 기여 경로 사이의 교착을 막는다.
  select *
    into v_row
  from public.liquidity_interventions
  where crisis_key = p_crisis_key
  for update;
  v_was_resolved := v_row.resolved_at is not null;
  if v_was_resolved then raise exception 'already_resolved'; end if;

  select state
    into v_save
  from public.game_saves
  where user_id = v_user
  for update;
  if not found then raise exception 'save_not_found'; end if;

  v_cash := case
    when coalesce(v_save ->> 'cashExact', v_save ->> 'cash', '') ~ '^-?[0-9]+$'
      then coalesce(v_save ->> 'cashExact', v_save ->> 'cash')::numeric
    else 0
  end;
  v_amount_dollars := p_amount_cents / 100;
  if v_cash < v_amount_dollars then raise exception 'insufficient_cash'; end if;

  insert into public.liquidity_contributions (
    request_id, crisis_key, user_id, amount_cents
  )
  values (p_request_id, p_crisis_key, v_user, p_amount_cents);

  v_payment := jsonb_build_object(
    'id', 'liquidity-' || p_request_id::text,
    'kind', 'liquidity_contribution',
    'sourceId', p_crisis_key,
    'dueSession', v_now_session,
    'amount', -v_amount_dollars,
    'amountExact', (-v_amount_dollars)::text,
    'timestamp', floor(extract(epoch from clock_timestamp()) * 1000)
  );
  v_save := jsonb_set(v_save, '{cash}', to_jsonb(v_cash - v_amount_dollars), true);
  v_save := jsonb_set(
    v_save,
    '{cashExact}',
    to_jsonb((v_cash - v_amount_dollars)::text),
    true
  );
  v_save := jsonb_set(
    v_save,
    '{cashPayments}',
    jsonb_build_array(v_payment) ||
      coalesce(v_save -> 'cashPayments', '[]'::jsonb),
    true
  );
  update public.game_saves
  set state = v_save,
      wallet_revision = wallet_revision + 1,
      updated_at = now()
  where user_id = v_user;

  update public.liquidity_interventions
  set player_cents = player_cents + p_amount_cents,
      updated_at = now()
  where crisis_key = p_crisis_key
  returning * into v_row;

  if v_row.institutional_cents + v_row.player_cents >= v_row.target_cents then
    v_now_tick := greatest(
      0,
      floor(extract(epoch from (
        clock_timestamp() - timestamptz '2026-07-11 00:00:00+00'
      )))::bigint
    );
    v_effective_tick := v_now_tick + 15;
    update public.liquidity_interventions
    set resolved_at = now(),
        effective_tick = v_effective_tick,
        updated_at = now()
    where crisis_key = p_crisis_key
      and resolved_at is null
    returning * into v_row;

    select contribution.user_id
      into v_top_user
    from public.liquidity_contributions contribution
    where contribution.crisis_key = p_crisis_key
    group by contribution.user_id
    order by sum(contribution.amount_cents) desc, contribution.user_id
    limit 1;

    update public.game_saves saves
    set state = jsonb_set(
          saves.state,
          '{achievements}',
          (
            select jsonb_agg(value order by first_seen)
            from (
              select value, min(ordinality) as first_seen
              from jsonb_array_elements_text(
                coalesce(saves.state -> 'achievements', '[]'::jsonb) ||
                jsonb_build_array('market_firefighter') ||
                case
                  when saves.user_id = v_top_user
                  then jsonb_build_array('great_capitalist')
                  else '[]'::jsonb
                end
              ) with ordinality as unlocked(value, ordinality)
              group by value
            ) unique_titles
          ),
          true
        ),
        wallet_revision = saves.wallet_revision + 1,
        updated_at = now()
    where exists (
      select 1
      from public.liquidity_contributions contribution
      where contribution.crisis_key = p_crisis_key
        and contribution.user_id = saves.user_id
    );
  end if;

  select coalesce(sum(amount_cents), 0)
    into v_my_cents
  from public.liquidity_contributions
  where crisis_key = p_crisis_key and user_id = v_user;
  select state -> 'achievements'
    into v_achievements
  from public.game_saves
  where user_id = v_user;

  return jsonb_build_object(
    'crisis_key', v_row.crisis_key,
    'kind', v_row.kind,
    'start_session', v_row.start_session,
    'end_session', v_row.end_session,
    'resolved', v_row.resolved_at is not null,
    'effective_tick', v_row.effective_tick,
    'contributed', true,
    'target_cents', v_row.target_cents,
    'institutional_cents', v_row.institutional_cents,
    'player_cents', v_row.player_cents,
    'total_cents', v_row.institutional_cents + v_row.player_cents,
    'my_cents', v_my_cents,
    'cash_exact', (
      select coalesce(state ->> 'cashExact', state ->> 'cash')
      from public.game_saves where user_id = v_user
    ),
    'achievement_ids', coalesce(v_achievements, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.contribute_liquidity_intervention(
  uuid, text, text, bigint, bigint, numeric
) from public;
grant execute on function public.contribute_liquidity_intervention(
  uuid, text, text, bigint, bigint, numeric
) to authenticated;
