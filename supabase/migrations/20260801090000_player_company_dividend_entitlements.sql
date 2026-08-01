-- Freeze player-company dividend ownership at declaration time and settle the
-- resulting entitlement from the server.  A later purchase, sale, or share
-- split must not change the amount that was funded by the founder.

alter table public.player_company_dividends
  add column if not exists declared_share_multiplier numeric not null default 1;

create table if not exists public.player_company_dividend_entitlements (
  id uuid primary key default gen_random_uuid(),
  dividend_id uuid not null references public.player_company_dividends(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stock_id text not null,
  ticker text not null,
  quantity numeric not null check (quantity > 0),
  amount_cents numeric not null check (amount_cents > 0 and trunc(amount_cents) = amount_cents),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (dividend_id, user_id)
);

create index if not exists player_company_dividend_entitlements_user_due_idx
  on public.player_company_dividend_entitlements (user_id, claimed_at, dividend_id);

alter table public.player_company_dividend_entitlements enable row level security;

drop policy if exists player_company_dividend_entitlements_read_own
  on public.player_company_dividend_entitlements;
create policy player_company_dividend_entitlements_read_own
  on public.player_company_dividend_entitlements
  for select to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.player_company_dividend_entitlements
  from anon, authenticated;
grant select on public.player_company_dividend_entitlements to authenticated;

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
as $$
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
      case
        when totals.raw_total <= p_total_cents then calculated.raw_amount
        else trunc(calculated.raw_amount * p_total_cents / totals.raw_total)
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
$$;

revoke all on function public.declare_player_company_dividend_v3(
  text, text, numeric, numeric, bigint, text, numeric
) from public, anon;
grant execute on function public.declare_player_company_dividend_v3(
  text, text, numeric, numeric, bigint, text, numeric
) to authenticated;

create or replace function public.claim_player_company_dividends()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_state jsonb;
  v_cash numeric;
  v_now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  v_now_session bigint;
  v_claimed_count integer := 0;
  v_total numeric := 0;
  v_payments jsonb := '[]'::jsonb;
  v_dividend_ids jsonb := '[]'::jsonb;
  v_cash_payments jsonb := '[]'::jsonb;
  v_resolved_ids jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  v_now_session := floor(v_now_ms / 3600000);

  select saves.state
  into v_state
  from public.game_saves saves
  where saves.user_id = v_user
  for update;
  if not found then raise exception 'save_not_found'; end if;

  -- During a rolling deploy an older client can have already paid a newly
  -- snapshotted dividend locally.  Payment evidence, rather than only the
  -- resolved-id flag, closes that entitlement so it cannot be paid twice.
  update public.player_company_dividend_entitlements entitlement
  set claimed_at = clock_timestamp()
  where entitlement.user_id = v_user
    and entitlement.claimed_at is null
    and exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(v_state -> 'cashPayments') = 'array'
            then v_state -> 'cashPayments'
          else '[]'::jsonb
        end
      ) payment
      where payment ->> 'id' = 'pcdiv-pay-' || entitlement.dividend_id::text
    );

  with eligible as (
    select entitlement.*, dividend.per_share_cents, dividend.dividend_session
    from public.player_company_dividend_entitlements entitlement
    join public.player_company_dividends dividend
      on dividend.id = entitlement.dividend_id
    where entitlement.user_id = v_user
      and entitlement.claimed_at is null
      and dividend.dividend_session <= v_now_session
    order by dividend.dividend_session, entitlement.created_at
  )
  select
    count(*)::integer,
    coalesce(sum(amount_cents), 0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', 'pcdiv-pay-' || dividend_id::text,
          'kind', 'dividend',
          'sourceId', stock_id,
          'ticker', ticker,
          'dueSession', dividend_session,
          'quantity', least(quantity, 1e308::numeric)::double precision,
          'quantityExact', quantity::text,
          'amountPerShare', least(per_share_cents, 1e308::numeric)::double precision,
          'amountPerShareExact', per_share_cents::text,
          'amount', least(amount_cents, 1e308::numeric)::double precision,
          'amountExact', amount_cents::text,
          'timestamp', v_now_ms
        )
        order by dividend_session, created_at
      ),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(to_jsonb(dividend_id::text) order by dividend_session, created_at),
      '[]'::jsonb
    )
  into v_claimed_count, v_total, v_payments, v_dividend_ids
  from eligible;

  if v_claimed_count = 0 then
    return jsonb_build_object(
      'claimedCount', 0,
      'totalCentsExact', '0',
      'payments', '[]'::jsonb
    );
  end if;

  v_cash := case
    when coalesce(v_state ->> 'cashExact', v_state ->> 'cash', '') ~ '^-?[0-9]+$'
      then coalesce(v_state ->> 'cashExact', v_state ->> 'cash')::numeric
    else 0
  end;

  select coalesce(jsonb_agg(item.payment order by item.ordinality), '[]'::jsonb)
  into v_cash_payments
  from jsonb_array_elements(
    v_payments || coalesce(v_state -> 'cashPayments', '[]'::jsonb)
  ) with ordinality as item(payment, ordinality)
  where item.ordinality <= 200;

  select coalesce(jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
  into v_resolved_ids
  from jsonb_array_elements(
    v_dividend_ids || coalesce(v_state -> 'resolvedPlayerCompanyDividendIds', '[]'::jsonb)
  ) with ordinality as item(value, ordinality)
  where item.ordinality <= 300;

  v_state := jsonb_set(v_state, '{cash}', to_jsonb(v_cash + v_total), true);
  v_state := jsonb_set(v_state, '{cashExact}', to_jsonb((v_cash + v_total)::text), true);
  v_state := jsonb_set(v_state, '{cashPayments}', v_cash_payments, true);
  v_state := jsonb_set(
    v_state,
    '{resolvedPlayerCompanyDividendIds}',
    v_resolved_ids,
    true
  );

  update public.player_company_dividend_entitlements entitlement
  set claimed_at = clock_timestamp()
  from public.player_company_dividends dividend
  where entitlement.dividend_id = dividend.id
    and entitlement.user_id = v_user
    and entitlement.claimed_at is null
    and dividend.dividend_session <= v_now_session;

  update public.game_saves
  set state = v_state,
      wallet_revision = wallet_revision + 1,
      updated_at = now()
  where user_id = v_user;

  return jsonb_build_object(
    'claimedCount', v_claimed_count,
    'totalCentsExact', v_total::text,
    'payments', v_payments
  );
end;
$$;

revoke all on function public.claim_player_company_dividends()
  from public, anon;
grant execute on function public.claim_player_company_dividends()
  to authenticated;

update public.bug_reports
set
  status = 'fixed',
  admin_note = '확인 결과 유저회사 배당이 선언 시점 주주명부가 아니라 지급 시점의 클라이언트 보유량으로 계산되어, 선언 후 매수분과 일시적으로 비정상 확대된 좌수가 배당에 포함될 수 있었습니다. 배당 선언 순간 서버가 전체 주주의 보유 좌수와 분할 배수를 고정하고, 총 지급액이 창업주가 맡긴 배당 재원을 절대 넘지 않도록 상한을 적용했습니다. 지급일에는 이 확정 원장만 서버에서 1회 지급하므로 이후 매수·매도·액면분할은 해당 배당액을 바꾸지 않습니다. 제보 화면의 과다 계산액은 서버 현금지급 원장에 남지 않아 별도 임의 차감은 하지 않았습니다.',
  updated_at = now()
where id = '73dae587-c948-449c-9d39-ab1671f3c63c'
  and lower(game_id) = 'gudokza111'
  and status in ('open', 'investigating');
