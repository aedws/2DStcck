-- 유저 ETF 전량 매도(마지막 보유자의 마지막 좌 상환) 허용.
-- 기존에는 total_shares 가 정확히 0 이 되는 매도를 insufficient_shares 로 막아,
-- 사실상 소수 dust 좌가 영원히 안 팔리는 문제가 있었다(monoch 신고). total_shares
-- 가 0 에 도달하는 것을 허용하되, 이후 빈 펀드에서의 0 나눗셈을 막기 위해 NAV·시드
-- 계산의 total_shares 나눗셈에 하한을 둔다. amc_preserve_positive_seed_nav 트리거는
-- total_shares > 0 일 때만 동작하므로 빈 펀드 상태에는 개입하지 않는다.

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
set search_path to 'public'
as $function$
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
  if v_next_shares < 0 then raise exception 'insufficient_shares'; end if;

  v_nav := greatest(1, round(
    v_fund.seed_nav_value * v_factor
    / greatest(v_fund.basket_price_factor::numeric, 0.000000001)
    / greatest(v_fund.total_shares, 0.000001)
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
    + round((v_fund.seed_nav_value / greatest(v_fund.total_shares, 0.000001)) * v_delta);
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
$function$;

revoke all on function public.amc_trade_fund_exact(
  text, text, text, text, text, boolean, text
) from public, anon;
grant execute on function public.amc_trade_fund_exact(
  text, text, text, text, text, boolean, text
) to authenticated;
