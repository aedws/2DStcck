-- 운용사 프로필 동기화를 SECURITY DEFINER RPC로 전환한다.
-- 직접 UPDATE 권한이 회수돼 있어 프로필/한줄소개 변경이 'permission denied
-- for table amc_listed_funds'로 실패하던 문제(@monoch, @asset_management)를 해결한다.
create or replace function public.amc_update_manager_profile(
  p_name text,
  p_tagline text,
  p_detail text
)
returns setof public.amc_listed_funds
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  return query
  update public.amc_listed_funds
  set manager_name = left(trim(coalesce(p_name, '')), 40),
      manager_tagline = left(trim(coalesce(p_tagline, '')), 80),
      manager_detail = nullif(left(trim(coalesce(p_detail, '')), 500), ''),
      updated_at = now()
  where manager_user_id = auth.uid()
  returning *;
end;
$function$;

grant execute on function public.amc_update_manager_profile(text, text, text)
  to authenticated;
