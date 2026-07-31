-- 플레이어 회사 배당 재원 차감을 일반 회사 출자와 분리해 현금 지급 내역에 기록한다.
-- 기존 5인자 RPC는 구버전 클라이언트를 위해 유지하고, v2가 같은 원자적 RPC를
-- 호출한 뒤 방금 생성된 지급 항목의 유형만 특별배당/정기배당으로 구체화한다.

create or replace function public.declare_player_company_dividend_v2(
  p_ticker text,
  p_stock_id text,
  p_per_share_cents numeric,
  p_total_cents numeric,
  p_dividend_session bigint,
  p_dividend_kind text
)
returns public.player_company_dividends
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.player_company_dividends;
  v_payment_id text;
  v_payment_kind text;
begin
  v_payment_kind := case lower(trim(coalesce(p_dividend_kind, '')))
    when 'special' then 'company_special_dividend'
    when 'regular' then 'company_regular_dividend'
    else null
  end;
  if v_payment_kind is null then raise exception 'invalid_dividend_kind'; end if;

  v_row := public.declare_player_company_dividend(
    p_ticker,
    p_stock_id,
    p_per_share_cents,
    p_total_cents,
    p_dividend_session
  );
  v_payment_id := 'pcdiv-burn-' || v_row.id::text;

  update public.game_saves saves
  set state = jsonb_set(
    saves.state,
    '{cashPayments}',
    coalesce(
      (
        select jsonb_agg(
          case
            when item.payment ->> 'id' = v_payment_id
              then jsonb_set(
                item.payment,
                '{kind}',
                to_jsonb(v_payment_kind),
                true
              )
            else item.payment
          end
          order by item.ordinality
        )
        from jsonb_array_elements(
          coalesce(saves.state -> 'cashPayments', '[]'::jsonb)
        ) with ordinality as item(payment, ordinality)
      ),
      '[]'::jsonb
    ),
    true
  )
  where saves.user_id = v_user;

  return v_row;
end;
$$;

revoke all on function public.declare_player_company_dividend_v2(
  text, text, numeric, numeric, bigint, text
) from public, anon;
grant execute on function public.declare_player_company_dividend_v2(
  text, text, numeric, numeric, bigint, text
) to authenticated;

update public.bug_reports
set
  status = 'fixed',
  admin_note = '주문내역의 현금 지급 표에 특별배당 재원과 정기배당 재원을 구분해 기록하도록 수정했습니다. 초고액 배당 차감은 축약값 아래에 정확한 전체 금액도 함께 표시하며, 기존 배당 차감 기록은 회사 배당 재원으로 식별됩니다.',
  updated_at = now()
where lower(game_id) = 'gudokza111'
  and title ilike '%배당%현금%'
  and status in ('open', 'investigating');
