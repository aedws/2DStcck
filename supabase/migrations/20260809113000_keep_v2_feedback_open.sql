-- 자정 이후 V1 금융 원장은 계속 동결하되, V2 최초 플레이어 개선안은 접수한다.
-- feedback RLS·30초 쿨다운·길이 제한은 그대로 적용되며 다른 public 테이블의
-- insert/update/delete 차단은 완화하지 않는다.

create or replace function public.guard_service_rebuild_shutdown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_schema = 'public' and tg_table_name = 'feedback' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if public.service_rebuild_is_closed(clock_timestamp())
     and current_setting('app.service_rebuild_bypass', true) is distinct from 'on'
  then
    raise exception using
      errcode = '55000',
      message = 'service_rebuild_shutdown',
      detail = 'The legacy 2DStock ledger is read-only after 2026-08-10 00:00 KST.',
      hint = 'Only authenticated V2 improvement feedback remains writable.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_service_rebuild_shutdown() from public;

comment on function public.guard_service_rebuild_shutdown() is
  'Freezes the legacy public ledger after cutoff; authenticated feedback remains open for V2 proposals.';
