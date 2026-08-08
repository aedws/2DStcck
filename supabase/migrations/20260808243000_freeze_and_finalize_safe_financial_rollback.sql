-- Freeze rollback targets while the reset-aware client is being deployed, then
-- re-assert the audited 18:00 KST cash-only values one final time.

begin;

create schema if not exists admin_rollback;
revoke all on schema admin_rollback from public, anon, authenticated;

create table if not exists admin_rollback.r20260808_1800_finalize_game_saves as
select gs.*
from public.game_saves gs
join admin_rollback.r20260808_1800_wallet_targets t using (user_id);

create table if not exists admin_rollback.r20260808_1800_finalize_leaderboard as
select lb.*
from public.leaderboard lb
join admin_rollback.r20260808_1800_wallet_targets t using (user_id);

alter table admin_rollback.r20260808_1800_finalize_game_saves
  enable row level security;
alter table admin_rollback.r20260808_1800_finalize_leaderboard
  enable row level security;

insert into public.game_save_recovery_locks (
  user_id, reset_marker, reason, locked_at, unlocked_at
)
select
  t.user_id,
  m.reset_marker,
  'safe_financial_rollback_20260808_1800',
  now(),
  null
from admin_rollback.r20260808_1800_wallet_targets t
cross join admin_rollback.r20260808_1800_stabilize_metadata m
on conflict (user_id) do update
set reset_marker = excluded.reset_marker,
    reason = excluded.reason,
    locked_at = excluded.locked_at,
    unlocked_at = null;

set local app.recovery_bypass = 'on';

-- Remove anything recreated after the requested cutoff during the stabilization
-- window. The earlier two audit passes preserve the pre-delete rows.
delete from public.account_cash_adjustments
where created_at > timestamptz '2026-08-08 18:00:00+09';

delete from public.amc_fund_payments
where created_at > timestamptz '2026-08-08 18:00:00+09';

delete from public.amc_fund_events
where created_at > timestamptz '2026-08-08 18:00:00+09';

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

delete from public.player_company_market_actions
where created_at > timestamptz '2026-08-08 18:00:00+09';

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
      'lastSalarySession', floor(
        extract(epoch from clock_timestamp()) * 1000 /
        greatest(
          case
            when coalesce(gs.state ->> 'sessionDurationMs', '') ~ '^[0-9]+$'
              then (gs.state ->> 'sessionDurationMs')::numeric
            else 3600000
          end,
          1
        )
      )::bigint,
      'lastMonthlyDistributionSession', floor(
        extract(epoch from clock_timestamp()) * 1000 /
        greatest(coalesce(nullif(gs.state ->> 'sessionDurationMs', '')::numeric, 3600000), 1)
      )::bigint,
      'lastSingleCoveredCallDistributionSession', floor(
        extract(epoch from clock_timestamp()) * 1000 /
        greatest(coalesce(nullif(gs.state ->> 'sessionDurationMs', '')::numeric, 3600000), 1)
      )::bigint,
      'lastQuarterlyDividendSession', floor(
        extract(epoch from clock_timestamp()) * 1000 /
        greatest(coalesce(nullif(gs.state ->> 'sessionDurationMs', '')::numeric, 3600000), 1)
      )::bigint,
      'lastInterestSession', floor(
        extract(epoch from clock_timestamp()) * 1000 /
        greatest(coalesce(nullif(gs.state ->> 'sessionDurationMs', '')::numeric, 3600000), 1)
      )::bigint,
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
