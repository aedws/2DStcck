-- 유저의 '피드백·요청 사항' 저장 테이블.
-- 유저는 자기 것만 INSERT/SELECT 하고, 관리자(dorothy)만 전체를 SELECT/UPDATE 한다.
-- 무료 제출. 스팸 방지를 위해 계정당 짧은 쿨다운을 DB 트리거로 백스톱한다.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null,
  category text check (category is null or char_length(category) <= 40),
  title text not null check (char_length(title) between 1 and 80),
  description text check (description is null or char_length(description) <= 2000),
  status text not null default 'open'
    check (status in ('open', 'considering', 'planned', 'done', 'declined')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_created_at_idx
  on public.feedback (created_at desc);
create index if not exists feedback_user_idx
  on public.feedback (user_id);

alter table public.feedback enable row level security;

-- 관리자 판별은 stock_requests 와 동일한 함수를 재사용한다.
create or replace function public.is_stock_request_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'game.dorothy@2dstock.local';
$$;

drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own" on public.feedback
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "feedback_select_own_or_admin" on public.feedback;
create policy "feedback_select_own_or_admin" on public.feedback
  for select to authenticated
  using (auth.uid() = user_id or public.is_stock_request_admin());

drop policy if exists "feedback_update_admin" on public.feedback;
create policy "feedback_update_admin" on public.feedback
  for update to authenticated
  using (public.is_stock_request_admin())
  with check (public.is_stock_request_admin());

grant select, insert, update on public.feedback to authenticated;
revoke delete on public.feedback from anon, authenticated;

-- 쿨다운 백스톱: 같은 계정이 30초 내에 다시 제출하지 못하게 한다.
create or replace function public.enforce_feedback_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
begin
  select max(created_at) into v_last
  from public.feedback
  where user_id = new.user_id;

  if v_last is not null and now() - v_last < interval '30 seconds' then
    raise exception 'feedback_cooldown'
      using hint = '잠시 후 다시 제출해 주세요.';
  end if;

  return new;
end;
$$;

drop trigger if exists feedback_cooldown on public.feedback;
create trigger feedback_cooldown
  before insert on public.feedback
  for each row execute function public.enforce_feedback_cooldown();
