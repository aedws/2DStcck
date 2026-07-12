-- 경량 계정 동기화: 결정론 시장은 클라이언트가 계산하므로 저장할 것은 유저 지갑뿐.
-- 지갑 슬라이스(현금·보유·거래·카운터·대기주문)를 유저당 JSON 한 행으로 저장한다.
-- 시장(stocks/events)은 저장하지 않는다 — 기원점부터 결정론으로 재계산된다.

create table if not exists public.game_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.game_saves enable row level security;

-- 본인 저장분만 읽고 쓴다 (지갑은 본인 소유 — 랭킹 붙일 때 서버 검증으로 하드닝 예정)
drop policy if exists "game_saves_select_own" on public.game_saves;
create policy "game_saves_select_own" on public.game_saves
  for select using (auth.uid() = user_id);

drop policy if exists "game_saves_insert_own" on public.game_saves;
create policy "game_saves_insert_own" on public.game_saves
  for insert with check (auth.uid() = user_id);

drop policy if exists "game_saves_update_own" on public.game_saves;
create policy "game_saves_update_own" on public.game_saves
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.game_saves to authenticated;
revoke delete on public.game_saves from anon, authenticated;
