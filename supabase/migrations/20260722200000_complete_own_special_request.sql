-- 회사·운용사 설립 및 ETF 상장 실행이 끝난 뒤, 사용자가 자기 신청만
-- accepted -> shipped 로 확정할 수 있게 한다. 일반 종목 신청이나 타인 신청,
-- 아직 관리자가 수락하지 않은 신청은 변경할 수 없다.

create or replace function public.complete_own_special_stock_request(
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.stock_requests
  set status = 'shipped', updated_at = now()
  where id = p_request_id
    and user_id = auth.uid()
    and status = 'accepted'
    and (
      description like '[PLAYER_COMPANY_FOUNDATION]%'
      or description like '[ASSET_MANAGER_FOUNDATION]%'
      or description like '[AMC_ETF_LISTING]%'
    );

  if found then
    return true;
  end if;

  return exists (
    select 1
    from public.stock_requests
    where id = p_request_id
      and user_id = auth.uid()
      and status = 'shipped'
      and (
        description like '[PLAYER_COMPANY_FOUNDATION]%'
        or description like '[ASSET_MANAGER_FOUNDATION]%'
        or description like '[AMC_ETF_LISTING]%'
      )
  );
end;
$$;

revoke all on function public.complete_own_special_stock_request(uuid) from public;
grant execute on function public.complete_own_special_stock_request(uuid) to authenticated;
