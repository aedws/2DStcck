-- 유저의 '종목 추가 요청' 저장 테이블.
-- 유저는 자기 요청을 INSERT/SELECT 할 수 있고, 관리자(dorothy)만 전체를
-- SELECT/UPDATE 한다. 실제 재화(현금) 차감은 클라이언트 지갑에서 이뤄지고,
-- 여기엔 감사를 위한 cost_paid 만 기록한다. 스팸 방지를 위해 계정당 쿨다운을
-- DB 트리거로도 한 번 더 강제한다(클라이언트 쿨다운의 백스톱).

create table if not exists public.stock_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null,
  sector text,
  name text not null check (char_length(name) between 1 and 60),
  description text check (description is null or char_length(description) <= 1000),
  reference_url text check (reference_url is null or char_length(reference_url) <= 500),
  cost_paid integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'accepted', 'rejected', 'shipped')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_requests_created_at_idx
  on public.stock_requests (created_at desc);
create index if not exists stock_requests_user_idx
  on public.stock_requests (user_id);

alter table public.stock_requests enable row level security;

-- 관리자 판별: 게임 이메일이 game.dorothy@2dstock.local 인 세션.
-- (게임 아이디는 공개 식별자이며, 실제 접근 보안은 그 계정의 PIN 이 담당한다.)
create or replace function public.is_stock_request_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'game.dorothy@2dstock.local';
$$;

-- 인증 유저는 자기 소유 요청만 INSERT.
drop policy if exists "stock_requests_insert_own" on public.stock_requests;
create policy "stock_requests_insert_own" on public.stock_requests
  for insert to authenticated
  with check (auth.uid() = user_id);

-- 본인 요청은 읽을 수 있고, 관리자는 전체를 읽는다.
drop policy if exists "stock_requests_select_own_or_admin" on public.stock_requests;
create policy "stock_requests_select_own_or_admin" on public.stock_requests
  for select to authenticated
  using (auth.uid() = user_id or public.is_stock_request_admin());

-- 상태 변경(검토/반영/반려 등)은 관리자만.
drop policy if exists "stock_requests_update_admin" on public.stock_requests;
create policy "stock_requests_update_admin" on public.stock_requests
  for update to authenticated
  using (public.is_stock_request_admin())
  with check (public.is_stock_request_admin());

grant select, insert, update on public.stock_requests to authenticated;
revoke delete on public.stock_requests from anon, authenticated;

-- 쿨다운 백스톱: 같은 계정이 5시간(=5거래일) 내에 다시 요청하지 못하게 한다.
create or replace function public.enforce_stock_request_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
begin
  select max(created_at) into v_last
  from public.stock_requests
  where user_id = new.user_id;

  if v_last is not null and now() - v_last < interval '5 hours' then
    raise exception 'stock_request_cooldown'
      using hint = '요청 쿨다운(5거래일)이 아직 남았습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists stock_requests_cooldown on public.stock_requests;
create trigger stock_requests_cooldown
  before insert on public.stock_requests
  for each row execute function public.enforce_stock_request_cooldown();
