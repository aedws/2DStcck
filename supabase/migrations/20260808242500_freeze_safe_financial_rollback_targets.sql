-- Stop active clients from mutating wallets while the final rollback pass runs.

begin;

create table if not exists public.game_save_recovery_locks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reset_marker bigint not null,
  reason text not null,
  locked_at timestamptz not null default now(),
  unlocked_at timestamptz
);

alter table public.game_save_recovery_locks enable row level security;
revoke all on public.game_save_recovery_locks from public, anon, authenticated;

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

create or replace function public.guard_game_save_recovery_lock()
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

revoke all on function public.guard_game_save_recovery_lock()
  from public, anon, authenticated;

drop trigger if exists game_saves_00_recovery_lock_guard
  on public.game_saves;
create trigger game_saves_00_recovery_lock_guard
  before update of state on public.game_saves
  for each row execute function public.guard_game_save_recovery_lock();

commit;
