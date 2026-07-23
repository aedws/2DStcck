-- 유저 ETF 서버 원장의 금액·좌수를 bigint/double precision에서 numeric으로
-- 승격하고, 모든 큰 수는 JSON 문자열로 왕복한다.

drop trigger if exists amc_preserve_positive_seed_nav
  on public.amc_listed_funds;

alter table public.amc_fund_positions
  drop constraint if exists amc_fund_positions_quantity_check;
alter table public.amc_fund_trades
  drop constraint if exists amc_fund_trades_nav_per_share_check,
  drop constraint if exists amc_fund_trades_total_check,
  drop constraint if exists amc_fund_trades_position_after_check,
  drop constraint if exists amc_fund_trades_fund_total_shares_after_check;
alter table public.amc_fund_events
  drop constraint if exists amc_fund_events_per_share_check,
  drop constraint if exists amc_fund_events_total_check;
alter table public.amc_fund_payments
  drop constraint if exists amc_fund_payments_amount_check;
alter table public.amc_listed_funds
  drop constraint if exists amc_listed_funds_total_shares_check,
  drop constraint if exists amc_listed_funds_seed_nav_value_check,
  drop constraint if exists amc_listed_funds_cumulative_fees_paid_check,
  drop constraint if exists amc_listed_funds_cumulative_dividends_paid_check;

alter table public.amc_accounts
  alter column balance_delta type numeric using balance_delta::numeric;
alter table public.amc_fund_positions
  alter column quantity type numeric using quantity::numeric,
  add constraint amc_fund_positions_quantity_check check (quantity >= 0);
alter table public.amc_fund_trades
  alter column delta_shares type numeric using delta_shares::numeric,
  alter column nav_per_share type numeric using nav_per_share::numeric,
  alter column total type numeric using total::numeric,
  alter column cash_delta type numeric using cash_delta::numeric,
  alter column position_after type numeric using position_after::numeric,
  alter column fund_total_shares_after type numeric using fund_total_shares_after::numeric,
  alter column ledger_balance_after type numeric using ledger_balance_after::numeric,
  add constraint amc_fund_trades_nav_per_share_check check (nav_per_share > 0),
  add constraint amc_fund_trades_total_check check (total > 0),
  add constraint amc_fund_trades_position_after_check check (position_after >= 0),
  add constraint amc_fund_trades_fund_total_shares_after_check check (fund_total_shares_after > 0);
alter table public.amc_fund_events
  alter column per_share type numeric using per_share::numeric,
  alter column total type numeric using total::numeric,
  add constraint amc_fund_events_per_share_check check (per_share >= 0),
  add constraint amc_fund_events_total_check check (total >= 0);
alter table public.amc_fund_payments
  alter column quantity type numeric using quantity::numeric,
  alter column amount type numeric using amount::numeric,
  add constraint amc_fund_payments_amount_check check (amount >= 0);
alter table public.amc_listed_funds
  alter column total_shares type numeric using total_shares::numeric,
  alter column seed_nav_value type numeric using seed_nav_value::numeric,
  alter column cumulative_fees_paid type numeric using cumulative_fees_paid::numeric,
  alter column cumulative_dividends_paid type numeric using cumulative_dividends_paid::numeric,
  alter column last_nav_per_share type numeric using last_nav_per_share::numeric,
  add constraint amc_listed_funds_total_shares_check check (total_shares > 0),
  add constraint amc_listed_funds_seed_nav_value_check check (seed_nav_value >= 0),
  add constraint amc_listed_funds_cumulative_fees_paid_check check (cumulative_fees_paid >= 0),
  add constraint amc_listed_funds_cumulative_dividends_paid_check check (cumulative_dividends_paid >= 0);

create or replace function public.amc_get_my_ledger_exact()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'balanceExact', coalesce(a.balance_delta, 0)::text,
    'revision', coalesce(a.revision, 0),
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fundId', p.fund_id,
        'quantityExact', p.quantity::text
      ) order by p.updated_at desc)
      from public.amc_fund_positions p
      where p.user_id = auth.uid() and p.quantity > 0
    ), '[]'::jsonb),
    'trades', coalesce((
      select jsonb_agg(item.value order by item.created_at desc)
      from (
        select jsonb_build_object(
          'id', t.client_order_id,
          'fundId', t.fund_id,
          'deltaExact', t.delta_shares::text,
          'navPerShare', t.nav_per_share::text,
          'totalExact', t.total::text,
          'createdAt', t.created_at
        ) as value, t.created_at
        from public.amc_fund_trades t
        where t.user_id = auth.uid()
        order by t.created_at desc
        limit 200
      ) item
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(item.value order by item.created_at desc)
      from (
        select jsonb_build_object(
          'eventId', e.id,
          'fundId', e.fund_id,
          'ticker', e.ticker,
          'kind', e.kind,
          'dueSession', e.due_session,
          'quantityExact', p.quantity::text,
          'perShare', e.per_share::text,
          'amountExact', p.amount::text,
          'createdAt', p.created_at
        ) as value, p.created_at
        from public.amc_fund_payments p
        join public.amc_fund_events e on e.id = p.event_id
        where p.user_id = auth.uid()
        order by p.created_at desc
        limit 200
      ) item
    ), '[]'::jsonb)
  )
  from (select auth.uid() as user_id) u
  left join public.amc_accounts a on a.user_id = u.user_id;
$$;

revoke all on function public.amc_get_my_ledger_exact() from public, anon;
grant execute on function public.amc_get_my_ledger_exact() to authenticated;

create or replace function public.amc_trade_fund_exact(
  p_fund_id text,
  p_delta text,
  p_expected_position text,
  p_price_factor text,
  p_client_order_id text,
  p_allow_margin boolean default false,
  p_margin_buying_power text default '0'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game_id text;
  v_fund public.amc_listed_funds;
  v_position public.amc_fund_positions;
  v_account public.amc_accounts;
  v_existing public.amc_fund_trades;
  v_save jsonb;
  v_delta numeric;
  v_expected numeric;
  v_factor numeric;
  v_cash numeric;
  v_applied numeric;
  v_effective_cash numeric;
  v_nav numeric;
  v_total numeric;
  v_cash_delta numeric;
  v_next_position numeric;
  v_next_shares numeric;
  v_next_seed numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_delta !~ '^-?[0-9]+([.][0-9]{1,6})?$'
     or p_expected_position !~ '^[0-9]+([.][0-9]{1,6})?$'
     or p_price_factor !~ '^[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$'
     or p_margin_buying_power !~ '^[0-9]+$' then
    raise exception 'invalid_exact_number';
  end if;
  if p_client_order_id is null or char_length(p_client_order_id) < 8
     or char_length(p_client_order_id) > 100 then raise exception 'invalid_order_id'; end if;
  v_delta := p_delta::numeric;
  v_expected := p_expected_position::numeric;
  v_factor := p_price_factor::numeric;
  if v_delta = 0 then raise exception 'invalid_delta'; end if;
  if v_factor <= 0 then raise exception 'invalid_price_factor'; end if;

  select * into v_existing from public.amc_fund_trades
  where user_id = v_uid and client_order_id = p_client_order_id;
  if found then
    select * into v_fund from public.amc_listed_funds where id = v_existing.fund_id;
    return jsonb_build_object(
      'fund', to_jsonb(v_fund),
      'positionExact', v_existing.position_after::text,
      'navPerShare', v_existing.nav_per_share::text,
      'totalExact', v_existing.total::text,
      'cashDeltaExact', v_existing.cash_delta::text,
      'ledgerBalanceExact', v_existing.ledger_balance_after::text,
      'ledgerRevision', v_existing.ledger_revision_after,
      'replayed', true
    );
  end if;

  select * into v_fund from public.amc_listed_funds
  where id = p_fund_id for update;
  if not found then raise exception 'fund_not_found'; end if;
  if v_fund.status = 'delisted' then raise exception 'fund_delisted'; end if;
  if v_fund.status = 'grace' and v_delta > 0 then raise exception 'fund_grace_no_buy'; end if;

  select coalesce(raw_user_meta_data ->> 'game_id', '') into v_game_id
  from auth.users where id = v_uid;
  insert into public.amc_fund_positions (fund_id, user_id, game_id, quantity)
  values (p_fund_id, v_uid, v_game_id, 0)
  on conflict (fund_id, user_id) do nothing;
  select * into v_position from public.amc_fund_positions
  where fund_id = p_fund_id and user_id = v_uid for update;
  if v_position.quantity <> v_expected then raise exception 'position_conflict'; end if;
  v_next_position := v_position.quantity + v_delta;
  if v_next_position < 0 then raise exception 'insufficient_position'; end if;
  v_next_shares := v_fund.total_shares + v_delta;
  if v_next_shares <= 0 then raise exception 'insufficient_shares'; end if;

  v_nav := greatest(1, round(
    v_fund.seed_nav_value * v_factor
    / greatest(v_fund.basket_price_factor::numeric, 0.000000001)
    / v_fund.total_shares
  ));
  v_total := round(v_nav * abs(v_delta));
  if v_total <= 0 then raise exception 'trade_too_small'; end if;
  v_cash_delta := case when v_delta > 0 then -v_total else v_total end;

  insert into public.amc_accounts (user_id) values (v_uid)
  on conflict (user_id) do nothing;
  select * into v_account from public.amc_accounts where user_id = v_uid for update;
  select state into v_save from public.game_saves where user_id = v_uid for update;
  if not found then raise exception 'save_required'; end if;
  v_cash := case
    when coalesce(v_save ->> 'cashExact', v_save ->> 'cash', '') ~ '^-?[0-9]+$'
      then coalesce(v_save ->> 'cashExact', v_save ->> 'cash')::numeric
    else 0 end;
  v_applied := case
    when coalesce(v_save ->> 'amcLedgerBalanceExact', v_save ->> 'amcLedgerBalance', '') ~ '^-?[0-9]+$'
      then coalesce(v_save ->> 'amcLedgerBalanceExact', v_save ->> 'amcLedgerBalance')::numeric
    else 0 end;
  v_effective_cash := v_cash + v_account.balance_delta - v_applied;
  if v_delta > 0 and coalesce(p_allow_margin, false) then
    if coalesce(v_save ->> 'marginEnabled', 'false') <> 'true' then
      raise exception 'margin_disabled';
    end if;
    v_effective_cash := p_margin_buying_power::numeric;
  end if;
  if v_delta > 0 and v_effective_cash < v_total then
    raise exception 'insufficient_cash';
  end if;

  v_next_seed := v_fund.seed_nav_value
    + round((v_fund.seed_nav_value / v_fund.total_shares) * v_delta);
  if v_next_seed < 0 then raise exception 'insufficient_nav'; end if;

  update public.amc_listed_funds set
    total_shares = v_next_shares,
    seed_nav_value = v_next_seed,
    last_price_factor = v_factor::double precision,
    last_nav_per_share = v_nav,
    updated_at = now()
  where id = p_fund_id returning * into v_fund;
  update public.amc_fund_positions set
    quantity = v_next_position, updated_at = now()
  where fund_id = p_fund_id and user_id = v_uid returning * into v_position;
  update public.amc_accounts set
    balance_delta = balance_delta + v_cash_delta,
    revision = revision + 1,
    updated_at = now()
  where user_id = v_uid returning * into v_account;
  insert into public.amc_fund_trades (
    user_id, client_order_id, fund_id, delta_shares, nav_per_share, total,
    cash_delta, position_after, fund_total_shares_after,
    ledger_balance_after, ledger_revision_after
  ) values (
    v_uid, p_client_order_id, p_fund_id, v_delta, v_nav, v_total,
    v_cash_delta, v_position.quantity, v_fund.total_shares,
    v_account.balance_delta, v_account.revision
  );

  return jsonb_build_object(
    'fund', to_jsonb(v_fund),
    'positionExact', v_position.quantity::text,
    'navPerShare', v_nav::text,
    'totalExact', v_total::text,
    'cashDeltaExact', v_cash_delta::text,
    'ledgerBalanceExact', v_account.balance_delta::text,
    'ledgerRevision', v_account.revision,
    'replayed', false
  );
end;
$$;

revoke all on function public.amc_trade_fund_exact(
  text, text, text, text, text, boolean, text
) from public, anon;
grant execute on function public.amc_trade_fund_exact(
  text, text, text, text, text, boolean, text
) to authenticated;

create or replace function public.amc_preserve_positive_seed_nav()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_factor numeric;
begin
  if new.status <> 'delisted'
     and new.total_shares > 0
     and new.seed_nav_value <= 0 then
    if old.seed_nav_value > 0 and old.total_shares > 0 then
      new.seed_nav_value := greatest(
        1,
        round(old.seed_nav_value * new.total_shares / old.total_shares)
      );
    else
      v_factor := greatest(
        new.last_price_factor::numeric
        / greatest(new.basket_price_factor::numeric, 0.000000001),
        0.000000001
      );
      new.seed_nav_value := greatest(
        1,
        round(
          new.total_shares
          * greatest(new.last_nav_per_share, 1)
          / v_factor
        )
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger amc_preserve_positive_seed_nav
before update of seed_nav_value, total_shares
on public.amc_listed_funds
for each row execute function public.amc_preserve_positive_seed_nav();
