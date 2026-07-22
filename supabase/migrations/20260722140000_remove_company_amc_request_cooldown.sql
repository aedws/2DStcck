-- 회사·자산운용사 설립 신청은 쿨다운 없음.
-- ETF 상장·IPO 종목 요청만 종류별 5시간 쿨다운을 유지한다.

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
    return new;
  elsif coalesce(new.description, '') like '[ASSET_MANAGER_FOUNDATION]%' then
    return new;
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
