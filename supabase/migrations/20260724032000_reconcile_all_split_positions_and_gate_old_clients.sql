-- Reconcile every currently split/merged instrument before rejecting clients
-- that can still stamp a stale position with the latest multiplier.

create temporary table current_split_multiplier (
  stock_id text primary key,
  multiplier numeric not null check (multiplier > 0)
) on commit drop;

insert into current_split_multiplier (stock_id, multiplier) values
  ('aegil-inverse-2x', 0.0625),
  ('aeyvn', 10),
  ('aeyvn-inverse', 0.0625),
  ('aeyvn-inverse-2x', 0.0009765625),
  ('aeyvn-leverage-2x', 0.5),
  ('ba68-inverse', 0.125),
  ('ba68-inverse-2x', 0.0009765625),
  ('ba68-leverage-2x', 0.125),
  ('baabs-inverse', 0.25),
  ('baabs-inverse-2x', 0.0009765625),
  ('baabs-leverage-2x', 0.5),
  ('baair-inverse-2x', 0.25),
  ('bafka-inverse-2x', 0.125),
  ('bafka-leverage-2x', 0.5),
  ('bagdi-inverse', 0.5),
  ('bagdi-inverse-2x', 0.0009765625),
  ('bagdi-leverage-2x', 0.5),
  ('bahbk', 10),
  ('bahbk-inverse-2x', 0.125),
  ('bahina', 10),
  ('bahina-inverse-2x', 0.015625),
  ('bahina-leverage-2x', 0.5),
  ('bahnk-inverse-2x', 0.5),
  ('bahrn-inverse-2x', 0.0625),
  ('bakaya', 10),
  ('bakaya-inverse-2x', 0.25),
  ('bakrr-inverse-2x', 0.03125),
  ('baksm-inverse-2x', 0.125),
  ('baksm-leverage-2x', 0.5),
  ('bamari-inverse-2x', 0.0625),
  ('bamine-inverse', 0.5),
  ('bamine-inverse-2x', 0.001953125),
  ('bamine-leverage-2x', 0.5),
  ('banru-inverse', 0.5),
  ('banru-inverse-2x', 0.0009765625),
  ('banru-leverage-2x', 0.5),
  ('baqqq-inverse-2x', 0.0625),
  ('baridc', 10),
  ('baridc-inverse-2x', 0.5),
  ('basena', 10),
  ('basena-inverse', 0.25),
  ('basena-inverse-2x', 0.0009765625),
  ('basena-leverage-2x', 0.5),
  ('basmr-inverse-2x', 0.5),
  ('baspy-inverse-2x', 0.5),
  ('baszm-inverse-2x', 0.03125),
  ('baszm-leverage-2x', 0.5),
  ('batrg-inverse', 0.25),
  ('batrg-inverse-2x', 0.0009765625),
  ('batrg-leverage-2x', 0.5),
  ('baui-inverse-2x', 0.03125),
  ('baui-leverage-2x', 0.5),
  ('bavts', 10),
  ('bavts-inverse-2x', 0.015625),
  ('bavts-leverage-2x', 0.5),
  ('dante', 10),
  ('ersua-inverse-2x', 0.5),
  ('gsck', 10),
  ('nagusa-inverse-2x', 0.5),
  ('nkccl', 10),
  ('nkccl-inverse', 0.125),
  ('nkccl-inverse-2x', 0.0009765625),
  ('nkccl-leverage-2x', 0.5),
  ('nkexa-inverse', 0.25),
  ('nkexa-inverse-2x', 0.0009765625),
  ('nkexa-leverage-2x', 0.5),
  ('nkltr-inverse-2x', 0.125),
  ('nkmna', 10),
  ('nkmna-inverse-2x', 0.015625),
  ('nkmna-leverage-2x', 0.5),
  ('nkneo-inverse-2x', 0.0625),
  ('nkvol-inverse', 0.5),
  ('nkvol-inverse-2x', 0.0009765625),
  ('pmcx-inverse-2x', 0.25),
  ('semix-inverse-2x', 0.03125),
  ('udnge-inverse-2x', 0.5),
  ('vnasfut-inverse-2x', 0.25),
  ('vnsi2', 0.5),
  ('wwcam-inverse-2x', 0.03125),
  ('wwcam-leverage-2x', 0.5),
  ('wwchl-inverse-2x', 0.0625),
  ('wwjin-inverse-2x', 0.0625),
  ('wwjyn-inverse-2x', 0.03125),
  ('wwlcl-inverse-2x', 0.125),
  ('wwlne-inverse', 0.5),
  ('wwlne-inverse-2x', 0.001953125),
  ('wwlne-leverage-2x', 0.5),
  ('wwmne-inverse', 0.125),
  ('wwmne-inverse-2x', 0.0009765625),
  ('wwmne-leverage-2x', 0.125),
  ('wwxly-inverse', 0.5),
  ('wwxly-inverse-2x', 0.001953125),
  ('wwxly-leverage-2x', 0.5),
  ('yakumo-inverse', 0.00390625),
  ('yakumo-inverse-2x', 0.0009765625),
  ('yakumo-leverage-2x', 0.5),
  ('yisang-leverage-2x', 0.5);

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
      left join current_split_multiplier as target
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
      left join current_split_multiplier as target
        on target.stock_id = position.item ->> 'stockId'
      cross join lateral (
        select coalesce(
          (position.item ->> 'splitMultiplier')::numeric,
          1
        ) as multiplier
      ) as applied
    ), '[]'::jsonb) as shorts,
    coalesce((
      select jsonb_agg(
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
        end
        order by pending.ordinal
      )
      from jsonb_array_elements(
        coalesce(saves.state -> 'openOrders', '[]'::jsonb)
      ) with ordinality as pending(item, ordinal)
      left join current_split_multiplier as target
        on target.stock_id = pending.item ->> 'stockId'
      cross join lateral (
        select coalesce(
          (pending.item ->> 'splitMultiplier')::numeric,
          1
        ) as multiplier
      ) as applied
    ), '[]'::jsonb) as open_orders
  from public.game_saves as saves
  where exists (
    select 1
    from jsonb_array_elements(
      coalesce(saves.state -> 'holdings', '[]'::jsonb)
      || coalesce(saves.state -> 'shorts', '[]'::jsonb)
      || coalesce(saves.state -> 'openOrders', '[]'::jsonb)
    ) as position(item)
    join current_split_multiplier as target
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

create or replace function public.save_game_save_cas(
  p_state jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current_revision bigint;
  v_saved_revision bigint;
  v_updated_at timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid_state';
  end if;
  if coalesce((p_state ->> 'splitSettlementVersion')::integer, 0) < 1 then
    raise exception 'outdated_split_settlement_client';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid_expected_revision';
  end if;

  select wallet_revision
  into v_current_revision
  from public.game_saves
  where user_id = v_uid
  for update;

  if not found then
    if p_expected_revision <> 0 then
      insert into public.game_save_conflicts (
        user_id, expected_revision, actual_revision
      ) values (v_uid, p_expected_revision, 0);
      return jsonb_build_object(
        'saved', false,
        'conflict', true,
        'revision', 0
      );
    end if;

    insert into public.game_saves (
      user_id, state, wallet_revision, updated_at
    ) values (
      v_uid, p_state, 1, now()
    )
    returning wallet_revision, updated_at
    into v_saved_revision, v_updated_at;

    return jsonb_build_object(
      'saved', true,
      'conflict', false,
      'revision', v_saved_revision,
      'updatedAt', v_updated_at
    );
  end if;

  if v_current_revision <> p_expected_revision then
    insert into public.game_save_conflicts (
      user_id, expected_revision, actual_revision
    ) values (v_uid, p_expected_revision, v_current_revision);
    return jsonb_build_object(
      'saved', false,
      'conflict', true,
      'revision', v_current_revision
    );
  end if;

  update public.game_saves
  set state = p_state,
      wallet_revision = wallet_revision + 1,
      updated_at = now()
  where user_id = v_uid
    and wallet_revision = p_expected_revision
  returning wallet_revision, updated_at
  into v_saved_revision, v_updated_at;

  if not found then
    select wallet_revision into v_current_revision
    from public.game_saves
    where user_id = v_uid;
    insert into public.game_save_conflicts (
      user_id, expected_revision, actual_revision
    ) values (v_uid, p_expected_revision, coalesce(v_current_revision, 0));
    return jsonb_build_object(
      'saved', false,
      'conflict', true,
      'revision', coalesce(v_current_revision, 0)
    );
  end if;

  return jsonb_build_object(
    'saved', true,
    'conflict', false,
    'revision', v_saved_revision,
    'updatedAt', v_updated_at
  );
end;
$$;

revoke all on function public.save_game_save_cas(jsonb, bigint)
  from public, anon;
grant execute on function public.save_game_save_cas(jsonb, bigint)
  to authenticated;
