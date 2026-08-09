-- Final asset-recovery settlement. The operator approved each reported amount
-- without further evidence review and closed the dedicated review workflow.

do $$
declare
  payout record;
  recovery public.asset_recovery_requests%rowtype;
  adjustment_key text;
  applied_at timestamptz;
  new_revision bigint;
  sedim_adjustment_id text;
  sedim_amount numeric;
begin
  for payout in
    select *
    from (values
      (
        'dbdf778a-45d7-452c-80bd-bb25c73dd012'::uuid,
        '1.20e150'::numeric,
        '$1.20e148'
      ),
      (
        'b3ec9037-b885-40b6-a097-febc3750893c'::uuid,
        '1527016724719772400000000000000000000'::numeric,
        '$15,270,167,247,197,724,000,000,000,000,000,000.00'
      ),
      (
        '9aab6bf6-0b01-46e0-8628-4f541f78a59f'::uuid,
        '4.77e128'::numeric,
        '$4.77e126'
      ),
      (
        '36cd4a75-86ff-4afc-a6f5-b7984a7162ba'::uuid,
        '1404602346557745500000000000000000000000000000000000000000000000000'::numeric,
        '$14,046,023,465,577,455,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000,000.00'
      )
    ) as approved(request_id, amount_cents, requested_display)
  loop
    select * into recovery
    from public.asset_recovery_requests
    where id = payout.request_id
    for update;

    if not found then
      raise exception 'asset_recovery_request_missing:%', payout.request_id;
    end if;

    if recovery.status in ('paid', 'corrected') then
      continue;
    end if;

    adjustment_key := 'asset-recovery-final-' || recovery.id::text;

    insert into public.account_cash_adjustments (
      id, user_id, game_id, amount_cents, reason
    ) values (
      adjustment_key,
      recovery.user_id,
      recovery.game_id,
      payout.amount_cents,
      '자산복구 심사 종료 · 신고 요청액 전액 지급: ' || payout.requested_display
    ) on conflict (id) do nothing;

    perform set_config('app.recovery_bypass', 'on', true);
    update public.game_saves
    set state = state,
        wallet_revision = wallet_revision + 1,
        updated_at = clock_timestamp()
    where user_id = recovery.user_id
    returning wallet_revision into new_revision;

    if new_revision is null then
      raise exception 'asset_recovery_target_save_missing:%', recovery.game_id;
    end if;

    select first_applied_at into applied_at
    from public.account_cash_adjustments
    where id = adjustment_key;

    if applied_at is null then
      raise exception 'asset_recovery_adjustment_not_applied:%', recovery.game_id;
    end if;

    update public.asset_recovery_requests
    set status = 'paid',
        verified_amount_cents = payout.amount_cents,
        evidence_note = concat_ws(
          E'\n',
          nullif(trim(coalesce(evidence_note, '')), ''),
          '운영자 최종 결정: 신고 원문의 요청액을 별도 증빙 없이 전액 지급했습니다.'
        ),
        resolution_note = '자산복구 심사를 종료하며 요청 금액 ' || payout.requested_display || ' 전액을 1회 지급했습니다.',
        reviewed_at = coalesce(reviewed_at, clock_timestamp()),
        paid_at = clock_timestamp(),
        adjustment_id = adjustment_key,
        updated_at = clock_timestamp()
    where id = recovery.id;

    perform set_config('app.asset_recovery_bypass', 'on', true);
    if recovery.source_kind = 'bug' then
      update public.bug_reports
      set status = 'fixed',
          admin_note = '자산복구 심사를 종료하며 신고 요청액 ' || payout.requested_display || ' 전액을 지급했습니다.',
          updated_at = clock_timestamp()
      where id = recovery.report_id and user_id = recovery.user_id;
    else
      update public.feedback
      set status = 'done',
          admin_note = '자산복구 심사를 종료하며 신고 요청액 ' || payout.requested_display || ' 전액을 지급했습니다.',
          updated_at = clock_timestamp()
      where id = recovery.report_id and user_id = recovery.user_id;
    end if;
  end loop;

  -- The earlier sedim feedback was superseded by the exact follow-up report.
  -- Point both audit rows at the same payment without crediting the account twice.
  select adjustment_id, verified_amount_cents
  into sedim_adjustment_id, sedim_amount
  from public.asset_recovery_requests
  where id = 'b3ec9037-b885-40b6-a097-febc3750893c'::uuid;

  if sedim_adjustment_id is null or sedim_amount is null then
    raise exception 'sedim_consolidated_payment_missing';
  end if;

  update public.asset_recovery_requests
  set status = 'paid',
      verified_amount_cents = sedim_amount,
      resolution_note = '후속 버그 리포트의 구체 요청액으로 통합해 1회 지급했습니다. 중복 지급은 하지 않았습니다.',
      reviewed_at = coalesce(reviewed_at, clock_timestamp()),
      paid_at = clock_timestamp(),
      adjustment_id = 'asset-recovery-consolidated-' || id::text,
      updated_at = clock_timestamp()
  where id = 'a712d8e8-db3a-4470-a8f0-7095a381b271'::uuid;

  perform set_config('app.asset_recovery_bypass', 'on', true);
  update public.feedback
  set status = 'done',
      admin_note = '후속 자산복구 요청의 구체 금액으로 통합해 전액 지급했습니다. 동일 계정 중복 지급은 하지 않았습니다.',
      updated_at = clock_timestamp()
  where id = '04b50a1e-3e33-4e17-8649-1a22dc999e1c'::uuid;

  if exists (
    select 1 from public.asset_recovery_requests
    where status not in ('paid', 'corrected')
  ) then
    raise exception 'unsettled_asset_recovery_request_remains';
  end if;
end;
$$;

-- Close every entry point into the dedicated recovery-review workflow while
-- retaining its tables and adjustment rows as an immutable audit trail.
drop trigger if exists bug_reports_auto_queue_asset_recovery
  on public.bug_reports;
drop trigger if exists feedback_auto_queue_asset_recovery
  on public.feedback;
drop trigger if exists bug_reports_guard_asset_recovery_resolution
  on public.bug_reports;
drop trigger if exists feedback_guard_asset_recovery_resolution
  on public.feedback;

revoke all on function public.queue_asset_recovery_report(text, uuid)
  from public, anon, authenticated;
revoke all on function public.verify_asset_recovery_request(uuid, numeric, text)
  from public, anon, authenticated;
revoke all on function public.pay_verified_asset_recovery(uuid, text)
  from public, anon, authenticated;
revoke all on function public.reject_asset_recovery_request(uuid, text)
  from public, anon, authenticated;

drop function if exists public.auto_queue_asset_recovery_report();
drop function if exists public.guard_asset_recovery_report_resolution();
drop function if exists public.queue_asset_recovery_report(text, uuid);
drop function if exists public.verify_asset_recovery_request(uuid, numeric, text);
drop function if exists public.pay_verified_asset_recovery(uuid, text);
drop function if exists public.reject_asset_recovery_request(uuid, text);

comment on table public.asset_recovery_requests is
  'Closed asset-recovery audit ledger. All requests were finally settled on 2026-08-09; no new requests are queued.';
