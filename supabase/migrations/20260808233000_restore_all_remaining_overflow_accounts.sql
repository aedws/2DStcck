-- Finish the production-wide recovery for the 2026-08-08 astronomical-asset
-- overflow incident.
--
-- Evidence used by this migration:
--   * 21 accounts ever published a net-worth snapshot >= 1e20 cents.
--   * Four accounts have a retained, direct pre-corruption snapshot.
--   * Ten offline saves still contain astronomical positions. Their current
--     leaderboard value and weekly baseline are both exactly 1,000,000,000
--     cents, so the authoritative recovery state is an empty $10M wallet.
--   * Three other accounts only have corrupt history; their current saves and
--     leaderboard values are finite, so their assets are deliberately untouched.

do $$
declare
  v_reset_user_ids constant uuid[] := array[
    '5c987a2c-1754-4c9f-9afb-7ace18a5f7d8'::uuid, -- doglife
    '19fbe4cd-c288-4ee0-8cb8-4aaa75a84242'::uuid, -- dotfiles
    '9403087f-fae5-4cc6-9ddf-f1fe2dc205ea'::uuid, -- gudokza111
    '9085991b-7036-46dc-a993-bfcc8d13be86'::uuid, -- live5080
    '056400f6-5bf7-4ac1-a04d-bf891157bcee'::uuid, -- omni
    '4cbd95d2-26c2-4e97-a996-11322fd03756'::uuid, -- qprjsngls
    'c093ab45-bcea-434e-8dc4-c9610452a8e3'::uuid, -- rubby207
    '87536786-bce2-4cfe-9b41-e94f00ffc099'::uuid, -- sedim
    '396e6aad-2321-4512-b897-99800ae9ccc4'::uuid, -- titia8397
    '49912f67-78bb-472b-8797-9b9c456f576d'::uuid  -- warning
  ];
  v_hina_user_id constant uuid :=
    'ee0b46d0-a9dd-4167-88c4-5162d16cc3ed'::uuid;
  v_bradje_user_id constant uuid :=
    'af5a68d0-5fbd-4ea3-8250-9711e9bfb075'::uuid;
  v_hina_target constant numeric := 618655440943;
  v_hina_current_portfolio constant numeric := 994962643;
  v_hina_restore constant numeric := 617660478300;
  v_bradje_target constant numeric := 92076248537;
  v_bradje_current_clean_portfolio constant numeric := 22644428869;
  v_bradje_restore constant numeric := 69431819668;
  v_count integer;
begin
  -- Refuse to run if any identity has drifted.
  select count(*) into v_count
  from public.game_accounts
  where (user_id, lower(game_id)) in (
    ('5c987a2c-1754-4c9f-9afb-7ace18a5f7d8'::uuid, 'doglife'),
    ('19fbe4cd-c288-4ee0-8cb8-4aaa75a84242'::uuid, 'dotfiles'),
    ('9403087f-fae5-4cc6-9ddf-f1fe2dc205ea'::uuid, 'gudokza111'),
    ('9085991b-7036-46dc-a993-bfcc8d13be86'::uuid, 'live5080'),
    ('056400f6-5bf7-4ac1-a04d-bf891157bcee'::uuid, 'omni'),
    ('4cbd95d2-26c2-4e97-a996-11322fd03756'::uuid, 'qprjsngls'),
    ('c093ab45-bcea-434e-8dc4-c9610452a8e3'::uuid, 'rubby207'),
    ('87536786-bce2-4cfe-9b41-e94f00ffc099'::uuid, 'sedim'),
    ('396e6aad-2321-4512-b897-99800ae9ccc4'::uuid, 'titia8397'),
    ('49912f67-78bb-472b-8797-9b9c456f576d'::uuid, 'warning'),
    (v_hina_user_id, 'hina'),
    (v_bradje_user_id, 'bradje')
  );
  if v_count <> 12 then
    raise exception 'overflow_recovery_account_identity_mismatch: %', v_count;
  end if;

  -- The ten pending saves have an independently recorded $10M baseline.
  select count(*) into v_count
  from public.leaderboard
  where user_id = any(v_reset_user_ids)
    and net_worth = 1000000000
    and weekly_start_net_worth = 1000000000;
  if v_count <> 10 then
    raise exception 'pending_recovery_baseline_mismatch: %', v_count;
  end if;

  if v_hina_target - v_hina_current_portfolio <> v_hina_restore then
    raise exception 'hina_restore_invariant_failed';
  end if;
  if v_bradje_target - v_bradje_current_clean_portfolio <> v_bradje_restore then
    raise exception 'bradje_restore_invariant_failed';
  end if;

  if not exists (
    select 1 from public.leaderboard_session_snapshots
    where user_id = v_hina_user_id and net_worth = v_hina_target
      and created_at < timestamptz '2026-08-08 22:01:00+09'
  ) then
    raise exception 'hina_verified_snapshot_missing';
  end if;
  if not exists (
    select 1 from public.leaderboard_session_snapshots
    where user_id = v_bradje_user_id and net_worth = v_bradje_target
      and created_at < timestamptz '2026-08-08 22:01:00+09'
  ) then
    raise exception 'bradje_verified_snapshot_missing';
  end if;

  -- The exact deltas below were calculated from these authoritative save
  -- states and the bundled production checkpoint. Abort instead of guessing if
  -- either online account has traded since the audit.
  if not exists (
    select 1 from public.game_saves
    where user_id = v_hina_user_id
      and state ->> 'cashExact' = '994947697'
      and jsonb_array_length(coalesce(state -> 'holdings', '[]'::jsonb)) = 1
      and state -> 'holdings' -> 0 ->> 'stockId' = 'nexr'
      and state -> 'holdings' -> 0 ->> 'quantityExact' = '1'
  ) then
    raise exception 'hina_audited_save_drifted';
  end if;
  if not exists (
    select 1 from public.game_saves
    where user_id = v_bradje_user_id
      and state ->> 'cashExact' = '1005001500'
      and jsonb_array_length(coalesce(state -> 'holdings', '[]'::jsonb)) = 9
  ) then
    raise exception 'bradje_audited_save_drifted';
  end if;

  -- These accounts have no trustworthy portfolio composition left. Clearing all
  -- positions exactly matches both independent $10M server baselines and prevents
  -- the client from re-saving astronomical quantities on its next login.
  update public.game_saves
  set state = state || jsonb_build_object(
        'cash', 1000000000,
        'cashExact', '1000000000',
        'holdings', '[]'::jsonb,
        'shorts', '[]'::jsonb,
        'options', '[]'::jsonb,
        'marginEnabled', false,
        'amcLedgerBalance', 0,
        'amcLedgerBalanceExact', '0'
      ),
      wallet_revision = wallet_revision + 1,
      updated_at = now()
  where user_id = any(v_reset_user_ids);
  get diagnostics v_count = row_count;
  if v_count <> 10 then
    raise exception 'pending_recovery_save_count_invalid: %', v_count;
  end if;

  -- @hina already passed through client recovery. Preserve the surviving NEXR
  -- share and restore the exact difference to the last normal snapshot.
  insert into public.account_cash_adjustments (
    id, user_id, game_id, amount_cents, reason
  ) values (
    'pre-overflow-asset-restore-20260808-hina',
    v_hina_user_id,
    'hina',
    v_hina_restore,
    'Restore exact difference to the last retained normal pre-overflow snapshot'
  ) on conflict (id) do nothing;

  update public.game_saves
  set state = state,
      wallet_revision = wallet_revision + 1,
      updated_at = now()
  where user_id = v_hina_user_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'hina_game_save_count_invalid: %', v_count;
  end if;

  -- @bradje retained one AMC position whose current evaluation is still
  -- astronomical. Remove only that contaminated fund, keep the eight healthy
  -- positions, and restore the difference at the bundled production prices.
  insert into public.account_cash_adjustments (
    id, user_id, game_id, amount_cents, reason
  ) values (
    'pre-overflow-asset-restore-20260808-bradje',
    v_bradje_user_id,
    'bradje',
    v_bradje_restore,
    'Remove contaminated AMC position and restore last normal pre-overflow total'
  ) on conflict (id) do nothing;

  update public.game_saves
  set state = state || jsonb_build_object(
        'holdings', coalesce((
          select jsonb_agg(h)
          from jsonb_array_elements(coalesce(state -> 'holdings', '[]'::jsonb)) h
          where h ->> 'stockId' <> 'amc:mrvswvdwbbqm'
        ), '[]'::jsonb)
      ),
      wallet_revision = wallet_revision + 1,
      updated_at = now()
  where user_id = v_bradje_user_id
    and exists (
      select 1
      from jsonb_array_elements(coalesce(state -> 'holdings', '[]'::jsonb)) h
      where h ->> 'stockId' = 'amc:mrvswvdwbbqm'
        and h ->> 'quantityExact' = '60000000'
    );
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'bradje_contaminated_position_mismatch: %', v_count;
  end if;

  -- Repair the visible leaderboard and discard corrupt weekly baselines. The
  -- normal saves for 187361948, luxury, and natsume_anan are not modified.
  update public.leaderboard lb
  set net_worth = targets.target,
      weekly_start_net_worth = targets.target,
      weekly_return = 0,
      return_rate = case
        when lb.initial_cash > 0
          then ((targets.target - lb.initial_cash)::numeric / lb.initial_cash::numeric) * 100
        else lb.return_rate
      end,
      updated_at = now()
  from (values
    ('c62072f1-cb50-43ea-ba73-554ce39b1b8f'::uuid, 27643318083586652::numeric),
    ('18e43306-89fa-4099-8456-8242d3b4fc40'::uuid, 523381508396::numeric),
    (v_hina_user_id, v_hina_target),
    (v_bradje_user_id, v_bradje_target),
    ('71cb288a-ac2a-4ba5-ab54-0018f7dfc669'::uuid, 51769966982643133::numeric),
    ('c2853f36-ea79-4f66-be22-690f655b848e'::uuid, 294647911922706178::numeric),
    ('7dbe6c0a-61f8-4f34-af5e-f35a44bf63d2'::uuid, 64719517106::numeric)
  ) as targets(user_id, target)
  where lb.user_id = targets.user_id;
  get diagnostics v_count = row_count;
  if v_count <> 7 then
    raise exception 'leaderboard_repair_count_invalid: %', v_count;
  end if;
end;
$$;
