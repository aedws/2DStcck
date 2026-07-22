-- 운용사가 이미 생성·상장한 ETF의 자동 분할·병합 설정을 변경한다.

create or replace function public.amc_update_share_adjustment_settings(
  p_fund_id text,
  p_split_trigger_price bigint,
  p_split_ratio integer,
  p_reverse_split_trigger_price bigint,
  p_reverse_split_ratio integer
)
returns public.amc_listed_funds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fund public.amc_listed_funds;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_fund
  from public.amc_listed_funds
  where id = p_fund_id
  for update;
  if not found then raise exception 'fund_not_found'; end if;
  if v_fund.manager_user_id <> auth.uid() then raise exception 'not_manager'; end if;
  if v_fund.status = 'delisted' then raise exception 'fund_delisted'; end if;

  if (p_split_trigger_price is not null and p_split_trigger_price <= 0)
     or (p_reverse_split_trigger_price is not null and p_reverse_split_trigger_price <= 0)
     or p_split_ratio not in (2, 5, 10)
     or p_reverse_split_ratio not in (2, 5, 10)
     or (
       p_split_trigger_price is not null
       and p_reverse_split_trigger_price is not null
       and p_reverse_split_trigger_price >= p_split_trigger_price
     ) then
    raise exception 'invalid_share_adjustment_settings';
  end if;

  update public.amc_listed_funds
  set split_trigger_price = p_split_trigger_price,
      split_ratio = p_split_ratio,
      reverse_split_trigger_price = p_reverse_split_trigger_price,
      reverse_split_ratio = p_reverse_split_ratio,
      updated_at = now()
  where id = p_fund_id
  returning * into v_fund;

  return v_fund;
end;
$$;

revoke all on function public.amc_update_share_adjustment_settings(
  text, bigint, integer, bigint, integer
) from public, anon;
grant execute on function public.amc_update_share_adjustment_settings(
  text, bigint, integer, bigint, integer
) to authenticated;
