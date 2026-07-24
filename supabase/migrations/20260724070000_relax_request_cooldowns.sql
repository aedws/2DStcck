-- 요청 쿨다운 완화: 유저 ETF 상장 신청은 30분, IPO 종목 요청은 3시간으로 줄인다.
-- 회사·자산운용사 설립 신청은 기존과 같이 쿨다운 없음.

create or replace function public.enforce_stock_request_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_kind text;
  v_interval interval;
begin
  if coalesce(new.description, '') like '[PLAYER_COMPANY_FOUNDATION]%' then
    return new;
  elsif coalesce(new.description, '') like '[ASSET_MANAGER_FOUNDATION]%' then
    return new;
  elsif coalesce(new.description, '') like '[AMC_ETF_LISTING]%' then
    v_kind := 'etf';
    v_interval := interval '30 minutes';
  else
    v_kind := 'ipo';
    v_interval := interval '3 hours';
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

  if v_last is not null and now() - v_last < v_interval then
    raise exception 'stock_request_cooldown'
      using hint = case v_kind
        when 'etf' then 'ETF 상장 신청 쿨다운(30분)이 아직 남았습니다.'
        else '종목 요청 쿨다운(3시간)이 아직 남았습니다.'
      end;
  end if;

  return new;
end;
$$;
