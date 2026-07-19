-- 유저의 '버그 리포트' 저장 테이블.
-- 유저는 자기 리포트를 INSERT/SELECT 할 수 있고, 관리자(dorothy)만 전체를
-- SELECT/UPDATE 한다. 재화 소모 없이 무료로 제출한다(버그 제보 장려).
-- 스팸 방지를 위해 계정당 짧은 쿨다운을 DB 트리거로 백스톱한다.

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null,
  category text check (category is null or char_length(category) <= 40),
  title text not null check (char_length(title) between 1 and 80),
  description text check (description is null or char_length(description) <= 2000),
  status text not null default 'open'
    check (status in ('open', 'investigating', 'fixed', 'wontfix', 'duplicate')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bug_reports_created_at_idx
  on public.bug_reports (created_at desc);
create index if not exists bug_reports_user_idx
  on public.bug_reports (user_id);

alter table public.bug_reports enable row level security;

-- 관리자 판별은 stock_requests 와 동일한 함수(게임 이메일 = game.dorothy@2dstock.local)를
-- 재사용한다. 없을 경우를 대비해 방어적으로 재정의한다.
create or replace function public.is_stock_request_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'game.dorothy@2dstock.local';
$$;

-- 인증 유저는 자기 소유 리포트만 INSERT.
drop policy if exists "bug_reports_insert_own" on public.bug_reports;
create policy "bug_reports_insert_own" on public.bug_reports
  for insert to authenticated
  with check (auth.uid() = user_id);

-- 본인 리포트는 읽을 수 있고, 관리자는 전체를 읽는다.
drop policy if exists "bug_reports_select_own_or_admin" on public.bug_reports;
create policy "bug_reports_select_own_or_admin" on public.bug_reports
  for select to authenticated
  using (auth.uid() = user_id or public.is_stock_request_admin());

-- 상태 변경(조사/수정/보류 등)은 관리자만.
drop policy if exists "bug_reports_update_admin" on public.bug_reports;
create policy "bug_reports_update_admin" on public.bug_reports
  for update to authenticated
  using (public.is_stock_request_admin())
  with check (public.is_stock_request_admin());

grant select, insert, update on public.bug_reports to authenticated;
revoke delete on public.bug_reports from anon, authenticated;

-- 쿨다운 백스톱: 같은 계정이 30초 내에 다시 제출하지 못하게 한다(연타 스팸 방지).
create or replace function public.enforce_bug_report_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
begin
  select max(created_at) into v_last
  from public.bug_reports
  where user_id = new.user_id;

  if v_last is not null and now() - v_last < interval '30 seconds' then
    raise exception 'bug_report_cooldown'
      using hint = '잠시 후 다시 제출해 주세요.';
  end if;

  return new;
end;
$$;

drop trigger if exists bug_reports_cooldown on public.bug_reports;
create trigger bug_reports_cooldown
  before insert on public.bug_reports
  for each row execute function public.enforce_bug_report_cooldown();
