-- A wallet-local marker can be omitted by an older client. Make the server's
-- settlement ledger authoritative so a stale LCID holding can never be paid twice.

begin;

create table if not exists public.player_company_delisting_settlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  stock_id text not null,
  settlement_marker text not null,
  quantity numeric not null check (quantity >= 0),
  amount_cents numeric not null check (amount_cents >= 0),
  cash_before_cents numeric,
  settled_at timestamptz not null default now(),
  primary key (user_id, stock_id)
);
alter table public.player_company_delisting_settlements enable row level security;
revoke all on public.player_company_delisting_settlements
  from public, anon, authenticated;

insert into public.player_company_delisting_settlements (
  user_id,
  stock_id,
  settlement_marker,
  quantity,
  amount_cents,
  cash_before_cents,
  settled_at
)
select
  backup.user_id,
  'lcid',
  'lcid-safe-delisting-20260809',
  sum(coalesce(
    nullif(holding ->> 'quantityExact', ''),
    nullif(holding ->> 'quantity', ''),
    '0'
  )::numeric),
  round(sum(coalesce(
    nullif(holding ->> 'quantityExact', ''),
    nullif(holding ->> 'quantity', ''),
    '0'
  )::numeric) * 11900),
  coalesce(backup.state ->> 'cashExact', backup.state ->> 'cash', '0')::numeric,
  now()
from admin_rollback.r20260809_lcid_wallets backup
cross join lateral jsonb_array_elements(coalesce(backup.state -> 'holdings', '[]'::jsonb)) holding
where holding ->> 'stockId' = 'lcid'
group by backup.user_id, backup.state
on conflict (user_id, stock_id) do nothing;

create or replace function public.enforce_safe_player_company_delistings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marker constant text := 'lcid-safe-delisting-20260809';
  v_ids constant text[] := array[
    'lcid', 'lcid-inverse', 'lcid-inverse-2x', 'lcid-leverage-2x'
  ];
  v_holding jsonb;
  v_stock_id text;
  v_quantity numeric;
  v_total_quantity numeric := 0;
  v_price numeric;
  v_total numeric;
  v_settlement numeric := 0;
  v_cash_before numeric;
  v_cash numeric;
  v_applied jsonb := coalesce(new.state -> 'appliedDelistingIds', '[]'::jsonb);
  v_trades jsonb := coalesce(new.state -> 'trades', '[]'::jsonb);
  v_wallet_applied boolean;
  v_ledger_applied boolean;
begin
  v_wallet_applied := v_applied @> jsonb_build_array(v_marker);
  select exists (
    select 1
    from public.player_company_delisting_settlements settlement
    where settlement.user_id = new.user_id
      and settlement.stock_id = 'lcid'
  ) into v_ledger_applied;

  for v_holding in
    select value
    from jsonb_array_elements(coalesce(new.state -> 'holdings', '[]'::jsonb))
    where value ->> 'stockId' = any(v_ids)
  loop
    v_stock_id := v_holding ->> 'stockId';
    if coalesce(v_holding ->> 'quantityExact', v_holding ->> 'quantity', '0')
       !~ '^([0-9]+)(\.[0-9]{1,6})?$'
    then
      raise exception 'invalid_delisting_quantity';
    end if;
    v_quantity := coalesce(
      nullif(v_holding ->> 'quantityExact', ''),
      nullif(v_holding ->> 'quantity', ''),
      '0'
    )::numeric;
    v_price := case v_stock_id
      when 'lcid' then 11900
      when 'lcid-inverse' then 1448
      when 'lcid-inverse-2x' then 1607
      when 'lcid-leverage-2x' then 2251
    end;
    v_total := round(greatest(0, v_quantity) * v_price);
    v_total_quantity := v_total_quantity + greatest(0, v_quantity);
    v_settlement := v_settlement + v_total;

    if not v_wallet_applied and not v_ledger_applied then
      v_trades := jsonb_build_array(jsonb_build_object(
        'id', 'safe-delist-' || v_stock_id || '-1786233600000',
        'stockId', v_stock_id,
        'ticker', upper(replace(v_stock_id, 'lcid', 'LCID')),
        'type', 'sell',
        'quantity', v_quantity,
        'quantityExact', v_quantity::text,
        'price', v_price,
        'total', v_total,
        'totalExact', v_total::text,
        'timestamp', 1786233600000
      )) || v_trades;
    end if;
  end loop;

  if v_settlement <= 0 then
    return new;
  end if;

  if coalesce(new.state ->> 'cashExact', new.state ->> 'cash', '0')
     !~ '^-?([0-9]+)(\.[0-9]+)?$'
  then
    raise exception 'invalid_delisting_cash';
  end if;
  v_cash_before := coalesce(
    new.state ->> 'cashExact', new.state ->> 'cash', '0'
  )::numeric;

  if not v_wallet_applied and not v_ledger_applied then
    v_cash := v_cash_before + v_settlement;
    new.state := jsonb_set(new.state, '{cashExact}', to_jsonb(v_cash::text), true);
    new.state := jsonb_set(new.state, '{cash}', to_jsonb(v_cash), true);
    new.state := jsonb_set(new.state, '{trades}', v_trades, true);
  end if;

  insert into public.player_company_delisting_settlements (
    user_id, stock_id, settlement_marker, quantity, amount_cents,
    cash_before_cents, settled_at
  )
  values (
    new.user_id, 'lcid', v_marker, v_total_quantity, v_settlement,
    v_cash_before, now()
  )
  on conflict (user_id, stock_id) do nothing;

  if not v_wallet_applied then
    new.state := jsonb_set(
      new.state,
      '{appliedDelistingIds}',
      v_applied || jsonb_build_array(v_marker),
      true
    );
  end if;

  new.state := jsonb_set(
    new.state,
    '{holdings}',
    coalesce((
      select jsonb_agg(value)
      from jsonb_array_elements(coalesce(new.state -> 'holdings', '[]'::jsonb))
      where value ->> 'stockId' <> all(v_ids)
    ), '[]'::jsonb),
    true
  );
  new.state := jsonb_set(
    new.state,
    '{openOrders}',
    coalesce((
      select jsonb_agg(value)
      from jsonb_array_elements(coalesce(new.state -> 'openOrders', '[]'::jsonb))
      where value ->> 'stockId' <> all(v_ids)
    ), '[]'::jsonb),
    true
  );
  new.state := jsonb_set(
    new.state,
    '{recurringInvestments}',
    coalesce((
      select jsonb_agg(value)
      from jsonb_array_elements(coalesce(new.state -> 'recurringInvestments', '[]'::jsonb))
      where value ->> 'stockId' <> all(v_ids)
    ), '[]'::jsonb),
    true
  );
  return new;
end;
$$;

do $$
begin
  if (select count(*) from public.player_company_delisting_settlements
      where stock_id = 'lcid') <> 2
  then
    raise exception 'lcid_settlement_ledger_backfill_failed';
  end if;
end;
$$;

commit;
