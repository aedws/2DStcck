alter table public.leaderboard
  add column if not exists weekly_return numeric not null default 0,
  add column if not exists title text not null default '';

create index if not exists leaderboard_weekly_return_idx
  on public.leaderboard (weekly_return desc);
