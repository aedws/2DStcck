-- Prevent an older tab/device from replacing a newer wallet snapshot.
-- User ETF cash corrections also keep the exact decimal-string fields authoritative.

alter table public.game_saves
  add column if not exists wallet_revision bigint not null default 0;

update public.game_saves
set wallet_revision = 1
where wallet_revision = 0;

create table if not exists public.game_save_conflicts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expected_revision bigint not null,
  actual_revision bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists game_save_conflicts_user_created_idx
  on public.game_save_conflicts (user_id, created_at desc);

alter table public.game_save_conflicts enable row level security;
revoke all on public.game_save_conflicts from public, anon, authenticated;

create or replace function public.save_game_save_cas(
  p_state jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current_revision bigint;
  v_saved_revision bigint;
  v_updated_at timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid_state';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid_expected_revision';
  end if;

  select wallet_revision
  into v_current_revision
  from public.game_saves
  where user_id = v_uid
  for update;

  if not found then
    if p_expected_revision <> 0 then
      insert into public.game_save_conflicts (
        user_id, expected_revision, actual_revision
      ) values (v_uid, p_expected_revision, 0);
      return jsonb_build_object(
        'saved', false,
        'conflict', true,
        'revision', 0
      );
    end if;

    insert into public.game_saves (
      user_id, state, wallet_revision, updated_at
    ) values (
      v_uid, p_state, 1, now()
    )
    returning wallet_revision, updated_at
    into v_saved_revision, v_updated_at;

    return jsonb_build_object(
      'saved', true,
      'conflict', false,
      'revision', v_saved_revision,
      'updatedAt', v_updated_at
    );
  end if;

  if v_current_revision <> p_expected_revision then
    insert into public.game_save_conflicts (
      user_id, expected_revision, actual_revision
    ) values (v_uid, p_expected_revision, v_current_revision);
    return jsonb_build_object(
      'saved', false,
      'conflict', true,
      'revision', v_current_revision
    );
  end if;

  update public.game_saves
  set state = p_state,
      wallet_revision = wallet_revision + 1,
      updated_at = now()
  where user_id = v_uid
    and wallet_revision = p_expected_revision
  returning wallet_revision, updated_at
  into v_saved_revision, v_updated_at;

  if not found then
    select wallet_revision into v_current_revision
    from public.game_saves
    where user_id = v_uid;
    insert into public.game_save_conflicts (
      user_id, expected_revision, actual_revision
    ) values (v_uid, p_expected_revision, coalesce(v_current_revision, 0));
    return jsonb_build_object(
      'saved', false,
      'conflict', true,
      'revision', coalesce(v_current_revision, 0)
    );
  end if;

  return jsonb_build_object(
    'saved', true,
    'conflict', false,
    'revision', v_saved_revision,
    'updatedAt', v_updated_at
  );
end;
$$;

revoke all on function public.save_game_save_cas(jsonb, bigint)
  from public, anon;
grant execute on function public.save_game_save_cas(jsonb, bigint)
  to authenticated;

-- Old clients must not bypass the compare-and-swap RPC with a direct upsert.
drop policy if exists "game_saves_insert_own" on public.game_saves;
drop policy if exists "game_saves_update_own" on public.game_saves;
revoke insert, update on public.game_saves from anon, authenticated;
grant select on public.game_saves to authenticated;

create or replace function public.apply_account_cash_adjustments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adjustment public.account_cash_adjustments%rowtype;
  v_claimed jsonb;
  v_payments jsonb;
  v_cash_before numeric;
  v_cash_after numeric;
begin
  if new.state is null then return new; end if;

  v_claimed := coalesce(new.state -> 'claimedCompensationIds', '[]'::jsonb);
  v_payments := coalesce(new.state -> 'cashPayments', '[]'::jsonb);

  for v_adjustment in
    select *
    from public.account_cash_adjustments
    where user_id = new.user_id
    order by created_at, id
  loop
    if not (v_claimed ? v_adjustment.id) then
      v_cash_before := case
        when coalesce(new.state ->> 'cashExact', '') ~ '^-?[0-9]+$'
          then (new.state ->> 'cashExact')::numeric
        when coalesce(new.state ->> 'cash', '') ~ '^-?[0-9]+([.][0-9]+)?$'
          then (new.state ->> 'cash')::numeric
        else 0
      end;
      v_cash_after := round(v_cash_before + v_adjustment.amount_cents);

      new.state := jsonb_set(new.state, '{cash}', to_jsonb(v_cash_after), true);
      new.state := jsonb_set(
        new.state,
        '{cashExact}',
        to_jsonb(v_cash_after::text),
        true
      );
      v_claimed := v_claimed || jsonb_build_array(v_adjustment.id);
      v_payments := jsonb_build_array(jsonb_build_object(
        'id', v_adjustment.id,
        'kind', 'compensation',
        'sourceId', 'account-cash-adjustment',
        'dueSession', floor(extract(epoch from now()) / 3600)::bigint,
        'amount', v_adjustment.amount_cents,
        'amountExact', round(v_adjustment.amount_cents)::text,
        'timestamp', floor(extract(epoch from now()) * 1000)::bigint
      )) || v_payments;

      update public.account_cash_adjustments
      set cash_before_cents = coalesce(cash_before_cents, v_cash_before),
          cash_after_cents = coalesce(cash_after_cents, v_cash_after),
          first_applied_at = coalesce(first_applied_at, now())
      where id = v_adjustment.id;
    end if;
  end loop;

  new.state := jsonb_set(new.state, '{claimedCompensationIds}', v_claimed, true);
  new.state := jsonb_set(new.state, '{cashPayments}', v_payments, true);
  return new;
end;
$$;

revoke all on function public.apply_account_cash_adjustments()
  from public, anon, authenticated;

create or replace function public.reconcile_amc_ledger_into_game_save()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_revision bigint;
  v_cash numeric;
  v_applied numeric;
  v_next_cash numeric;
begin
  select balance_delta, revision
  into v_balance, v_revision
  from public.amc_accounts
  where user_id = new.user_id;

  if not found then return new; end if;

  v_cash := case
    when coalesce(new.state ->> 'cashExact', '') ~ '^-?[0-9]+$'
      then (new.state ->> 'cashExact')::numeric
    when coalesce(new.state ->> 'cash', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      then (new.state ->> 'cash')::numeric
    else 0
  end;
  v_applied := case
    when coalesce(new.state ->> 'amcLedgerBalanceExact', '') ~ '^-?[0-9]+$'
      then (new.state ->> 'amcLedgerBalanceExact')::numeric
    when coalesce(new.state ->> 'amcLedgerBalance', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      then (new.state ->> 'amcLedgerBalance')::numeric
    else 0
  end;
  v_next_cash := round(v_cash + v_balance - v_applied);

  new.state := jsonb_set(new.state, '{cash}', to_jsonb(v_next_cash), true);
  new.state := jsonb_set(
    new.state,
    '{cashExact}',
    to_jsonb(v_next_cash::text),
    true
  );
  new.state := jsonb_set(
    new.state,
    '{amcLedgerBalance}',
    to_jsonb(v_balance),
    true
  );
  new.state := jsonb_set(
    new.state,
    '{amcLedgerBalanceExact}',
    to_jsonb(round(v_balance)::text),
    true
  );
  new.state := jsonb_set(
    new.state,
    '{amcLedgerRevision}',
    to_jsonb(v_revision),
    true
  );
  return new;
end;
$$;

revoke all on function public.reconcile_amc_ledger_into_game_save()
  from public, anon, authenticated;

-- A sub-dollar integer-cent NAV can absorb every small bond move in rounding.
-- Consolidate it to at least $10 while preserving AUM and every holder's value.
create or replace function public.amc_consolidate_micro_nav_internal(
  p_fund_id text,
  p_current_session bigint,
  p_price_factor double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fund public.amc_listed_funds;
  v_now_session bigint := floor(extract(epoch from now()) / 3600)::bigint;
  v_nav bigint;
  v_ratio numeric := 1;
begin
  if abs(p_current_session - v_now_session) > 1 then
    raise exception 'invalid_session';
  end if;
  if p_price_factor is null
     or p_price_factor <= 0
     or p_price_factor <> p_price_factor
     or p_price_factor in (
       'Infinity'::double precision,
       '-Infinity'::double precision
     ) then
    raise exception 'invalid_price_factor';
  end if;

  select * into v_fund
  from public.amc_listed_funds
  where id = p_fund_id
  for update;
  if not found then raise exception 'fund_not_found'; end if;
  if v_fund.status = 'delisted' or v_fund.total_shares <= 0 then
    return jsonb_build_object(
      'fund', to_jsonb(v_fund),
      'adjusted', false,
      'kind', 'none',
      'multiplier', 1
    );
  end if;

  v_nav := greatest(1, round(
    v_fund.seed_nav_value::numeric * p_price_factor::numeric
    / greatest(v_fund.basket_price_factor::numeric, 0.000000001)
    / v_fund.total_shares::numeric
  )::bigint);

  if v_nav >= 100 then
    return jsonb_build_object(
      'fund', to_jsonb(v_fund),
      'adjusted', false,
      'kind', 'none',
      'multiplier', 1
    );
  end if;

  while v_nav::numeric * v_ratio < 1000 loop
    v_ratio := v_ratio * 10;
    if v_ratio > 1000000000000 then
      raise exception 'micro_nav_consolidation_ratio_too_large';
    end if;
  end loop;

  update public.amc_fund_positions
  set quantity = quantity / v_ratio::double precision,
      updated_at = now()
  where fund_id = v_fund.id;

  update public.amc_listed_funds
  set total_shares = total_shares / v_ratio::double precision,
      share_multiplier = share_multiplier / v_ratio::double precision,
      last_share_adjustment_session = p_current_session,
      last_price_factor = p_price_factor,
      last_nav_per_share = greatest(
        1,
        round(v_nav::numeric * v_ratio)::bigint
      ),
      updated_at = now()
  where id = v_fund.id
  returning * into v_fund;

  return jsonb_build_object(
    'fund', to_jsonb(v_fund),
    'adjusted', true,
    'kind', 'reverse_split',
    'multiplier', (1 / v_ratio),
    'ratio', v_ratio
  );
end;
$$;

revoke all on function public.amc_consolidate_micro_nav_internal(
  text, bigint, double precision
) from public, anon, authenticated;

create or replace function public.amc_apply_auto_share_adjustment_internal(
  p_fund_id text,
  p_current_session bigint,
  p_price_factor double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fund public.amc_listed_funds;
  v_nav bigint;
begin
  select * into v_fund
  from public.amc_listed_funds
  where id = p_fund_id;
  if not found then raise exception 'fund_not_found'; end if;

  if v_fund.status = 'delisted'
     or (
       v_fund.last_share_adjustment_session is not null
       and p_current_session - v_fund.last_share_adjustment_session < 5
     ) then
    return jsonb_build_object(
      'fund', to_jsonb(v_fund),
      'adjusted', false,
      'kind', 'cooldown',
      'multiplier', 1
    );
  end if;

  v_nav := greatest(1, round(
    v_fund.seed_nav_value::numeric * p_price_factor::numeric
    / greatest(v_fund.basket_price_factor::numeric, 0.000000001)
    / greatest(v_fund.total_shares::numeric, 0.000000001)
  )::bigint);

  if v_nav < 100 then
    return public.amc_consolidate_micro_nav_internal(
      p_fund_id,
      p_current_session,
      p_price_factor
    );
  end if;

  return public.amc_apply_auto_share_adjustment_internal_without_cooldown(
    p_fund_id,
    p_current_session,
    p_price_factor
  );
end;
$$;

revoke all on function public.amc_apply_auto_share_adjustment_internal(
  text, bigint, double precision
) from public, anon, authenticated;

create or replace function public.amc_normalize_micro_nav_on_listing()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_nav bigint;
  v_ratio numeric := 1;
begin
  if new.status <> 'delisted'
     and new.seed_nav_value > 0
     and new.total_shares > 0 then
    v_nav := greatest(1, round(
      new.seed_nav_value::numeric
      * greatest(new.last_price_factor::numeric, 0.000000001)
      / greatest(new.basket_price_factor::numeric, 0.000000001)
      / new.total_shares::numeric
    )::bigint);

    if v_nav < 100 then
      while v_nav::numeric * v_ratio < 10000 loop
        v_ratio := v_ratio * 10;
      end loop;
      new.total_shares := new.total_shares / v_ratio::double precision;
      new.share_multiplier := new.share_multiplier / v_ratio::double precision;
      new.last_nav_per_share := greatest(
        1,
        round(v_nav::numeric * v_ratio)::bigint
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists amc_normalize_micro_nav_on_listing
  on public.amc_listed_funds;
create trigger amc_normalize_micro_nav_on_listing
before insert on public.amc_listed_funds
for each row execute function public.amc_normalize_micro_nav_on_listing();

create or replace function public.amc_settle_due_funds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_session bigint := floor(extract(epoch from now()) / 3600)::bigint;
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select id, last_price_factor, last_passive_period_rate
    from public.amc_listed_funds
    where status <> 'delisted'
      and settlement_input_at is not null
      and (
        v_current_session - last_fee_session >= 20
        or v_current_session - last_dividend_session >= dividend_interval_days
        or (style = 'active' and v_current_session - last_rebalance_session >= 30)
        or (
          (
            last_share_adjustment_session is null
            or v_current_session - last_share_adjustment_session >= 5
          )
          and (
            last_nav_per_share < 100
            or (
              split_trigger_price is not null
              and last_nav_per_share >= split_trigger_price
            )
            or (
              reverse_split_trigger_price is not null
              and last_nav_per_share <= reverse_split_trigger_price
            )
          )
        )
      )
    order by updated_at asc
    limit 200
  loop
    begin
      perform public.amc_apply_auto_share_adjustment_internal(
        v_row.id,
        v_current_session,
        greatest(v_row.last_price_factor, 0.000000001)
      );
      perform public.amc_settle_fund_internal(
        v_row.id,
        v_current_session,
        greatest(v_row.last_price_factor, 0.000000001),
        greatest(0, least(0.05, v_row.last_passive_period_rate))
      );
      v_count := v_count + 1;
    exception when others then
      raise warning 'amc_settle_due_funds fund % failed: %', v_row.id, sqlerrm;
    end;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.amc_settle_due_funds()
  from public, anon, authenticated;

-- Repair every already-listed micro-NAV fund now; SELP is included.
do $$
declare
  v_current_session bigint := floor(extract(epoch from now()) / 3600)::bigint;
  v_row record;
begin
  for v_row in
    select id, greatest(last_price_factor, 0.000000001) as price_factor
    from public.amc_listed_funds
    where status <> 'delisted'
      and total_shares > 0
      and last_nav_per_share < 100
    for update
  loop
    perform public.amc_consolidate_micro_nav_internal(
      v_row.id,
      v_current_session,
      v_row.price_factor
    );
  end loop;
end;
$$;

update public.bug_reports
set status = 'fixed',
    admin_note = '계좌가 청산 이후 과거 1.28Qa 상태로 되돌아간 원인은 여러 탭·기기가 game_saves를 선후관계 검증 없이 직접 덮어쓸 수 있었기 때문입니다. 서버 지갑 revision을 추가하고 최신 revision과 일치할 때만 저장하는 CAS 방식으로 전환했으며, 충돌 시 서버 최신본을 다시 불러오도록 수정했습니다. 기존 클라이언트의 직접 upsert 권한도 회수해 같은 경로의 재발을 차단했습니다. 또한 cashExact를 누락하던 현금 보정·유저 ETF 원장 트리거를 함께 정정했습니다.',
    updated_at = now()
where lower(game_id) = 'sedim'
  and title ilike '%청산당했는데 다시 계좌%'
  and status in ('open', 'investigating');
