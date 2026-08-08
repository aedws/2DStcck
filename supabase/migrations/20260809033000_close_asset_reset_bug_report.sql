-- Close the final asset-loss report after reconciling it against the audited
-- 18:00 wallet target and the post-recovery save. Keep the pre-update row in a
-- private rollback table so the operator response remains reversible.

begin;

create schema if not exists admin_rollback;
revoke all on schema admin_rollback from public, anon, authenticated;

create table if not exists admin_rollback.r20260809_asset_reset_bug_report as
select *
from public.bug_reports
where id = '07efbb22-ceb2-45f6-a6f4-2d9e72fddc09'::uuid;

alter table admin_rollback.r20260809_asset_reset_bug_report
  enable row level security;

do $$
declare
  v_user_id uuid;
  v_target numeric;
  v_cash numeric;
  v_reset_at numeric;
  v_unlocked_at timestamptz;
begin
  select report.user_id into v_user_id
  from public.bug_reports report
  where report.id = '07efbb22-ceb2-45f6-a6f4-2d9e72fddc09'::uuid
    and report.game_id = 'sedim'
    and report.status in ('open', 'investigating');

  if v_user_id is null then
    raise exception 'asset_reset_bug_report_not_open';
  end if;

  select target.target_cents into v_target
  from admin_rollback.r20260808_1800_wallet_targets target
  where target.user_id = v_user_id;

  select
    coalesce(save.state ->> 'cashExact', save.state ->> 'cash', '0')::numeric,
    coalesce(save.state ->> 'accountResetAt', '0')::numeric
  into v_cash, v_reset_at
  from public.game_saves save
  where save.user_id = v_user_id;

  select lock.unlocked_at into v_unlocked_at
  from public.game_save_recovery_locks lock
  where lock.user_id = v_user_id;

  if v_target is null
     or v_target <> 1000000000::numeric
     or v_cash < v_target
     or v_reset_at <= 0
     or v_unlocked_at is null
  then
    raise exception 'asset_reset_bug_report_recovery_not_verified';
  end if;
end;
$$;

update public.bug_reports
set status = 'fixed',
    admin_note = '확인 결과 해당 계정은 자산 소실 상태가 아니라 2026년 8월 8일 18:00(KST) 안전 복구 대상이었습니다. 초고액 ETF 분할·병합 및 청산 과정의 수치 범위 초과와 오래된 클라우드 저장본의 재반영으로 종목별 수량 원장을 신뢰할 수 없게 되어, 일반 주식·파생·공매도·옵션·AMC/ETF 포지션은 초기화했습니다. 대신 18시 당시의 최신 정상 스냅샷, 직후 최초 정상 스냅샷, 주간 기준 자산, 리더보드 값을 순서대로 대조해 확인 가능한 순자산 총액을 보존했습니다. sedim 계정은 주간 정상 기준액 $10M을 현금으로 복구했고, 별도 원장으로 확인된 우선주는 종목 자체로 다시 반영했습니다. 현재 저장 잠금은 해제됐으며 일반 거래와 유저 ETF 거래 후 저장도 정상화됐습니다. 즉 주식 구성은 초기화됐지만 확인 가능한 기준 자산가치는 유지됐습니다. 상세한 신고에 감사드리며 수정 완료 보상 $50,000를 지급합니다.',
    updated_at = now()
where id = '07efbb22-ceb2-45f6-a6f4-2d9e72fddc09'::uuid;

commit;
