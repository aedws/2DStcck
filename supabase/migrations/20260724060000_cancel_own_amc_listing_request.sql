-- 운용사가 자기 유저 ETF의 상장 허가 신청을 직접 취소하거나, 자진 상장폐지 뒤
-- 남은 신청 기록을 삭제할 수 있게 한다.
--   · pending/reviewing(승인 전): 소각분 10%를 제외한 시드 편입액을 환급하고
--     지갑의 펀드·보유 좌를 정리한 뒤 신청을 삭제한다.
--   · shipped/accepted(상장됨→자진 상장폐지 후): 환급 없이 신청 기록만 삭제해
--     상장 신청 재조정이 상폐 펀드를 되살리지 못하게 한다.
-- 반려(rejected) 신청은 기존 recover_rejected_amc_fund 회수 흐름을 쓰며, 이미
-- 회수 기록이 있으면 참조 무결성을 위해 신청을 삭제하지 않고 멱등 성공을 돌려준다.

create or replace function public.cancel_own_amc_listing_request(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_request public.stock_requests%rowtype;
  v_recovery public.amc_rejected_fund_recoveries%rowtype;
  v_payload jsonb;
  v_fund_id text;
  v_ticker text;
  v_seed numeric;
  v_refund numeric := 0;
  v_do_refund boolean := false;
  v_state jsonb;
  v_cash numeric;
  v_funds jsonb;
  v_holdings jsonb;
  v_payments jsonb;
  v_trades jsonb;
  v_now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select *
  into v_request
  from public.stock_requests
  where id = p_request_id and user_id = v_uid
  for update;
  if not found then
    -- 이미 삭제됐거나 타인 신청 — 멱등 성공.
    return jsonb_build_object(
      'success', true, 'alreadyRemoved', true, 'refunded', false, 'refundCents', 0
    );
  end if;

  if not coalesce(v_request.description, '') like '[AMC_ETF_LISTING]%' then
    raise exception 'not_amc_listing_request';
  end if;

  -- 반려 회수 기록이 있으면 신청을 삭제하지 않는다(FK on delete restrict).
  select *
  into v_recovery
  from public.amc_rejected_fund_recoveries
  where request_id = p_request_id;
  if found then
    return jsonb_build_object(
      'success', true, 'alreadyRemoved', true, 'refunded', false, 'refundCents', 0
    );
  end if;

  begin
    v_payload := split_part(v_request.description, E'\n', 2)::jsonb;
  exception when others then
    raise exception 'invalid_amc_request_payload';
  end;
  v_fund_id := nullif(trim(v_payload ->> 'fundId'), '');
  v_ticker := upper(nullif(trim(v_payload ->> 'ticker'), ''));
  if v_fund_id is null then
    raise exception 'invalid_amc_request_payload';
  end if;

  v_seed := case
    when coalesce(v_payload ->> 'seedNavValue', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (v_payload ->> 'seedNavValue')::numeric
    else 0
  end;

  -- 승인 전 신청만 시드를 환급한다. 상장 뒤(shipped/accepted)에는 이미 자진
  -- 상장폐지에서 보유자 환급이 끝났으므로 신청 기록만 삭제한다.
  if v_request.status in ('pending', 'reviewing') and v_seed > 0 then
    v_do_refund := true;
    v_refund := v_seed;
  end if;

  select state
  into v_state
  from public.game_saves
  where user_id = v_uid
  for update;

  if found then
    v_cash := case
      when coalesce(v_state ->> 'cash', '') ~ '^-?[0-9]+([.][0-9]+)?$'
        then (v_state ->> 'cash')::numeric
      else 0
    end;

    -- 지갑의 해당 펀드를 목록에서 제거한다.
    v_funds := coalesce(v_state #> '{assetManager,funds}', '[]'::jsonb);
    select coalesce(jsonb_agg(item), '[]'::jsonb)
    into v_funds
    from jsonb_array_elements(v_funds) item
    where item ->> 'id' <> v_fund_id;

    if v_do_refund then
      -- 창업주 시드 좌를 청산하고 편입액을 환급한다.
      v_holdings := coalesce(v_state -> 'holdings', '[]'::jsonb);
      select coalesce(jsonb_agg(item), '[]'::jsonb)
      into v_holdings
      from jsonb_array_elements(v_holdings) item
      where item ->> 'stockId' <> 'amc:' || v_fund_id;

      v_payments := jsonb_build_array(jsonb_build_object(
          'id', 'amc-cancel-refund-' || p_request_id::text,
          'kind', 'amc_capital',
          'sourceId', v_fund_id,
          'ticker', v_ticker,
          'dueSession', floor(extract(epoch from clock_timestamp()) / 3600)::bigint,
          'amount', v_refund,
          'timestamp', v_now_ms
        )) || coalesce(v_state -> 'cashPayments', '[]'::jsonb);
      v_trades := jsonb_build_array(jsonb_build_object(
          'id', 'amc-cancel-refund-' || p_request_id::text,
          'stockId', 'amc:' || v_fund_id,
          'ticker', v_ticker,
          'type', 'sell',
          'quantity', coalesce((v_payload ->> 'totalShares')::numeric, 0),
          'price', case
            when coalesce((v_payload ->> 'totalShares')::numeric, 0) > 0
              then v_refund / (v_payload ->> 'totalShares')::numeric
            else v_refund
          end,
          'total', v_refund,
          'timestamp', v_now_ms
        )) || coalesce(v_state -> 'trades', '[]'::jsonb);

      v_state := jsonb_set(v_state, '{cash}', to_jsonb(v_cash + v_refund), true);
      v_state := jsonb_set(v_state, '{holdings}', v_holdings, true);
      v_state := jsonb_set(v_state, '{cashPayments}', v_payments, true);
      v_state := jsonb_set(v_state, '{trades}', v_trades, true);
    end if;

    if v_state -> 'assetManager' is not null then
      v_state := jsonb_set(v_state, '{assetManager,funds}', v_funds, true);
      v_state := jsonb_set(
        v_state, '{assetManager,lastActionAt}', to_jsonb(v_now_ms), true
      );
    end if;

    update public.game_saves
    set state = v_state, updated_at = now()
    where user_id = v_uid
    returning state into v_state;
  end if;

  delete from public.stock_requests where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'alreadyRemoved', false,
    'refunded', v_do_refund,
    'refundCents', v_refund,
    'cashAfter', coalesce(v_state -> 'cash', '0'::jsonb)
  );
end;
$$;

revoke all on function public.cancel_own_amc_listing_request(uuid)
  from public, anon;
grant execute on function public.cancel_own_amc_listing_request(uuid)
  to authenticated;
