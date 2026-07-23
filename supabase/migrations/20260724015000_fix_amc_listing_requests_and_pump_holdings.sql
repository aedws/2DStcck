-- 최대 30종목 ETF의 기준가·벤치마크·분할 설정을 온전히 저장하고,
-- 수명이 짧은 급등주가 유저 ETF 원장에 편입되는 우회 경로를 서버에서 차단한다.

alter table public.stock_requests
  drop constraint if exists stock_requests_description_check;

alter table public.stock_requests
  add constraint stock_requests_description_check
  check (description is null or char_length(description) <= 20000);

alter table public.stock_requests
  drop constraint if exists stock_requests_amc_no_pump_holdings_check;

alter table public.stock_requests
  add constraint stock_requests_amc_no_pump_holdings_check
  check (
    description is null
    or description not like '[AMC_ETF_LISTING]%'
    or description !~ E'"stockId"\\s*:\\s*"pump-'
  );

create or replace function public.reject_pump_stock_in_amc_holdings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if jsonb_typeof(new.holdings) = 'array' and exists (
    select 1
    from jsonb_array_elements(new.holdings) as item
    where coalesce(item ->> 'stockId', '') like 'pump-%'
  ) then
    raise exception 'pump_stock_not_allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists amc_listed_funds_reject_pump_holdings
  on public.amc_listed_funds;

create trigger amc_listed_funds_reject_pump_holdings
  before insert or update of holdings on public.amc_listed_funds
  for each row execute function public.reject_pump_stock_in_amc_holdings();

update public.bug_reports
set
  status = 'fixed',
  admin_note = '최대 30종목 ETF의 구성 기준가·벤치마크·분할 설정을 담은 신청 데이터가 기존 1,000자 제한을 넘으면 서버가 거절하던 원인을 확인했습니다. 저장 한도를 20,000자로 확장하고 최대 구성 신청 회귀 테스트를 추가해 상장 허가 신청이 정상 접수되도록 수정했습니다.',
  updated_at = now()
where id = '2df073d9-7d02-4f95-84c5-b841262d5b09'
  and status in ('open', 'investigating');
