-- The approved $1.20e148 recovery reached @gudokza111 once, but the legacy
-- client classified the exact-backed finite balance as an overflow and saved
-- its $10M recovery wallet over it. Reapply the approved target exactly and
-- keep this wallet read-only until the legacy service shuts down at midnight.

begin;

do $$
declare
  v_user_id uuid;
  v_current_cents numeric;
  v_target_cents constant numeric := '1.20e150'::numeric;
  v_delta_cents numeric;
  v_reset_marker bigint;
  v_revision bigint;
begin
  select account.user_id
  into v_user_id
  from public.game_accounts account
  where lower(account.game_id) = 'gudokza111';

  if v_user_id is null then
    raise exception 'jbinv_founder_account_missing';
  end if;

  select
    case
      when coalesce(save.state ->> 'cashExact', '') ~ '^-?[0-9]+$'
        then (save.state ->> 'cashExact')::numeric
      else coalesce((save.state ->> 'cash')::numeric, 0)
    end,
    coalesce((save.state ->> 'accountResetAt')::bigint, 0)
  into v_current_cents, v_reset_marker
  from public.game_saves save
  where save.user_id = v_user_id
  for update;

  if v_current_cents is null then
    raise exception 'jbinv_founder_save_missing';
  end if;

  if not exists (
    select 1
    from public.game_saves save
    where save.user_id = v_user_id
      and upper(save.state -> 'playerCompany' ->> 'ticker') = 'JBINV'
  ) then
    raise exception 'jbinv_founder_company_missing';
  end if;

  insert into public.game_save_recovery_locks (
    user_id, reset_marker, reason, locked_at, unlocked_at
  ) values (
    v_user_id,
    v_reset_marker,
    'jbinv_founder_exact_asset_recovery_until_legacy_shutdown',
    clock_timestamp(),
    null
  )
  on conflict (user_id) do update
  set reset_marker = excluded.reset_marker,
      reason = excluded.reason,
      locked_at = excluded.locked_at,
      unlocked_at = null;

  v_delta_cents := v_target_cents - v_current_cents;

  if v_delta_cents = 0 then
    return;
  end if;

  insert into public.account_cash_adjustments (
    id, user_id, game_id, amount_cents, reason
  ) values (
    'jbinv-founder-recovery-reapply-20260809',
    v_user_id,
    'gudokza111',
    v_delta_cents,
    'JBINV 창업주 승인 자산 $1.20e148 재복구 · 구버전 오버플로 재저장분 보정'
  )
  on conflict (id) do nothing;

  perform set_config('app.recovery_bypass', 'on', true);
  perform set_config('app.service_rebuild_bypass', 'on', true);

  update public.game_saves
  set state = state,
      wallet_revision = wallet_revision + 1,
      updated_at = clock_timestamp()
  where user_id = v_user_id
  returning wallet_revision into v_revision;

  if v_revision is null then
    raise exception 'jbinv_founder_recovery_update_failed';
  end if;

  if not exists (
    select 1
    from public.game_saves save
    where save.user_id = v_user_id
      and (save.state ->> 'cash')::numeric = v_target_cents
      and (save.state ->> 'cashExact')::numeric = v_target_cents
      and coalesce(save.state -> 'claimedCompensationIds', '[]'::jsonb)
        ? 'jbinv-founder-recovery-reapply-20260809'
  ) then
    raise exception 'jbinv_founder_recovery_target_mismatch';
  end if;

  update public.bug_reports
  set status = 'fixed',
      admin_note = '요청액 $1.20e148이 최초 지급 후 구버전 오버플로 복구에 덮인 사실을 확인했습니다. 동일 승인액을 정확히 재복구했고, 자정 서비스 종료까지 해당 지갑을 서버에서 읽기 전용으로 보호했습니다.',
      updated_at = clock_timestamp()
  where id = '838b6ac7-1f91-4d5f-b23a-ef2128dd029c'::uuid
    and user_id = v_user_id;
end;
$$;

commit;
