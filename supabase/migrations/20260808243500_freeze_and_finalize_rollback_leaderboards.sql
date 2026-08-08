-- Keep rollback-target leaderboard rows aligned while their wallets are frozen.

begin;

create or replace function public.guard_leaderboard_recovery_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.recovery_bypass', true) = 'on' then
    return new;
  end if;

  if exists (
    select 1
    from public.game_save_recovery_locks l
    where l.user_id = new.user_id
      and l.unlocked_at is null
  ) then
    raise exception 'account_recovery_in_progress'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_leaderboard_recovery_lock()
  from public, anon, authenticated;

drop trigger if exists leaderboard_00_recovery_lock_guard
  on public.leaderboard;
create trigger leaderboard_00_recovery_lock_guard
  before insert or update on public.leaderboard
  for each row execute function public.guard_leaderboard_recovery_lock();

set local app.recovery_bypass = 'on';

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

commit;
