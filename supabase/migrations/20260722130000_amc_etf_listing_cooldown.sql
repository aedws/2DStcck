-- ETF 상장 신청 쿨다운을 운용사 설립·회사 설립·IPO와 분리한다.

create or replace function public.enforce_stock_request_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_kind text;
begin
  if coalesce(new.description, '') like '[PLAYER_COMPANY_FOUNDATION]%' then
    v_kind := 'company';
  elsif coalesce(new.description, '') like '[ASSET_MANAGER_FOUNDATION]%' then
    v_kind := 'amc';
  elsif coalesce(new.description, '') like '[AMC_ETF_LISTING]%' then
    v_kind := 'etf';
  else
    v_kind := 'ipo';
  end if;

  select max(created_at) into v_last
  from public.stock_requests
  where user_id = new.user_id
    and (
      case v_kind
        when 'company' then coalesce(description, '') like '[PLAYER_COMPANY_FOUNDATION]%'
        when 'amc' then coalesce(description, '') like '[ASSET_MANAGER_FOUNDATION]%'
        when 'etf' then coalesce(description, '') like '[AMC_ETF_LISTING]%'
        else coalesce(description, '') not like '[PLAYER_COMPANY_FOUNDATION]%'
          and coalesce(description, '') not like '[ASSET_MANAGER_FOUNDATION]%'
          and coalesce(description, '') not like '[AMC_ETF_LISTING]%'
      end
    );

  if v_last is not null and now() - v_last < interval '5 hours' then
    raise exception 'stock_request_cooldown'
      using hint = '요청 쿨다운(5거래일)이 아직 남았습니다.';
  end if;

  return new;
end;
$$;
