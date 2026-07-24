-- 개발자 처리 상태(전역 싱글턴). 버그/피드백/IPO 화면에서 유저가 현재 개발자가
-- 처리 중인지, 보류인지, 토큰 부족으로 불가인지(그리고 언제 재개하는지) 볼 수 있게 한다.
--   available = 수정 가능(처리 중) / paused = 보류 / blocked = 토큰 부족으로 불가
-- 쓰기는 admin(is_stock_request_admin) 만 set_dev_status RPC 로 가능하다.

create table if not exists public.dev_status (
  id boolean primary key default true,
  state text not null default 'available'
    check (state in ('available', 'paused', 'blocked')),
  resume_at timestamptz,
  note text,
  updated_at timestamptz not null default now(),
  constraint dev_status_singleton check (id)
);

insert into public.dev_status (id, state) values (true, 'available')
on conflict (id) do nothing;

alter table public.dev_status enable row level security;
revoke all on public.dev_status from public, anon, authenticated;
grant select on public.dev_status to anon, authenticated;

drop policy if exists dev_status_read on public.dev_status;
create policy dev_status_read on public.dev_status
  for select to anon, authenticated using (true);

create or replace function public.set_dev_status(
  p_state text,
  p_resume_at timestamptz,
  p_note text
) returns public.dev_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.dev_status;
begin
  if not public.is_stock_request_admin() then
    raise exception 'not_admin';
  end if;
  if p_state not in ('available', 'paused', 'blocked') then
    raise exception 'invalid_state';
  end if;
  update public.dev_status set
    state = p_state,
    resume_at = case when p_state = 'blocked' then p_resume_at else null end,
    note = nullif(btrim(coalesce(p_note, '')), ''),
    updated_at = now()
  where id = true
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.set_dev_status(text, timestamptz, text)
  from public, anon;
grant execute on function public.set_dev_status(text, timestamptz, text)
  to authenticated;
