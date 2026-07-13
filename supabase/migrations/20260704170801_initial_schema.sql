-- 2DStock MVP schema
-- Run in Supabase SQL Editor or via CLI

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text,
  cash bigint not null default 10000000,
  initial_cash bigint not null default 10000000,
  created_at timestamptz not null default now()
);

-- Global market state (single row)
create table if not exists public.market_global (
  id text primary key default 'global',
  tick integer not null default 0,
  market_started_at bigint not null,
  stocks jsonb not null,
  events jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- User holdings
create table if not exists public.holdings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  stock_id text not null,
  quantity integer not null check (quantity > 0),
  average_price integer not null check (average_price > 0),
  primary key (user_id, stock_id)
);

-- Trade history
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  stock_id text not null,
  ticker text not null,
  type text not null check (type in ('buy', 'sell')),
  quantity integer not null check (quantity > 0),
  price integer not null check (price > 0),
  total bigint not null check (total > 0),
  created_at timestamptz not null default now()
);

create index if not exists trades_user_created_idx
  on public.trades (user_id, created_at desc);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nickname', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.market_global enable row level security;
alter table public.holdings enable row level security;
alter table public.trades enable row level security;

-- Profiles: read/update own
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Market: everyone can read
create policy "market_global_select_all" on public.market_global
  for select using (true);

-- Holdings: own data
create policy "holdings_select_own" on public.holdings
  for select using (auth.uid() = user_id);

-- Trades: own data
create policy "trades_select_own" on public.trades
  for select using (auth.uid() = user_id);

-- Realtime
alter publication supabase_realtime add table public.market_global;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.holdings;
alter publication supabase_realtime add table public.trades;
