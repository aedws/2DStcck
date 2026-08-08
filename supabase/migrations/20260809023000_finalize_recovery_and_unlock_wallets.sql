-- The 18:00 recovery wallets are fully reconciled. End the temporary full
-- wallet freeze so normal saves and server-ledger user ETF trades can resume.

begin;

create schema if not exists admin_rollback;
revoke all on schema admin_rollback from public, anon, authenticated;

create table if not exists admin_rollback.r20260809_recovery_unlock_locks as
select l.*
from public.game_save_recovery_locks l
join admin_rollback.r20260808_1800_wallet_targets t using (user_id)
where l.unlocked_at is null;

alter table admin_rollback.r20260809_recovery_unlock_locks
  enable row level security;

do $$
declare
  v_target_count integer;
  v_active_locks integer;
  v_missing_saves integer;
  v_total_mismatch integer;
  v_save_ledger_nonzero integer;
  v_account_ledger_nonzero integer;
  v_position_nonzero integer;
begin
  select count(*) into v_target_count
  from admin_rollback.r20260808_1800_wallet_targets;

  select count(*) into v_active_locks
  from public.game_save_recovery_locks l
  join admin_rollback.r20260808_1800_wallet_targets t using (user_id)
  where l.unlocked_at is null;

  if v_target_count <> 27 or v_active_locks not in (0, 27) then
    raise exception 'recovery lock target set is incomplete: targets %, active %',
      v_target_count, v_active_locks;
  end if;

  with target_state as (
    select
      t.user_id,
      t.target_cents::numeric as target_cents,
      gs.state,
      coalesce((
        select sum(
          (item ->> 'shares')::numeric * (item ->> 'faceValue')::numeric
        )
        from jsonb_array_elements(case
          when jsonb_typeof(gs.state -> 'preferredShares') = 'array'
            then gs.state -> 'preferredShares'
          else '[]'::jsonb
        end) item
      ), 0) as preferred_value
    from admin_rollback.r20260808_1800_wallet_targets t
    left join public.game_saves gs using (user_id)
  )
  select
    count(*) filter (where state is null),
    count(*) filter (
      where state is not null
        and coalesce(state ->> 'cashExact', state ->> 'cash', '0')::numeric
          + preferred_value <> target_cents
    ),
    count(*) filter (
      where state is not null
        and coalesce(
          state ->> 'amcLedgerBalanceExact',
          state ->> 'amcLedgerBalance',
          '0'
        )::numeric <> 0
    )
  into v_missing_saves, v_total_mismatch, v_save_ledger_nonzero
  from target_state;

  select count(*) into v_account_ledger_nonzero
  from public.amc_accounts account
  join admin_rollback.r20260808_1800_wallet_targets t using (user_id)
  where account.balance_delta <> 0;

  select count(*) into v_position_nonzero
  from public.amc_fund_positions position
  join admin_rollback.r20260808_1800_wallet_targets t using (user_id)
  where position.quantity <> 0;

  if v_missing_saves <> 0
     or v_total_mismatch <> 0
     or v_save_ledger_nonzero <> 0
     or v_account_ledger_nonzero <> 0
     or v_position_nonzero <> 0 then
    raise exception
      'recovery ledger is not final: missing %, total %, save ledger %, account ledger %, positions %',
      v_missing_saves,
      v_total_mismatch,
      v_save_ledger_nonzero,
      v_account_ledger_nonzero,
      v_position_nonzero;
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'game_saves_10_preferred_share_preservation'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'game_saves_90_financial_wallet_checkpoint'
      and not tgisinternal
  ) then
    raise exception 'post-recovery wallet guards are not installed';
  end if;
end;
$$;

update public.game_save_recovery_locks lock
set unlocked_at = coalesce(lock.unlocked_at, clock_timestamp()),
    reason = 'safe_financial_rollback_20260808_1800_verified'
from admin_rollback.r20260808_1800_wallet_targets target
where lock.user_id = target.user_id
  and lock.unlocked_at is null;

do $$
begin
  if exists (
    select 1
    from public.game_save_recovery_locks lock
    join admin_rollback.r20260808_1800_wallet_targets target using (user_id)
    where lock.unlocked_at is null
  ) then
    raise exception 'one or more recovery locks remain active';
  end if;
end;
$$;

commit;
