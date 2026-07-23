-- Worker 체크포인트 적용 중 누락된 액면조정을 현재 번들 시장 배수에 맞춘다.
-- 수량×(현재/적용), 평단·지정가÷(현재/적용)로 가치 중립이며 exact 수량은 문자열로 보존한다.

with current_multiplier(stock_id, multiplier) as (
  values
    ('aeyvn', 10::numeric),
    ('bahbk', 10::numeric),
    ('bahina', 10::numeric),
    ('bakaya', 10::numeric),
    ('baridc', 10::numeric),
    ('basena', 10::numeric),
    ('bavts', 10::numeric),
    ('dante', 10::numeric),
    ('gsck', 10::numeric),
    ('nkccl', 10::numeric),
    ('nkmna', 10::numeric),
    ('vnsi2', 0.5::numeric)
),
reconciled as (
  select
    saves.user_id,
    coalesce(
      (
        select jsonb_agg(
          case
            when multiplier.multiplier is null
              or applied.multiplier = multiplier.multiplier
              then position.item
            else position.item || jsonb_build_object(
              'quantity',
                (position.item ->> 'quantity')::numeric
                * multiplier.multiplier / applied.multiplier,
              'quantityExact',
                (
                  coalesce(
                    position.item ->> 'quantityExact',
                    position.item ->> 'quantity'
                  )::numeric
                  * multiplier.multiplier / applied.multiplier
                )::text,
              'averagePrice',
                (position.item ->> 'averagePrice')::numeric
                * applied.multiplier / multiplier.multiplier,
              'splitMultiplier', multiplier.multiplier
            )
          end
          order by position.ordinal
        )
        from jsonb_array_elements(
          coalesce(saves.state -> 'holdings', '[]'::jsonb)
        ) with ordinality as position(item, ordinal)
        left join current_multiplier as multiplier
          on multiplier.stock_id = position.item ->> 'stockId'
        cross join lateral (
          select coalesce(
            (position.item ->> 'splitMultiplier')::numeric,
            1
          ) as multiplier
        ) as applied
      ),
      '[]'::jsonb
    ) as holdings,
    coalesce(
      (
        select jsonb_agg(
          case
            when multiplier.multiplier is null
              or applied.multiplier = multiplier.multiplier
              then position.item
            else position.item || jsonb_build_object(
              'quantity',
                (position.item ->> 'quantity')::numeric
                * multiplier.multiplier / applied.multiplier,
              'quantityExact',
                (
                  coalesce(
                    position.item ->> 'quantityExact',
                    position.item ->> 'quantity'
                  )::numeric
                  * multiplier.multiplier / applied.multiplier
                )::text,
              'averagePrice',
                (position.item ->> 'averagePrice')::numeric
                * applied.multiplier / multiplier.multiplier,
              'splitMultiplier', multiplier.multiplier
            )
          end
          order by position.ordinal
        )
        from jsonb_array_elements(
          coalesce(saves.state -> 'shorts', '[]'::jsonb)
        ) with ordinality as position(item, ordinal)
        left join current_multiplier as multiplier
          on multiplier.stock_id = position.item ->> 'stockId'
        cross join lateral (
          select coalesce(
            (position.item ->> 'splitMultiplier')::numeric,
            1
          ) as multiplier
        ) as applied
      ),
      '[]'::jsonb
    ) as shorts,
    coalesce(
      (
        select jsonb_agg(
          case
            when multiplier.multiplier is null
              or applied.multiplier = multiplier.multiplier
              then pending.item
            else pending.item || jsonb_build_object(
              'price',
                greatest(
                  1,
                  round(
                    (pending.item ->> 'price')::numeric
                    * applied.multiplier / multiplier.multiplier
                  )
                ),
              'quantity',
                round(
                  (pending.item ->> 'quantity')::numeric
                  * multiplier.multiplier / applied.multiplier,
                  6
                ),
              'splitMultiplier', multiplier.multiplier
            )
          end
          order by pending.ordinal
        )
        from jsonb_array_elements(
          coalesce(saves.state -> 'openOrders', '[]'::jsonb)
        ) with ordinality as pending(item, ordinal)
        left join current_multiplier as multiplier
          on multiplier.stock_id = pending.item ->> 'stockId'
        cross join lateral (
          select coalesce(
            (pending.item ->> 'splitMultiplier')::numeric,
            1
          ) as multiplier
        ) as applied
      ),
      '[]'::jsonb
    ) as open_orders
  from public.game_saves as saves
  where exists (
    select 1
    from jsonb_array_elements(
      coalesce(saves.state -> 'holdings', '[]'::jsonb)
      || coalesce(saves.state -> 'shorts', '[]'::jsonb)
      || coalesce(saves.state -> 'openOrders', '[]'::jsonb)
    ) as position(item)
    join current_multiplier as multiplier
      on multiplier.stock_id = position.item ->> 'stockId'
    where coalesce(
      (position.item ->> 'splitMultiplier')::numeric,
      1
    ) <> multiplier.multiplier
  )
),
updated_saves as (
  update public.game_saves as saves
  set
    state = jsonb_set(
      jsonb_set(
        jsonb_set(saves.state, '{holdings}', reconciled.holdings, true),
        '{shorts}', reconciled.shorts, true
      ),
      '{openOrders}', reconciled.open_orders, true
    ),
    wallet_revision = saves.wallet_revision + 1,
    updated_at = now()
  from reconciled
  where saves.user_id = reconciled.user_id
  returning saves.user_id
)
update public.bug_reports
set
  status = 'fixed',
  admin_note =
    '장기 공백을 Web Worker가 한 번에 따라잡아 시장 체크포인트를 적용할 때 가격·액면배수만 교체하고, 목표 틱 차이가 0이면 보유·공매·지정가 주문의 좌수 정산이 실행되지 않던 원인을 확인했습니다. 체크포인트 적용과 같은 상태 갱신에서 수량과 평단을 원자적으로 정산하도록 수정했으며, 전수 점검에서 확인한 25계정의 보유 42건·공매 2건·지정가 1건도 현재 배수에 맞춰 가치 중립 복구했습니다.',
  updated_at = now()
where id = '3d97aebb-20f2-44c0-92d4-141320053c13'::uuid
  and status in ('open', 'investigating');
