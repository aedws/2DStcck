-- 2026-08-10 00:00 KST부터 기존 서비스의 모든 public 원장 쓰기를 동결한다.
-- 데이터는 삭제하지 않으며, 운영자가 복구/감사를 수행할 때만 명시적으로
-- `set local app.service_rebuild_bypass = 'on'`을 선언한 트랜잭션에서 우회한다.

create or replace function public.service_rebuild_cutoff()
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select timestamptz '2026-08-10 00:00:00+09';
$$;

create or replace function public.service_rebuild_is_closed(
  p_at timestamptz default clock_timestamp()
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_at >= public.service_rebuild_cutoff();
$$;

create or replace function public.guard_service_rebuild_shutdown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.service_rebuild_is_closed(clock_timestamp())
     and current_setting('app.service_rebuild_bypass', true) is distinct from 'on'
  then
    raise exception using
      errcode = '55000',
      message = 'service_rebuild_shutdown',
      detail = 'The legacy 2DStock ledger is read-only after 2026-08-10 00:00 KST.',
      hint = 'Wait for the rebuilt service to reopen.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_service_rebuild_shutdown() from public;

do $$
declare
  target record;
begin
  for target in
    select c.relname as table_name
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
  loop
    execute format(
      'drop trigger if exists service_rebuild_shutdown_guard on public.%I',
      target.table_name
    );
    execute format(
      'create trigger service_rebuild_shutdown_guard '
      || 'before insert or update or delete on public.%I '
      || 'for each row execute function public.guard_service_rebuild_shutdown()',
      target.table_name
    );
  end loop;
end;
$$;

comment on function public.service_rebuild_cutoff() is
  'Legacy service write cutoff: 2026-08-10 00:00 Asia/Seoul.';
comment on function public.service_rebuild_is_closed(timestamptz) is
  'Returns whether the legacy service is read-only at a given instant.';
comment on function public.guard_service_rebuild_shutdown() is
  'Rejects all writes to the legacy public ledger after the rebuild cutoff.';

