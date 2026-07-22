-- Keep game_saves.cash aligned with the server-authoritative user ETF ledger.
-- This runs for every wallet write, so a stale tab cannot restore pre-trade cash.

create or replace function public.reconcile_amc_ledger_into_game_save()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_revision bigint;
  v_cash numeric;
  v_applied numeric;
begin
  select balance_delta, revision
  into v_balance, v_revision
  from public.amc_accounts
  where user_id = new.user_id;

  if not found then
    return new;
  end if;

  v_cash := case
    when coalesce(new.state ->> 'cash', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      then (new.state ->> 'cash')::numeric
    else 0
  end;
  v_applied := case
    when coalesce(new.state ->> 'amcLedgerBalance', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      then (new.state ->> 'amcLedgerBalance')::numeric
    else 0
  end;

  new.state := jsonb_set(
    new.state,
    '{cash}',
    to_jsonb(v_cash + v_balance - v_applied),
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
    '{amcLedgerRevision}',
    to_jsonb(v_revision),
    true
  );
  return new;
end;
$$;

revoke all on function public.reconcile_amc_ledger_into_game_save()
  from public, anon, authenticated;

drop trigger if exists game_saves_amc_ledger_reconcile on public.game_saves;
create trigger game_saves_amc_ledger_reconcile
  before insert or update of state on public.game_saves
  for each row execute function public.reconcile_amc_ledger_into_game_save();

