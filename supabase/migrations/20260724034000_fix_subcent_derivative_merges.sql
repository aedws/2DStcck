-- Sub-cent derivative raw prices used to stop at the legacy 1/1024 merge
-- multiplier. Rebase affected wallet positions to the corrected multipliers.

create temporary table corrected_derivative_multiplier (
  stock_id text primary key,
  multiplier numeric not null check (multiplier > 0)
) on commit drop;

insert into corrected_derivative_multiplier (stock_id, multiplier) values
  ('aeyvn-inverse-2x', 2.2737367544323206e-13),
  ('ba68-inverse-2x', 0.0000019073486328125),
  ('baabs-inverse-2x', 0.0000019073486328125),
  ('bakrr-inverse-2x', 5.960464477539063e-8),
  ('bamine-inverse-2x', 7.450580596923828e-9),
  ('banru-inverse-2x', 0.00006103515625),
  ('basena-inverse-2x', 0.00006103515625),
  ('baszm-inverse-2x', 0.0001220703125),
  ('batrg-inverse-2x', 9.313225746154785e-10),
  ('batrg-leverage-2x', 2.384185791015625e-7),
  ('nkccl-inverse-2x', 0.000030517578125),
  ('nkexa-inverse-2x', 9.313225746154785e-10),
  ('nkexa-leverage-2x', 1.1920928955078125e-7),
  ('udnge-inverse-2x', 0.0000019073486328125),
  ('wwlcl-inverse-2x', 5.960464477539063e-8),
  ('wwlne-inverse-2x', 0.00048828125),
  ('wwmne-inverse-2x', 0.000003814697265625),
  ('wwxly-inverse-2x', 2.3283064365386963e-10),
  ('yakumo-inverse-2x', 9.5367431640625e-7),
  ('yisang-inverse-2x', 0.000003814697265625);

with reconciled as (
  select
    saves.user_id,
    coalesce((
      select jsonb_agg(
        case
          when target.multiplier is null or applied.multiplier = target.multiplier
            then position.item
          else position.item || jsonb_build_object(
            'quantity',
              (position.item ->> 'quantity')::numeric
              * target.multiplier / applied.multiplier,
            'quantityExact',
              (
                coalesce(
                  position.item ->> 'quantityExact',
                  position.item ->> 'quantity'
                )::numeric
                * target.multiplier / applied.multiplier
              )::text,
            'averagePrice',
              (position.item ->> 'averagePrice')::numeric
              * applied.multiplier / target.multiplier,
            'splitMultiplier', target.multiplier
          )
        end
        order by position.ordinal
      )
      from jsonb_array_elements(
        coalesce(saves.state -> 'holdings', '[]'::jsonb)
      ) with ordinality as position(item, ordinal)
      left join corrected_derivative_multiplier as target
        on target.stock_id = position.item ->> 'stockId'
      cross join lateral (
        select coalesce(
          (position.item ->> 'splitMultiplier')::numeric,
          1
        ) as multiplier
      ) as applied
    ), '[]'::jsonb) as holdings,
    coalesce((
      select jsonb_agg(
        case
          when target.multiplier is null or applied.multiplier = target.multiplier
            then position.item
          else position.item || jsonb_build_object(
            'quantity',
              (position.item ->> 'quantity')::numeric
              * target.multiplier / applied.multiplier,
            'quantityExact',
              (
                coalesce(
                  position.item ->> 'quantityExact',
                  position.item ->> 'quantity'
                )::numeric
                * target.multiplier / applied.multiplier
              )::text,
            'averagePrice',
              (position.item ->> 'averagePrice')::numeric
              * applied.multiplier / target.multiplier,
            'splitMultiplier', target.multiplier
          )
        end
        order by position.ordinal
      )
      from jsonb_array_elements(
        coalesce(saves.state -> 'shorts', '[]'::jsonb)
      ) with ordinality as position(item, ordinal)
      left join corrected_derivative_multiplier as target
        on target.stock_id = position.item ->> 'stockId'
      cross join lateral (
        select coalesce(
          (position.item ->> 'splitMultiplier')::numeric,
          1
        ) as multiplier
      ) as applied
    ), '[]'::jsonb) as shorts,
    coalesce((
      select jsonb_agg(adjusted.item order by adjusted.ordinal)
      from (
        select
          pending.ordinal,
          case
            when target.multiplier is null or applied.multiplier = target.multiplier
              then pending.item
            else pending.item || jsonb_build_object(
              'price',
                greatest(
                  1,
                  round(
                    (pending.item ->> 'price')::numeric
                    * applied.multiplier / target.multiplier
                  )
                ),
              'quantity',
                round(
                  (pending.item ->> 'quantity')::numeric
                  * target.multiplier / applied.multiplier,
                  6
                ),
              'splitMultiplier', target.multiplier
            )
          end as item,
          case
            when target.multiplier is null or applied.multiplier = target.multiplier
              then (pending.item ->> 'quantity')::numeric
            else round(
              (pending.item ->> 'quantity')::numeric
              * target.multiplier / applied.multiplier,
              6
            )
          end as adjusted_quantity
        from jsonb_array_elements(
          coalesce(saves.state -> 'openOrders', '[]'::jsonb)
        ) with ordinality as pending(item, ordinal)
        left join corrected_derivative_multiplier as target
          on target.stock_id = pending.item ->> 'stockId'
        cross join lateral (
          select coalesce(
            (pending.item ->> 'splitMultiplier')::numeric,
            1
          ) as multiplier
        ) as applied
      ) as adjusted
      where adjusted.adjusted_quantity >= 0.001
    ), '[]'::jsonb) as open_orders
  from public.game_saves as saves
  where exists (
    select 1
    from jsonb_array_elements(
      coalesce(saves.state -> 'holdings', '[]'::jsonb)
      || coalesce(saves.state -> 'shorts', '[]'::jsonb)
      || coalesce(saves.state -> 'openOrders', '[]'::jsonb)
    ) as position(item)
    join corrected_derivative_multiplier as target
      on target.stock_id = position.item ->> 'stockId'
    where coalesce(
      (position.item ->> 'splitMultiplier')::numeric,
      1
    ) <> target.multiplier
  )
)
update public.game_saves as saves
set
  state = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(saves.state, '{holdings}', reconciled.holdings, true),
        '{shorts}', reconciled.shorts, true
      ),
      '{openOrders}', reconciled.open_orders, true
    ),
    '{splitSettlementVersion}', '1'::jsonb, true
  ),
  wallet_revision = saves.wallet_revision + 1,
  updated_at = now()
from reconciled
where saves.user_id = reconciled.user_id;

update public.bug_reports
set
  status = case
    when id = '174eb758-0959-4abe-92d6-6441bce3fea5'::uuid
      then 'duplicate'
    else 'fixed'
  end,
  admin_note =
    '초소형 파생 원시 가격을 1센트로 올려 계산해 병합 배수가 1/1024에서 멈추던 원인을 수정했습니다. 5거래일 쿨타임은 정상 가격 밴드 안에서만 유지하고, $10 미만 또는 $1,000 이상이면 즉시 가치 중립 액면조정을 적용합니다. 신고된 8종목을 포함해 같은 조건의 파생 20종목과 서버 보유·공매·대기 주문을 함께 보정했으며 옵션은 개시 배수 기준 경제가 보정을 유지합니다.',
  updated_at = now()
where id in (
  '174eb758-0959-4abe-92d6-6441bce3fea5'::uuid,
  'd469c269-277d-47b5-99d4-67e2060c5d80'::uuid
)
  and status in ('open', 'investigating');
