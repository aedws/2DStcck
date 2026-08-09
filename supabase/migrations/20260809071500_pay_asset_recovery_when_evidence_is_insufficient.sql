-- Asset-recovery policy: lack of server evidence is no longer a reason to
-- withhold payment. Admins still enter an explicit integer-cent amount and a
-- review basis, and the existing exact-once adjustment RPC performs payment.

revoke execute on function public.reject_asset_recovery_request(uuid, text)
  from authenticated;

select set_config('app.asset_recovery_bypass', 'on', true);

update public.asset_recovery_requests
set status = 'under_review',
    verified_amount_cents = null,
    evidence_note = concat_ws(
      E'\n',
      nullif(trim(coalesce(evidence_note, '')), ''),
      '운영 정책 변경: 서버 근거가 부족해도 지급 사유와 금액을 확정해 복구 지급합니다.'
    ),
    resolution_note = null,
    reviewed_by = null,
    reviewed_at = null,
    updated_at = clock_timestamp()
where source_kind = 'bug'
  and report_id in (
    'ff141d61-f329-4d46-84c1-776f7095fe92'::uuid,
    '531edb9f-c104-457e-bc49-9de4c3737d15'::uuid
  )
  and status = 'rejected';

update public.bug_reports
set status = 'investigating',
    admin_note = '근거 불충분 시에도 지급하도록 복구 심사를 다시 열었습니다. 지급 사유와 확정 금액을 기록한 뒤 1회 지급합니다.',
    updated_at = clock_timestamp()
where id in (
    'ff141d61-f329-4d46-84c1-776f7095fe92'::uuid,
    '531edb9f-c104-457e-bc49-9de4c3737d15'::uuid
  );

comment on function public.reject_asset_recovery_request(uuid, text) is
  'Legacy audit function. Execution revoked: insufficient evidence now proceeds to an explicit policy-basis payout review.';
