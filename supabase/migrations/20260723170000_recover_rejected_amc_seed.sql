-- 반려된 유저 ETF는 최초 시드의 소각분(10%)을 제외한 NAV 편입액을
-- 한 번만 회수하고 지갑의 펀드·보유 좌를 정리할 수 있다.
create table if not exists public.amc_rejected_fund_recoveries (
  request_id uuid primary key references public.stock_requests(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  fund_id text not null,
  refund_cents numeric not null check (refund_cents >= 0),
  created_at timestamptz not null default now()
);

alter table public.amc_rejected_fund_recoveries enable row level security;
revoke all on public.amc_rejected_fund_recoveries from public, anon, authenticated;
grant select on public.amc_rejected_fund_recoveries to authenticated;

drop policy if exists "amc_rejected_recoveries_select_own"
  on public.amc_rejected_fund_recoveries;
create policy "amc_rejected_recoveries_select_own"
  on public.amc_rejected_fund_recoveries
  for select to authenticated
  using (user_id = auth.uid());

create or replace function public.recover_rejected_amc_fund(
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
  v_existing public.amc_rejected_fund_recoveries%rowtype;
  v_payload jsonb;
  v_fund_id text;
  v_ticker text;
  v_refund numeric;
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
  if not found then raise exception 'request_not_found'; end if;

  select *
  into v_existing
  from public.amc_rejected_fund_recoveries
  where request_id = p_request_id;
  if found then
    select state into v_state
    from public.game_saves
    where user_id = v_uid;
    return jsonb_build_object(
      'success', true,
      'alreadyRecovered', true,
      'refundCents', v_existing.refund_cents,
      'cashAfter', coalesce(v_state -> 'cash', '0'::jsonb)
    );
  end if;

  if v_request.status <> 'rejected'
     or not coalesce(v_request.description, '') like '[AMC_ETF_LISTING]%' then
    raise exception 'request_not_rejected_amc';
  end if;

  begin
    v_payload := split_part(v_request.description, E'\n', 2)::jsonb;
  exception when others then
    raise exception 'invalid_amc_request_payload';
  end;
  v_fund_id := nullif(trim(v_payload ->> 'fundId'), '');
  v_ticker := upper(nullif(trim(v_payload ->> 'ticker'), ''));
  v_refund := case
    when coalesce(v_payload ->> 'seedNavValue', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (v_payload ->> 'seedNavValue')::numeric
    else 0
  end;
  if v_fund_id is null or v_refund <= 0 then
    raise exception 'invalid_amc_recovery_amount';
  end if;

  select state
  into v_state
  from public.game_saves
  where user_id = v_uid
  for update;
  if not found then raise exception 'save_required'; end if;

  v_cash := case
    when coalesce(v_state ->> 'cash', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      then (v_state ->> 'cash')::numeric
    else 0
  end;
  v_funds := coalesce(v_state #> '{assetManager,funds}', '[]'::jsonb);
  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_funds
  from jsonb_array_elements(v_funds) item
  where item ->> 'id' <> v_fund_id;

  v_holdings := coalesce(v_state -> 'holdings', '[]'::jsonb);
  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_holdings
  from jsonb_array_elements(v_holdings) item
  where item ->> 'stockId' <> 'amc:' || v_fund_id;

  v_payments := jsonb_build_array(jsonb_build_object(
      'id', 'amc-rejected-recovery-' || p_request_id::text,
      'kind', 'amc_capital',
      'sourceId', v_fund_id,
      'ticker', v_ticker,
      'dueSession', floor(extract(epoch from clock_timestamp()) / 3600)::bigint,
      'amount', v_refund,
      'timestamp', v_now_ms
    )) || coalesce(v_state -> 'cashPayments', '[]'::jsonb);
  v_trades := jsonb_build_array(jsonb_build_object(
      'id', 'amc-rejected-recovery-' || p_request_id::text,
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
  if v_state -> 'assetManager' is not null then
    v_state := jsonb_set(v_state, '{assetManager,funds}', v_funds, true);
    v_state := jsonb_set(
      v_state,
      '{assetManager,lastActionAt}',
      to_jsonb(v_now_ms),
      true
    );
  end if;

  insert into public.amc_rejected_fund_recoveries (
    request_id, user_id, fund_id, refund_cents
  ) values (p_request_id, v_uid, v_fund_id, v_refund);

  update public.game_saves
  set state = v_state, updated_at = now()
  where user_id = v_uid
  returning state into v_state;

  return jsonb_build_object(
    'success', true,
    'alreadyRecovered', false,
    'refundCents', v_refund,
    'cashAfter', v_state -> 'cash'
  );
end;
$$;

revoke all on function public.recover_rejected_amc_fund(uuid)
  from public, anon;
grant execute on function public.recover_rejected_amc_fund(uuid)
  to authenticated;

-- BAGDII2 1:2 병합 직후 공매 수량만 구 액면으로 남아 동일 수량 전부가
-- 강제 상환된 계정에는 과다 상환된 절반의 대금을 정확히 복구한다.
insert into public.account_cash_adjustments (
  id, user_id, game_id, amount_cents, reason
)
select
  'leveraged-short-split-liquidation-20260723-luxury',
  user_id,
  game_id,
  966176817926,
  'BAGDII2 병합 시 공매 수량 미정산으로 발생한 과다 강제상환액 복구'
from public.bug_reports
where id = 'bbee9b91-03ea-4f39-b72b-6e44a5dc0573'
on conflict (id) do nothing;

-- 조정 트리거를 즉시 실행해 다음 로그인 전에도 서버 지갑에 반영한다.
update public.game_saves saves
set state = saves.state,
    updated_at = now()
where saves.user_id = (
  select user_id
  from public.bug_reports
  where id = 'bbee9b91-03ea-4f39-b72b-6e44a5dc0573'
);

update public.bug_reports
set status = 'fixed',
    admin_note = case id
      when 'bf14701f-c69b-4efb-b43a-307c7a57a9df'::uuid then
        '상장 전 FAUS·KAMO가 검색 결과에서 등락률을 표시하던 문제를 수정했습니다. 이제 공모가와 상장 예정 상태만 표시하고 IPO 화면으로 이동합니다.'
      when '7521fd61-6113-4ae8-9437-c0968539c5d1'::uuid then
        '신고 시각 전후 강제청산·현금 삭제는 없었고 서버 ETF 원장과 지갑 잔액도 일치했습니다. 과대 표시되던 유저 ETF NAV·액면가 정상화가 자산 급감처럼 보인 경우로 확인해 실제 구성종목 성과 기준 평가로 수정했습니다.'
      when 'bbee9b91-03ea-4f39-b72b-6e44a5dc0573'::uuid then
        'BAGDII2 1:2 병합 때 보유 주식만 정산되고 공매 수량은 그대로 남아 부채가 2배가 된 원인을 확인했습니다. 공매 수량·평단도 액면과 함께 가치 중립적으로 조정하도록 수정하고 과다 강제상환액 966,176,817,926¢를 1회 복구했습니다.'
      when 'ce3dc84b-ca1a-412f-91d1-631738118e32'::uuid then
        '서버 일반 지갑 저장이 신고 6분 전에 멈춘 반면 ETF 청산 원장은 별도로 남은 상태를 확인했습니다. 동시에 실행된 저장이 최신 지갑을 덮지 않도록 쓰기를 순서대로 처리하고 실패 저장을 재시도하도록 보강했습니다. 서버에 도달하지 않은 로컬 거래 수치는 검증할 원장이 없어 임의 복구하지 않았습니다.'
    end,
    updated_at = now()
where id in (
  'bf14701f-c69b-4efb-b43a-307c7a57a9df',
  '7521fd61-6113-4ae8-9437-c0968539c5d1',
  'bbee9b91-03ea-4f39-b72b-6e44a5dc0573',
  'ce3dc84b-ca1a-412f-91d1-631738118e32'
);

update public.feedback
set status = 'done',
    admin_note = '반려 ETF 카드에서 소각분을 제외한 NAV 편입액을 신청별 1회 회수하고, 실패한 펀드와 보유 좌를 목록에서 함께 정리하는 기능을 추가했습니다.',
    updated_at = now()
where id = '3e18d951-769b-4813-8070-5c1dbe7560a6';
