-- JBINV founder recovery is complete. The temporary read-only lock protected
-- the exact $1.20e148 cash grant, but it also blocked manual cloud saves and
-- leaderboard updates. Verify the authoritative wallet, release only this
-- account, and align its public net-worth row before normal CAS saves resume.

begin;

do $$
declare
  v_user_id uuid;
  v_target_cents constant numeric := '1.20e150'::numeric;
  v_market_session bigint := floor(
    extract(epoch from clock_timestamp()) * 1000 / 3600000
  )::bigint;
begin
  select account.user_id
  into v_user_id
  from public.game_accounts account
  where lower(account.game_id) = 'gudokza111';

  if v_user_id is null then
    raise exception 'jbinv_founder_account_missing';
  end if;

  if not exists (
    select 1
    from public.game_saves save
    where save.user_id = v_user_id
      and coalesce(save.state ->> 'cashExact', '') ~ '^[0-9]+$'
      and (save.state ->> 'cashExact')::numeric = v_target_cents
      and (save.state ->> 'cash')::numeric = v_target_cents
      and upper(save.state -> 'playerCompany' ->> 'ticker') = 'JBINV'
      and coalesce(save.state -> 'claimedCompensationIds', '[]'::jsonb)
        ? 'jbinv-founder-recovery-reapply-20260809'
  ) then
    raise exception 'jbinv_founder_recovery_not_finalized';
  end if;

  perform set_config('app.recovery_bypass', 'on', true);
  perform set_config('app.service_rebuild_bypass', 'on', true);

  update public.game_save_recovery_locks
  set unlocked_at = clock_timestamp(),
      reason = 'jbinv_founder_exact_asset_recovery_finalized'
  where user_id = v_user_id
    and unlocked_at is null;

  if not found then
    raise exception 'jbinv_founder_active_recovery_lock_missing';
  end if;

  -- The recovered cash dwarfs the retained founder shares. Use the exact
  -- authoritative cash floor immediately; the next successful client save
  -- will submit the full cash + holdings valuation through the normal RPC.
  update public.leaderboard
  set net_worth = v_target_cents,
      return_rate = case
        when initial_cash > 0
          then ((v_target_cents - initial_cash::numeric) /
                initial_cash::numeric) * 100
        else return_rate
      end,
      market_session = v_market_session,
      weekly_start = timezone('Asia/Seoul', clock_timestamp())::date,
      weekly_start_net_worth = v_target_cents,
      weekly_return = 0,
      updated_at = clock_timestamp()
  where user_id = v_user_id;

  if not found then
    raise exception 'jbinv_founder_leaderboard_row_missing';
  end if;

  delete from public.leaderboard_session_snapshots
  where user_id = v_user_id;

  insert into public.leaderboard_session_snapshots (
    user_id, market_session, net_worth, created_at
  ) values (
    v_user_id, v_market_session, v_target_cents, clock_timestamp()
  );

  update public.bug_reports
  set status = 'fixed',
      admin_note = '복구액 $1.20e148은 정상 지급됐으나 임시 안전 잠금이 수동 저장과 랭킹 갱신도 함께 막은 문제를 확인했습니다. 복구 지갑의 정확한 금액과 JBINV 법인·지급 마커를 재검증한 뒤 계좌 잠금을 해제했고, 순자산 랭킹도 복구액 기준으로 즉시 반영했습니다. 새로고침 후 수동 저장과 이후 거래 저장이 정상 동작합니다.',
      updated_at = clock_timestamp()
  where id = '838b6ac7-1f91-4d5f-b23a-ef2128dd029c'::uuid
    and user_id = v_user_id;

  if exists (
    select 1
    from public.game_save_recovery_locks lock
    where lock.user_id = v_user_id
      and lock.unlocked_at is null
  ) then
    raise exception 'jbinv_founder_recovery_lock_still_active';
  end if;

  if not exists (
    select 1
    from public.leaderboard board
    where board.user_id = v_user_id
      and board.net_worth = v_target_cents
      and board.weekly_start_net_worth = v_target_cents
      and board.weekly_return = 0
  ) then
    raise exception 'jbinv_founder_leaderboard_alignment_failed';
  end if;
end;
$$;

commit;
