-- Compact transaction-level wallet checkpoints for future safe recovery.
-- Only financial fields are stored, and each account retains its newest 200
-- checkpoints to keep storage bounded on the Free plan.

begin;

create table if not exists public.financial_wallet_checkpoints (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  operation text not null check (operation in ('baseline', 'insert', 'change')),
  actor_user_id uuid,
  previous_wallet_revision bigint,
  wallet_revision bigint not null,
  before_state jsonb,
  after_state jsonb not null,
  before_fingerprint text,
  after_fingerprint text not null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists financial_wallet_checkpoints_user_created_idx
  on public.financial_wallet_checkpoints (user_id, created_at desc, id desc);

alter table public.financial_wallet_checkpoints enable row level security;
revoke all on public.financial_wallet_checkpoints from public, anon, authenticated;

create or replace function public.financial_wallet_state(p_state jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'cash', p_state -> 'cash',
    'cashExact', p_state -> 'cashExact',
    'initialCash', p_state -> 'initialCash',
    'initialCashExact', p_state -> 'initialCashExact',
    'holdings', coalesce(p_state -> 'holdings', '[]'::jsonb),
    'shorts', coalesce(p_state -> 'shorts', '[]'::jsonb),
    'options', coalesce(p_state -> 'options', '[]'::jsonb),
    'openOrders', coalesce(p_state -> 'openOrders', '[]'::jsonb),
    'ownedLuxuries', coalesce(p_state -> 'ownedLuxuries', '[]'::jsonb),
    'pensionAnnuities', coalesce(p_state -> 'pensionAnnuities', '[]'::jsonb),
    'preferredShares', coalesce(p_state -> 'preferredShares', '[]'::jsonb),
    'recurringInvestments', coalesce(p_state -> 'recurringInvestments', '[]'::jsonb),
    'playerCompany', coalesce(p_state -> 'playerCompany', 'null'::jsonb),
    'assetManager', coalesce(p_state -> 'assetManager', 'null'::jsonb),
    'marginEnabled', p_state -> 'marginEnabled',
    'marginLeverage', p_state -> 'marginLeverage',
    'marginCallAt', p_state -> 'marginCallAt',
    'amcLedgerBalance', p_state -> 'amcLedgerBalance',
    'amcLedgerBalanceExact', p_state -> 'amcLedgerBalanceExact',
    'amcLedgerRevision', p_state -> 'amcLedgerRevision',
    'investmentSeason', p_state -> 'investmentSeason',
    'accountResetAt', p_state -> 'accountResetAt',
    'lastSalarySession', p_state -> 'lastSalarySession',
    'lastMonthlyDistributionSession', p_state -> 'lastMonthlyDistributionSession',
    'lastSingleCoveredCallDistributionSession',
      p_state -> 'lastSingleCoveredCallDistributionSession',
    'lastQuarterlyDividendSession', p_state -> 'lastQuarterlyDividendSession',
    'lastInterestSession', p_state -> 'lastInterestSession',
    'tradeCount', jsonb_array_length(coalesce(p_state -> 'trades', '[]'::jsonb)),
    'latestTrade', coalesce(p_state -> 'trades' -> 0, 'null'::jsonb)
  );
$$;

revoke all on function public.financial_wallet_state(jsonb)
  from public, anon, authenticated;

create or replace function public.capture_financial_wallet_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb := public.financial_wallet_state(new.state);
begin
  if tg_op = 'INSERT' then
    insert into public.financial_wallet_checkpoints (
      user_id,
      operation,
      actor_user_id,
      previous_wallet_revision,
      wallet_revision,
      before_state,
      after_state,
      before_fingerprint,
      after_fingerprint
    ) values (
      new.user_id,
      'insert',
      auth.uid(),
      null,
      new.wallet_revision,
      null,
      v_after,
      null,
      md5(v_after::text)
    );
  else
    v_before := public.financial_wallet_state(old.state);
    if v_before is not distinct from v_after then
      return new;
    end if;

    insert into public.financial_wallet_checkpoints (
      user_id,
      operation,
      actor_user_id,
      previous_wallet_revision,
      wallet_revision,
      before_state,
      after_state,
      before_fingerprint,
      after_fingerprint
    ) values (
      new.user_id,
      'change',
      auth.uid(),
      old.wallet_revision,
      new.wallet_revision,
      v_before,
      v_after,
      md5(v_before::text),
      md5(v_after::text)
    );
  end if;

  delete from public.financial_wallet_checkpoints c
  where c.id in (
    select old_checkpoint.id
    from public.financial_wallet_checkpoints old_checkpoint
    where old_checkpoint.user_id = new.user_id
    order by old_checkpoint.created_at desc, old_checkpoint.id desc
    offset 200
  );

  return new;
end;
$$;

revoke all on function public.capture_financial_wallet_checkpoint()
  from public, anon, authenticated;

commit;

-- Install the trigger in its own short transaction so it does not wait for an
-- access-exclusive lock while holding unrelated table locks.
begin;

drop trigger if exists game_saves_90_financial_wallet_checkpoint
  on public.game_saves;
create trigger game_saves_90_financial_wallet_checkpoint
  after insert or update of state on public.game_saves
  for each row execute function public.capture_financial_wallet_checkpoint();

commit;

-- Seed a recovery baseline for every existing wallet.
begin;

insert into public.financial_wallet_checkpoints (
  user_id,
  operation,
  actor_user_id,
  previous_wallet_revision,
  wallet_revision,
  before_state,
  after_state,
  before_fingerprint,
  after_fingerprint
)
select
  gs.user_id,
  'baseline',
  null,
  null,
  gs.wallet_revision,
  null,
  public.financial_wallet_state(gs.state),
  null,
  md5(public.financial_wallet_state(gs.state)::text)
from public.game_saves gs
where not exists (
  select 1
  from public.financial_wallet_checkpoints c
  where c.user_id = gs.user_id
);

commit;
