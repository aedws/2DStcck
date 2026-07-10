-- 지정가 주문: 가격 도달 시 서버 틱에서 자동 체결
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  stock_id text not null,
  ticker text not null,
  side text not null check (side in ('buy', 'sell')),
  price integer not null check (price > 0),
  quantity integer not null check (quantity > 0),
  status text not null default 'open' check (status in ('open', 'filled', 'cancelled')),
  created_at timestamptz not null default now(),
  filled_at timestamptz,
  filled_price integer
);

create index if not exists orders_open_idx
  on public.orders (status, stock_id) where status = 'open';
create index if not exists orders_user_idx
  on public.orders (user_id, created_at desc);

alter table public.orders enable row level security;

create policy "orders_select_own" on public.orders
  for select using (auth.uid() = user_id);

-- 본인 미체결 주문 취소만 허용
create policy "orders_cancel_own" on public.orders
  for update using (auth.uid() = user_id and status = 'open')
  with check (auth.uid() = user_id and status = 'cancelled');

alter publication supabase_realtime add table public.orders;
