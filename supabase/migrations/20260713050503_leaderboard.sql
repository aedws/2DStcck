-- 공유 리더보드: 모든 유저가 같은 시장을 보므로 순자산으로 공정한 순위를 낸다.
-- 순자산 = 현금 + 주식 평가 + 사치재 가치 (사치재도 자산으로 합산되어 과시가 곧 점수).
-- 시장이 클라이언트 결정론이라 지표는 클라이언트가 계산해 upsert 한다.
-- (하드닝 예정: 서버 RPC가 holdings·현재가로 순자산을 재계산해 검증)

create table if not exists public.leaderboard (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  net_worth bigint not null default 0,
  return_rate numeric not null default 0,
  top_tier int not null default 0,
  luxury_count int not null default 0,
  showcase text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists leaderboard_net_worth_idx
  on public.leaderboard (net_worth desc);

alter table public.leaderboard enable row level security;

-- 랭킹은 모두가 읽을 수 있다 (공개 순위표)
drop policy if exists "leaderboard_select_all" on public.leaderboard;
create policy "leaderboard_select_all" on public.leaderboard
  for select using (true);

-- 본인 행만 등록·갱신 (display_name 은 인증된 아이디로 클라이언트가 채운다)
drop policy if exists "leaderboard_insert_own" on public.leaderboard;
create policy "leaderboard_insert_own" on public.leaderboard
  for insert with check (auth.uid() = user_id);

drop policy if exists "leaderboard_update_own" on public.leaderboard;
create policy "leaderboard_update_own" on public.leaderboard
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select on public.leaderboard to anon, authenticated;
grant insert, update on public.leaderboard to authenticated;
revoke delete on public.leaderboard from anon, authenticated;
