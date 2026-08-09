-- Apply the reports that can be decided from production evidence now. Requests
-- without an authoritative amount remain in asset_recovery_requests for review.

begin;

set local app.recovery_bypass = 'on';
set local app.asset_recovery_bypass = 'on';

do $$
declare
  v_user_id constant uuid := 'c5babf69-b9e3-49cb-81c7-67c7d084017e'::uuid;
  v_report_id constant uuid := '878e36e6-6320-46ba-9498-6bc9b3b2fd72'::uuid;
  v_request_id uuid;
  v_current_cash constant numeric := 190780184521154512560;
  v_normal_cash constant numeric := 10000623339;
  v_post_error_buys constant numeric := 3000000;
  v_post_error_distribution constant numeric := 33110;
  v_target_cash constant numeric := 9997656449;
  v_adjustment constant numeric := -190780184511156856111;
  v_adjustment_id constant text := 'asset-corruption-correction-20260809-skycat';
  v_revision bigint;
begin
  if v_normal_cash - v_post_error_buys + v_post_error_distribution <> v_target_cash
     or v_current_cash + v_adjustment <> v_target_cash then
    raise exception 'skycat_correction_math_invalid';
  end if;

  if not exists (
    select 1 from public.financial_wallet_checkpoints checkpoint
    where checkpoint.id = 484
      and checkpoint.user_id = v_user_id
      and checkpoint.wallet_revision = 888
      and checkpoint.after_state ->> 'cashExact' = v_normal_cash::text
  ) then
    raise exception 'skycat_last_normal_checkpoint_missing';
  end if;

  if not exists (
    select 1
    from public.game_saves saves,
      jsonb_array_elements(coalesce(saves.state -> 'trades', '[]'::jsonb)) trade(value)
    where saves.user_id = v_user_id
      and trade.value ->> 'id' = 'amc-ledger-trade-b6bfe0e4-5692-4fe6-b352-a1f80ba9e3a7'
      and trade.value ->> 'totalExact' = '190780184520155979450'
  ) then
    raise exception 'skycat_corrupt_trade_evidence_missing';
  end if;

  if not exists (
    select 1 from public.game_saves
    where user_id = v_user_id
      and wallet_revision = 911
      and coalesce(state ->> 'cashExact', state ->> 'cash')::numeric = v_current_cash
  ) then
    raise exception 'skycat_wallet_changed_since_review';
  end if;

  select id into v_request_id
  from public.asset_recovery_requests
  where source_kind = 'bug' and report_id = v_report_id
  for update;
  if v_request_id is null then raise exception 'skycat_review_request_missing'; end if;

  insert into public.account_cash_adjustments (
    id, user_id, game_id, amount_cents, reason
  ) values (
    v_adjustment_id,
    v_user_id,
    'skycat',
    v_adjustment,
    '서버 체크포인트 484 이후 HIGI 비정상 배수 매도 증식분 회수; 이후 BAQQQ 매수 2건과 커버드콜 분배 보존'
  ) on conflict (id) do nothing;

  update public.game_saves
  set state = state,
      wallet_revision = wallet_revision + 1,
      updated_at = clock_timestamp()
  where user_id = v_user_id
  returning wallet_revision into v_revision;
  if v_revision is null then raise exception 'skycat_game_save_missing'; end if;

  if not exists (
    select 1 from public.game_saves
    where user_id = v_user_id
      and coalesce(state ->> 'cashExact', state ->> 'cash')::numeric = v_target_cash
  ) then
    raise exception 'skycat_corrected_cash_mismatch';
  end if;

  update public.asset_recovery_requests
  set status = 'corrected',
      verified_amount_cents = v_adjustment,
      evidence_note = '체크포인트 #484 현금 10,000,623,339센트와 HIGI 비정상 매도 190,780,184,520,155,979,450센트를 대조했습니다.',
      resolution_note = '비정상 HIGI 매도로 증가한 현금만 회수했습니다. 이후 BAQQQ 매수 2건과 커버드콜 분배는 보존했으며 교정 현금은 $99,976,564.49입니다.',
      reviewed_at = clock_timestamp(),
      paid_at = clock_timestamp(),
      adjustment_id = v_adjustment_id,
      updated_at = clock_timestamp()
  where id = v_request_id;

  update public.bug_reports
  set status = 'fixed',
      admin_note = '서버 체크포인트를 대조해 HIGI 유저 ETF가 비정상 액면배수로 매도되며 증가한 금액만 회수했습니다. 이후 BAQQQ 매수 2건과 커버드콜 분배는 유지했으며, 정상 교정 현금은 $99,976,564.49입니다.',
      updated_at = clock_timestamp()
  where id = v_report_id and user_id = v_user_id;
end;
$$;

-- The daily leverage floor plus automatic split/merge prevents a derivative
-- from remaining at -100%, closing the reported one-trade amplification path.
update public.feedback
set status = 'done',
    admin_note = '파생 ETF의 일일 손실계수를 0보다 크게 제한하고 가격이 낮아지면 자동 병합해 -100% 고정 및 단일 거래 자산 증폭 경로를 차단했습니다.',
    updated_at = clock_timestamp()
where id = '2dda6381-aeea-44b0-ba2d-4836a685d739'::uuid
  and status in ('open', 'considering', 'planned');

update public.feedback
set status = 'done',
    admin_note = '파생 ETF 뉴스 탭에서도 기초자산에 영향을 준 뉴스를 함께 표시하고, 기초자산 뉴스 배지를 추가했습니다.',
    updated_at = clock_timestamp()
where id = 'a3fc9fb1-a958-4680-b785-a28ff4e324ad'::uuid
  and status in ('open', 'considering', 'planned');

update public.bug_reports
set status = 'fixed',
    admin_note = '로그인 계정의 서버 지갑과 실시간 가격 동기화가 끝나기 전에는 옵션 매수·발행·청산과 공매도 개시·청산을 저장소와 화면 양쪽에서 차단했습니다.',
    updated_at = clock_timestamp()
where id = 'e43f14fa-741d-483c-9b71-f2dc83e5a7c1'::uuid
  and status in ('open', 'investigating');

-- These claims exceed every finite server checkpoint by many orders of
-- magnitude. Close them with the exact server evidence instead of guessing.
update public.asset_recovery_requests
set status = 'rejected',
    verified_amount_cents = null,
    evidence_note = '마지막 정상 서버 순자산 스냅샷은 27,643,318,083,586,652센트이며 해당 기준 복구가 이미 적용되었습니다.',
    resolution_note = '요청한 2.478e126~4.77e126 범위는 최초 오염 기록 이후의 천문학적 값으로 확인되어 정상 자산 근거로 사용할 수 없습니다. 검증 가능한 정상 스냅샷 기준 복구는 이미 완료됐습니다.',
    reviewed_at = clock_timestamp(),
    updated_at = clock_timestamp()
where source_kind = 'bug'
  and report_id = 'ff141d61-f329-4d46-84c1-776f7095fe92'::uuid
  and status in ('under_review', 'verified');

update public.bug_reports
set status = 'wontfix',
    admin_note = '요청한 2.478e126~4.77e126 범위는 최초 DB 오염 이후의 천문학적 값입니다. 마지막 정상 서버 스냅샷 27,643,318,083,586,652센트 기준 복구가 이미 적용되어 추가 지급하지 않습니다.',
    updated_at = clock_timestamp()
where id = 'ff141d61-f329-4d46-84c1-776f7095fe92'::uuid;

update public.asset_recovery_requests
set status = 'rejected',
    verified_amount_cents = null,
    evidence_note = '18시 이전 정상 스냅샷은 없고 최초 확인 가능한 유한 스냅샷은 51,021,426,697,620,591센트입니다.',
    resolution_note = '신고 금액은 서버에서 정상값으로 확인할 수 없는 천문학적 오염 범위입니다. 최초 유한 서버 스냅샷 51,021,426,697,620,591센트 기준 복구가 적용되어 추가 지급하지 않습니다.',
    reviewed_at = clock_timestamp(),
    updated_at = clock_timestamp()
where source_kind = 'bug'
  and report_id = '531edb9f-c104-457e-bc49-9de4c3737d15'::uuid
  and status in ('under_review', 'verified');

update public.bug_reports
set status = 'wontfix',
    admin_note = '18시 이전 정상 서버 스냅샷은 없으며 최초 확인 가능한 유한 스냅샷 51,021,426,697,620,591센트 기준 복구가 적용됐습니다. 신고한 천문학적 금액은 정상 원장으로 검증되지 않아 추가 지급하지 않습니다.',
    updated_at = clock_timestamp()
where id = '531edb9f-c104-457e-bc49-9de4c3737d15'::uuid;

-- The memory-only feedback duplicates the later, more concrete bug report.
-- Keep the concrete request under review and close only this duplicate.
update public.asset_recovery_requests
set status = 'rejected',
    verified_amount_cents = null,
    evidence_note = '동일 계정의 후속 버그 리포트 2c1bde9f-9810-45bf-b403-439bfece9730으로 구체 금액과 거래 근거가 다시 접수되었습니다.',
    resolution_note = '이 요청은 후속 자산복구 버그 리포트로 통합했습니다. 후속 요청은 서버 거래 원장과 대조 후 검증액만 지급합니다.',
    reviewed_at = clock_timestamp(),
    updated_at = clock_timestamp()
where source_kind = 'feedback'
  and report_id = '04b50a1e-3e33-4e17-8649-1a22dc999e1c'::uuid
  and status in ('under_review', 'verified');

update public.feedback
set status = 'declined',
    admin_note = '후속 자산복구 버그 리포트로 통합했습니다. 후속 요청에서 서버 거래 원장과 대조해 검증된 금액만 1회 지급합니다.',
    updated_at = clock_timestamp()
where id = '04b50a1e-3e33-4e17-8649-1a22dc999e1c'::uuid;

commit;
