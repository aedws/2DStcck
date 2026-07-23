-- Ship the account safety and option-visibility feedback update.
-- Dividend cash itself is authoritative in amc_fund_events/payments/accounts;
-- the unique event key already prevents a server event from being credited twice.

update public.feedback
set status = 'done',
    admin_note =
      '종목 차트 오른쪽 ‘내 투자’ 계좌 영역에 보유 옵션을 함께 표시합니다. 종목명·콜/풋·매수/발행·행사가·계약 수·현재 마크·평가액·평가손익과 0DTE 여부를 바로 확인하고 해당 종목 옵션 화면으로 이동할 수 있습니다.',
    updated_at = now()
where id = 'fe51f0ae-be1d-4b3b-8e9a-8ddf4b62fae4'::uuid;

-- Old clients could append the same dividend-history session locally while the
-- listed-fund server ledger settled it. Keep one canonical history point per
-- fund/session for chart and total-return display. This does not issue or claw
-- back cash; the payment ledger remains the sole cash authority.
with normalized as (
  select
    funds.id,
    coalesce(
      (
        select jsonb_agg(entry.value order by entry.session)
        from (
          select distinct on ((value ->> 'session')::bigint)
            value,
            (value ->> 'session')::bigint as session
          from jsonb_array_elements(
            coalesce(funds.dividend_history, '[]'::jsonb)
          ) as rows(value)
          where coalesce(value ->> 'session', '') ~ '^[0-9]+$'
          order by
            (value ->> 'session')::bigint,
            coalesce((value ->> 'total')::numeric, 0) desc
        ) as entry
      ),
      '[]'::jsonb
    ) as dividend_history
  from public.amc_listed_funds as funds
)
update public.amc_listed_funds as funds
set dividend_history = normalized.dividend_history,
    updated_at = now()
from normalized
where funds.id = normalized.id
  and funds.dividend_history is distinct from normalized.dividend_history;
