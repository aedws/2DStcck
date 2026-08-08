-- Restore @asset_management to the last verified pre-overflow net-worth snapshot.
--
-- Verified production evidence:
--   2026-08-07 18:31 KST (session 496137): 27,643,318,083,586,652 cents
--   2026-08-08 00:59 KST (session 496143): first astronomical corrupt value
--   post-recovery total:                         64,632,856,936 cents
--
-- The difference is credited once through the account adjustment ledger. Keeping
-- the surviving holding intact makes the restored total match the last normal
-- snapshot while preserving all post-recovery activity.

do $$
declare
  v_user_id constant uuid := 'c62072f1-cb50-43ea-ba73-554ce39b1b8f'::uuid;
  v_bug_id constant uuid := 'b1a5b8d6-4b45-44ce-9e20-f98c0d59172d'::uuid;
  v_adjustment_id constant text :=
    'pre-overflow-asset-restore-20260808-asset-management';
  v_last_normal_net_worth constant numeric := 27643318083586652;
  v_post_recovery_net_worth constant numeric := 64632856936;
  v_restore_cents constant numeric := 27643253450729716;
  v_first_applied_at timestamptz;
  v_save_count integer;
begin
  if not exists (
    select 1
    from public.bug_reports
    where id = v_bug_id
      and user_id = v_user_id
      and lower(game_id) = 'asset_management'
      and title = '갑작스러운 자산 소멸'
  ) then
    raise exception 'target_bug_report_account_mismatch';
  end if;

  if not exists (
    select 1
    from public.leaderboard_session_snapshots
    where user_id = v_user_id
      and market_session = 496137
      and net_worth = v_last_normal_net_worth
  ) then
    raise exception 'verified_pre_overflow_snapshot_missing';
  end if;

  if v_last_normal_net_worth - v_post_recovery_net_worth <> v_restore_cents then
    raise exception 'restore_amount_invariant_failed';
  end if;

  insert into public.account_cash_adjustments (
    id,
    user_id,
    game_id,
    amount_cents,
    reason
  ) values (
    v_adjustment_id,
    v_user_id,
    'asset_management',
    v_restore_cents,
    '2026-08-07 18:31 KST 마지막 정상 순자산 스냅샷 기준 천문학적 복리증폭 복구 차액 지급'
  ) on conflict (id) do nothing;

  select first_applied_at
    into v_first_applied_at
  from public.account_cash_adjustments
  where id = v_adjustment_id;

  if v_first_applied_at is null then
    -- The adjustment trigger applies the exact cash delta and records an idempotent
    -- compensation payment. Incrementing the CAS revision forces stale clients to
    -- reload this authoritative restored wallet instead of overwriting it.
    update public.game_saves
    set state = state,
        wallet_revision = wallet_revision + 1,
        updated_at = now()
    where user_id = v_user_id;

    get diagnostics v_save_count = row_count;
    if v_save_count <> 1 then
      raise exception 'target_game_save_count_invalid: %', v_save_count;
    end if;
  end if;

  update public.bug_reports
  set status = 'fixed',
      admin_note = '확인 결과 8월 7일 18:31의 순자산 $276,433,180,835,866.52가 마지막 정상 서버 스냅샷이며, 이후 옵션 거래 금액이 128자리 이상으로 증폭된 오염 기록을 확인했습니다. 최종 정상 스냅샷과 오버플로우 복구 후 자산의 차액 $276,432,534,507,297.16을 1회 복구했습니다. 재접속하면 복구된 지갑을 불러옵니다.',
      updated_at = now()
  where id = v_bug_id;
end;
$$;
