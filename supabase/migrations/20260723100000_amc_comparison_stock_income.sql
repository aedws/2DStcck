-- 유저 ETF별 일반 주식 1개를 성과 비교 대상으로 저장한다.
-- 배당 이력에는 지급 당시 좌수 배수를 함께 남겨 후속 분할·병합 뒤에도
-- 커버드콜 인컴을 현재 좌당 기준으로 환산할 수 있게 한다.

alter table public.amc_listed_funds
  add column if not exists comparison_stock_id text;

comment on column public.amc_listed_funds.comparison_stock_id is
  '유저 ETF 인컴 포함 총수익률과 비교할 일반 주식 id 1개';

create or replace function public.amc_update_comparison_stock(
  p_fund_id text,
  p_comparison_stock_id text
)
returns public.amc_listed_funds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fund public.amc_listed_funds;
  v_comparison_stock_id text := trim(coalesce(p_comparison_stock_id, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(v_comparison_stock_id) not between 1 and 100
     or v_comparison_stock_id !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'invalid_comparison_stock';
  end if;

  select * into v_fund
  from public.amc_listed_funds
  where id = p_fund_id
  for update;
  if not found then raise exception 'fund_not_found'; end if;
  if v_fund.manager_user_id <> auth.uid() then raise exception 'not_manager'; end if;
  if v_fund.status = 'delisted' then raise exception 'fund_delisted'; end if;

  update public.amc_listed_funds
  set comparison_stock_id = v_comparison_stock_id,
      updated_at = now()
  where id = p_fund_id
  returning * into v_fund;
  return v_fund;
end;
$$;

revoke all on function public.amc_update_comparison_stock(text, text)
  from public, anon;
grant execute on function public.amc_update_comparison_stock(text, text)
  to authenticated;

create or replace function public.amc_stamp_dividend_share_multiplier()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.dividend_history is distinct from old.dividend_history
     and jsonb_typeof(new.dividend_history) = 'array' then
    select coalesce(
      jsonb_agg(
        case
          when value ? 'shareMultiplier' then value
          else value || jsonb_build_object(
            'shareMultiplier', greatest(new.share_multiplier, 0.000001)
          )
        end
        order by ordinality
      ),
      '[]'::jsonb
    )
    into new.dividend_history
    from jsonb_array_elements(new.dividend_history) with ordinality;
  end if;
  return new;
end;
$$;

drop trigger if exists amc_stamp_dividend_share_multiplier
  on public.amc_listed_funds;
create trigger amc_stamp_dividend_share_multiplier
before update of dividend_history on public.amc_listed_funds
for each row execute function public.amc_stamp_dividend_share_multiplier();
