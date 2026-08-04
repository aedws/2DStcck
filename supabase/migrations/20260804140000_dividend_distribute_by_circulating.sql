-- 배당을 명목 '총 발행주식'이 아니라 실제 유통주식(보유자 실보유합) 기준으로 분배한다.
--
-- 기존 declare_player_company_dividend_v3 는 보유자 환산 합계(raw_total)가 예산
-- (p_total_cents) 이하이면 각자 raw_amount(좌당 × 보유)만 받고 나머지는 소각됐다.
-- 명목 총발행이 실제 유통보다 훨씬 크면 좌당 배당이 실제 유통 대비 과소 계산돼,
-- 실보유자가 받는 총액이 창업주가 낸 재원보다 크게 적었다(버그리포트 c10d3202).
--
-- 이제 항상 예산을 실보유 비중대로 비례 분배한다: final = trunc(raw_amount ×
-- total_cents / raw_total). 좌당가(p_per_share_cents)는 상쇄되어 각 보유자는
-- (자기 보유 / 전체 실보유) × 예산을 받는다. Σfinal ≤ p_total_cents 라 돈복사는
-- 불가능하고(초과분은 절사 소각), 실보유자에게 예산 전액이 정확히 돌아간다.
create or replace function public.declare_player_company_dividend_v3(
  p_ticker text,
  p_stock_id text,
  p_per_share_cents numeric,
  p_total_cents numeric,
  p_dividend_session bigint,
  p_dividend_kind text,
  p_share_multiplier numeric
)
returns public.player_company_dividends
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row public.player_company_dividends;
begin
  if coalesce(p_share_multiplier, 0) <= 0 then
    raise exception 'invalid_share_multiplier';
  end if;

  -- v2 performs founder verification, validates the funded budget, debits cash,
  -- and records the founder-side cash payment in the same transaction.
  v_row := public.declare_player_company_dividend_v2(
    p_ticker,
    p_stock_id,
    p_per_share_cents,
    p_total_cents,
    p_dividend_session,
    p_dividend_kind
  );

  update public.player_company_dividends
  set declared_share_multiplier = p_share_multiplier
  where id = v_row.id
  returning * into v_row;

  insert into public.player_company_dividend_entitlements (
    dividend_id,
    user_id,
    stock_id,
    ticker,
    quantity,
    amount_cents
  )
  with raw_holders as (
    select
      saves.user_id,
      sum(
        case
          when coalesce(holding ->> 'quantityExact', holding ->> 'quantity', '')
                 ~ '^[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$'
            then coalesce(holding ->> 'quantityExact', holding ->> 'quantity')::numeric
          else 0
        end
        * p_share_multiplier
        / case
            when coalesce(holding ->> 'splitMultiplier', '')
                   ~ '^[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$'
              and (holding ->> 'splitMultiplier')::numeric > 0
              then (holding ->> 'splitMultiplier')::numeric
            else 1
          end
      ) as quantity
    from public.game_saves saves
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(saves.state -> 'holdings') = 'array'
          then saves.state -> 'holdings'
        else '[]'::jsonb
      end
    ) holding
    where lower(coalesce(holding ->> 'stockId', '')) = lower(trim(p_stock_id))
    group by saves.user_id
  ), calculated as (
    select
      user_id,
      quantity,
      round(quantity * p_per_share_cents) as raw_amount
    from raw_holders
    where quantity > 0
  ), totals as (
    select coalesce(sum(raw_amount), 0) as raw_total
    from calculated
  ), capped as (
    select
      calculated.user_id,
      calculated.quantity,
      -- 항상 실보유 비중대로 예산을 비례 분배한다(좌당가는 상쇄).
      case
        when totals.raw_total > 0
          then trunc(calculated.raw_amount * p_total_cents / totals.raw_total)
        else 0
      end as final_amount
    from calculated
    cross join totals
  )
  select
    v_row.id,
    capped.user_id,
    lower(trim(p_stock_id)),
    upper(trim(p_ticker)),
    capped.quantity,
    capped.final_amount
  from capped
  where capped.final_amount > 0;

  return v_row;
end;
$function$;
