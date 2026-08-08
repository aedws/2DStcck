-- Stabilize the safe financial rollback to 2026-08-08 18:00 KST.
--
-- The first rollback correctly restored the authoritative target values, but
-- wallets that were already open could reload the new revision and then submit
-- an older local snapshot. Pending server cash ledgers were also reconciled by
-- BEFORE UPDATE triggers during that first pass. This migration:
--   * preserves the post-pass state for audit and reversal;
--   * removes any financial activity recreated after the cutoff;
--   * converts every rollback target to the audited cash-only value again;
--   * records a reset marker and permanently rejects saves that move it back.

begin;

lock table public.game_saves,
  public.leaderboard,
  public.leaderboard_session_snapshots,
  public.account_cash_adjustments,
  public.amc_fund_events,
  public.amc_fund_payments,
  public.amc_fund_positions,
  public.amc_fund_trades,
  public.amc_listed_funds,
  public.amc_accounts,
  public.player_company_dividend_entitlements,
  public.player_company_dividends,
  public.player_company_governance_votes,
  public.player_company_board_decisions,
  public.player_company_market_actions,
  public.player_company_market_state
in share row exclusive mode;

create schema if not exists admin_rollback;
revoke all on schema admin_rollback from public, anon, authenticated;

create table if not exists admin_rollback.r20260808_1800_stabilize_metadata as
select
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint as reset_marker,
  now() as created_at;

create table if not exists admin_rollback.r20260808_1800_stabilize_game_saves as
select gs.*
from public.game_saves gs
join admin_rollback.r20260808_1800_wallet_targets t using (user_id);

create table if not exists admin_rollback.r20260808_1800_stabilize_leaderboard as
select lb.*
from public.leaderboard lb
join admin_rollback.r20260808_1800_wallet_targets t using (user_id);

create table if not exists admin_rollback.r20260808_1800_stabilize_cash_adjustments as
select * from public.account_cash_adjustments
where created_at > timestamptz '2026-08-08 18:00:00+09';

create table if not exists admin_rollback.r20260808_1800_stabilize_amc_events as
select * from public.amc_fund_events
where created_at > timestamptz '2026-08-08 18:00:00+09';

create table if not exists admin_rollback.r20260808_1800_stabilize_amc_payments as
select * from public.amc_fund_payments
where created_at > timestamptz '2026-08-08 18:00:00+09';

create table if not exists admin_rollback.r20260808_1800_stabilize_amc_trades as
select * from public.amc_fund_trades
where created_at > timestamptz '2026-08-08 18:00:00+09';

create table if not exists admin_rollback.r20260808_1800_stabilize_amc_positions as
select p.*
from public.amc_fund_positions p
where exists (
  select 1 from admin_rollback.r20260808_1800_stabilize_amc_trades t
  where t.user_id = p.user_id and t.fund_id = p.fund_id
)
or exists (
  select 1 from admin_rollback.r20260808_1800_wallet_targets t
  where t.user_id = p.user_id
);

create table if not exists admin_rollback.r20260808_1800_stabilize_amc_funds as
select f.*
from public.amc_listed_funds f
where exists (
  select 1 from admin_rollback.r20260808_1800_stabilize_amc_trades t
  where t.fund_id = f.id
)
or exists (
  select 1 from admin_rollback.r20260808_1800_stabilize_amc_events e
  where e.fund_id = f.id
);

create table if not exists admin_rollback.r20260808_1800_stabilize_amc_accounts as
select a.*
from public.amc_accounts a
where exists (
  select 1 from admin_rollback.r20260808_1800_wallet_targets t
  where t.user_id = a.user_id
)
or exists (
  select 1
  from admin_rollback.r20260808_1800_stabilize_amc_trades t
  join public.amc_listed_funds f on f.id = t.fund_id
  where f.manager_user_id = a.user_id
);

create table if not exists admin_rollback.r20260808_1800_stabilize_company_actions as
select * from public.player_company_market_actions
where created_at > timestamptz '2026-08-08 18:00:00+09';

create table if not exists admin_rollback.r20260808_1800_stabilize_company_market_state as
select s.*
from public.player_company_market_state s
where exists (
  select 1 from admin_rollback.r20260808_1800_stabilize_company_actions a
  where a.stock_id = s.stock_id
);

create table if not exists admin_rollback.r20260808_1800_stabilize_company_dividends as
select * from public.player_company_dividends
where created_at > timestamptz '2026-08-08 18:00:00+09';

create table if not exists admin_rollback.r20260808_1800_stabilize_company_entitlements as
select * from public.player_company_dividend_entitlements
where created_at > timestamptz '2026-08-08 18:00:00+09';

create table if not exists admin_rollback.r20260808_1800_stabilize_board_decisions as
select * from public.player_company_board_decisions
where created_at > timestamptz '2026-08-08 18:00:00+09';

create table if not exists admin_rollback.r20260808_1800_stabilize_governance_votes as
select * from public.player_company_governance_votes
where cast_at > timestamptz '2026-08-08 18:00:00+09';

alter table admin_rollback.r20260808_1800_stabilize_metadata enable row level security;
alter table admin_rollback.r20260808_1800_stabilize_game_saves enable row level security;
alter table admin_rollback.r20260808_1800_stabilize_leaderboard enable row level security;
alter table admin_rollback.r20260808_1800_stabilize_cash_adjustments enable row level security;
alter table admin_rollback.r20260808_1800_stabilize_amc_events enable row level security;
alter table admin_rollback.r20260808_1800_stabilize_amc_payments enable row level security;
alter table admin_rollback.r20260808_1800_stabilize_amc_trades enable row level security;
alter table admin_rollback.r20260808_1800_stabilize_amc_positions enable row level security;
alter table admin_rollback.r20260808_1800_stabilize_amc_funds enable row level security;
alter table admin_rollback.r20260808_1800_stabilize_amc_accounts enable row level security;
alter table admin_rollback.r20260808_1800_stabilize_company_actions enable row level security;
alter table admin_rollback.r20260808_1800_stabilize_company_market_state enable row level security;
alter table admin_rollback.r20260808_1800_stabilize_company_dividends enable row level security;
alter table admin_rollback.r20260808_1800_stabilize_company_entitlements enable row level security;
alter table admin_rollback.r20260808_1800_stabilize_board_decisions enable row level security;
alter table admin_rollback.r20260808_1800_stabilize_governance_votes enable row level security;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from admin_rollback.r20260808_1800_wallet_targets;

  if v_count < 27 then
    raise exception 'safe_rollback_target_count_shrank: %', v_count;
  end if;

  if exists (
    select 1 from admin_rollback.r20260808_1800_wallet_targets
    where target_cents is null
       or target_cents < 0
       or target_cents >= 100000000000000000000::numeric
  ) then
    raise exception 'unsafe_wallet_target_detected';
  end if;
end;
$$;

-- The reset marker is a monotonic server-authoritative boundary. A client may
-- save normally after loading the reset wallet, but a pre-reset local snapshot
-- can never replace it, even if that client has learned the newest revision.
create or replace function public.guard_game_save_account_reset_marker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_marker numeric := case
    when coalesce(old.state ->> 'accountResetAt', '') ~ '^[0-9]+$'
      then (old.state ->> 'accountResetAt')::numeric
    else 0
  end;
  v_new_marker numeric := case
    when coalesce(new.state ->> 'accountResetAt', '') ~ '^[0-9]+$'
      then (new.state ->> 'accountResetAt')::numeric
    else 0
  end;
begin
  if v_new_marker < v_old_marker then
    raise exception 'stale_pre_reset_wallet'
      using errcode = '40001';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_game_save_account_reset_marker()
  from public, anon, authenticated;

drop trigger if exists game_saves_00_account_reset_marker_guard
  on public.game_saves;
create trigger game_saves_00_account_reset_marker_guard
  before update of state on public.game_saves
  for each row execute function public.guard_game_save_account_reset_marker();

-- Remove activity recreated after the cutoff while clients were still open.
delete from public.account_cash_adjustments
where created_at > timestamptz '2026-08-08 18:00:00+09';

delete from public.amc_fund_payments
where created_at > timestamptz '2026-08-08 18:00:00+09';

delete from public.amc_fund_events
where created_at > timestamptz '2026-08-08 18:00:00+09';

delete from public.amc_fund_positions p
using (
  select distinct user_id, fund_id
  from admin_rollback.r20260808_1800_stabilize_amc_trades
) a
where p.user_id = a.user_id and p.fund_id = a.fund_id;

insert into public.amc_fund_positions (fund_id, user_id, game_id, quantity, updated_at)
select
  t.fund_id,
  t.user_id,
  ga.game_id,
  t.position_after - t.delta_shares,
  now()
from (
  select distinct on (user_id, fund_id) *
  from admin_rollback.r20260808_1800_stabilize_amc_trades
  order by user_id, fund_id, created_at
) t
join public.game_accounts ga on ga.user_id = t.user_id
where t.position_after - t.delta_shares > 0;

update public.amc_listed_funds f
set total_shares = first_trade.fund_total_shares_after - first_trade.delta_shares,
    cumulative_fees_paid = coalesce((
      select sum(e.total) from public.amc_fund_events e
      where e.fund_id = f.id and e.kind = 'management_fee'
    ), 0),
    cumulative_dividends_paid = coalesce((
      select sum(e.total) from public.amc_fund_events e
      where e.fund_id = f.id and e.kind = 'dividend'
    ), 0),
    last_fee_session = coalesce((
      select max(e.due_session) from public.amc_fund_events e
      where e.fund_id = f.id and e.kind = 'management_fee'
    ), 0),
    last_dividend_session = coalesce((
      select max(e.due_session) from public.amc_fund_events e
      where e.fund_id = f.id and e.kind = 'dividend'
    ), 0),
    settlement_input_at = case
      when f.settlement_input_at > timestamptz '2026-08-08 18:00:00+09'
        then null
      else f.settlement_input_at
    end,
    updated_at = now()
from (
  select distinct on (fund_id) *
  from admin_rollback.r20260808_1800_stabilize_amc_trades
  order by fund_id, created_at
) first_trade
where f.id = first_trade.fund_id;

update public.amc_accounts a
set balance_delta = first_trade.ledger_balance_after - first_trade.cash_delta,
    revision = greatest(first_trade.ledger_revision_after - 1, 0),
    updated_at = now()
from (
  select distinct on (f.manager_user_id)
    f.manager_user_id,
    t.ledger_balance_after,
    t.cash_delta,
    t.ledger_revision_after
  from admin_rollback.r20260808_1800_stabilize_amc_trades t
  join public.amc_listed_funds f on f.id = t.fund_id
  order by f.manager_user_id, t.created_at
) first_trade
where a.user_id = first_trade.manager_user_id;

delete from public.amc_fund_trades
where created_at > timestamptz '2026-08-08 18:00:00+09';

delete from public.player_company_dividend_entitlements
where created_at > timestamptz '2026-08-08 18:00:00+09';

delete from public.player_company_dividends
where created_at > timestamptz '2026-08-08 18:00:00+09';

delete from public.player_company_governance_votes
where cast_at > timestamptz '2026-08-08 18:00:00+09';

delete from public.player_company_board_decisions
where created_at > timestamptz '2026-08-08 18:00:00+09';

update public.player_company_market_state s
set total_shares = first_action.total_shares_before,
    public_shares = first_action.public_shares_before,
    updated_at = now()
from (
  select distinct on (stock_id) *
  from admin_rollback.r20260808_1800_stabilize_company_actions
  order by stock_id, created_at
) first_action
where s.stock_id = first_action.stock_id;

delete from public.player_company_market_actions
where created_at > timestamptz '2026-08-08 18:00:00+09';

-- These users are being restored to an exact cash-only total, so their ETF
-- position and accumulated ETF cash ledger must also be neutralized.
delete from public.amc_fund_positions p
using admin_rollback.r20260808_1800_wallet_targets t
where p.user_id = t.user_id;

update public.amc_accounts a
set balance_delta = 0,
    revision = a.revision + 1,
    updated_at = now()
from admin_rollback.r20260808_1800_wallet_targets t
where a.user_id = t.user_id;

update public.game_saves gs
set state = gs.state || jsonb_build_object(
      'cash', t.target_cents,
      'cashExact', t.target_cents::text,
      'holdings', '[]'::jsonb,
      'shorts', '[]'::jsonb,
      'options', '[]'::jsonb,
      'openOrders', '[]'::jsonb,
      'ownedLuxuries', '[]'::jsonb,
      'pensionAnnuities', '[]'::jsonb,
      'preferredShares', '[]'::jsonb,
      'recurringInvestments', '[]'::jsonb,
      'playerCompany', 'null'::jsonb,
      'assetManager', 'null'::jsonb,
      'marginEnabled', false,
      'marginLeverage', 1,
      'amcLedgerBalance', 0,
      'amcLedgerBalanceExact', '0',
      'netWorthHistory', '[]'::jsonb,
      'cloudSaveFailedAt', 0,
      'accountResetAt', m.reset_marker,
      'trades', coalesce((
        select jsonb_agg(item)
        from jsonb_array_elements(coalesce(gs.state -> 'trades', '[]'::jsonb)) item
        where nullif(item ->> 'timestamp', '') is null
           or (item ->> 'timestamp')::numeric <= 1786179600000
      ), '[]'::jsonb),
      'cashPayments', coalesce((
        select jsonb_agg(item)
        from jsonb_array_elements(coalesce(gs.state -> 'cashPayments', '[]'::jsonb)) item
        where nullif(item ->> 'timestamp', '') is null
           or (item ->> 'timestamp')::numeric <= 1786179600000
      ), '[]'::jsonb),
      'investmentSeason', case
        when gs.state #> '{investmentSeason,current}' is null
          then gs.state -> 'investmentSeason'
        else jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(gs.state -> 'investmentSeason', '{current,startEquity}',
                to_jsonb(t.target_cents), false),
              '{current,peakEquity}', to_jsonb(t.target_cents), false),
            '{current,minimumEquity}', to_jsonb(t.target_cents), false),
          '{current,maximumDrawdown}', '0'::jsonb, false)
      end
    ),
    wallet_revision = gs.wallet_revision + 1000,
    updated_at = now()
from admin_rollback.r20260808_1800_wallet_targets t
cross join admin_rollback.r20260808_1800_stabilize_metadata m
where gs.user_id = t.user_id;

update public.leaderboard lb
set net_worth = t.target_cents,
    weekly_start_net_worth = t.target_cents,
    weekly_return = 0,
    return_rate = case
      when lb.initial_cash > 0
        then ((t.target_cents - lb.initial_cash)::numeric /
              lb.initial_cash::numeric) * 100
      else lb.return_rate
    end,
    top_tier = 0,
    luxury_count = 0,
    showcase = array[]::text[],
    trade_count = coalesce(jsonb_array_length(gs.state -> 'trades'), 0),
    win_rate = 0,
    updated_at = now()
from admin_rollback.r20260808_1800_wallet_targets t
join public.game_saves gs on gs.user_id = t.user_id
where lb.user_id = t.user_id;

delete from public.leaderboard_session_snapshots
where created_at > timestamptz '2026-08-08 18:00:00+09';

commit;
