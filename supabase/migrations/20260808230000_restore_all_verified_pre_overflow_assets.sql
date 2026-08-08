-- Restore every additional account with a verified loss caused by the
-- 2026-08-08 finite-overflow recovery deployment.
--
-- Production-wide audit result:
--   * 21 accounts had at least one astronomical (> 1e20 cents) snapshot.
--   * 2 accounts had a verified >10% drop across the recovery deployment.
--   * @asset_management was restored by the preceding migration.
--   * @nvidia is the only additional verified-loss account.
--
-- @nvidia evidence:
--   pre-recovery total: 523,381,508,396 cents ($5,233,815,083.96)
--   post-recovery total:  1,001,021,320 cents ($10,010,213.20)
--   restore delta:       522,380,487,076 cents ($5,223,804,870.76)

do $$
declare
  v_user_id constant uuid := '18e43306-89fa-4099-8456-8242d3b4fc40'::uuid;
  v_adjustment_id constant text :=
    'pre-overflow-asset-restore-20260808-nvidia';
  v_pre_recovery_net_worth constant numeric := 523381508396;
  v_post_recovery_net_worth constant numeric := 1001021320;
  v_restore_cents constant numeric := 522380487076;
  v_first_applied_at timestamptz;
  v_save_count integer;
begin
  if not exists (
    select 1
    from public.game_accounts
    where user_id = v_user_id
      and lower(game_id) = 'nvidia'
  ) then
    raise exception 'target_account_mismatch';
  end if;

  if not exists (
    select 1
    from public.leaderboard_session_snapshots
    where user_id = v_user_id
      and created_at < timestamptz '2026-08-08 22:01:00+09'
      and net_worth = v_pre_recovery_net_worth
  ) then
    raise exception 'verified_pre_recovery_snapshot_missing';
  end if;

  if not exists (
    select 1
    from public.leaderboard_session_snapshots
    where user_id = v_user_id
      and created_at >= timestamptz '2026-08-08 22:01:00+09'
      and net_worth = v_post_recovery_net_worth
  ) then
    raise exception 'verified_post_recovery_snapshot_missing';
  end if;

  if v_pre_recovery_net_worth - v_post_recovery_net_worth <> v_restore_cents then
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
    'nvidia',
    v_restore_cents,
    '2026-08-08 오버플로우 복구 배포 직전·직후 순자산 스냅샷 차액 1회 복구'
  ) on conflict (id) do nothing;

  select first_applied_at
    into v_first_applied_at
  from public.account_cash_adjustments
  where id = v_adjustment_id;

  if v_first_applied_at is null then
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
end;
$$;
