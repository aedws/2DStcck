-- 계좌가 과거 시점으로 돌아가 주식·현금이 사라진 제보를 운영 요청에 따라 처리한다.
-- 기존 1회성 계정 조정 원장을 사용해 $600T를 한 번만 지급하고 리포트를 완료한다.

do $$
declare
  v_user_id uuid;
  v_bug_id uuid;
  v_save_count integer;
begin
  select user_id into v_user_id
  from public.game_accounts
  where lower(game_id) = 'gudokza111';

  if v_user_id is null then
    raise exception 'target_account_not_found';
  end if;

  select id into v_bug_id
  from public.bug_reports
  where user_id = v_user_id
    and title = '갑자기 주식일부랑 현금이 사라졌어요'
    and created_at >= timestamptz '2026-07-23 00:05:00+09'
    and created_at < timestamptz '2026-07-23 00:10:00+09'
  order by created_at desc
  limit 1;

  if v_bug_id is null then
    raise exception 'target_bug_report_not_found';
  end if;

  insert into public.account_cash_adjustments (
    id, user_id, game_id, amount_cents, reason
  ) values (
    'account-rollback-cash-compensation-20260723-gudokza111',
    v_user_id,
    'gudokza111',
    60000000000000000,
    '계좌 롤백 피해 복구 요청에 따른 $600T 현금 1회 지급'
  ) on conflict (id) do nothing;

  -- 현재 서버 지갑에 즉시 반영한다. 이후 저장에도 claimedCompensationIds가 중복 지급을 막는다.
  update public.game_saves
  set state = state,
      updated_at = now()
  where user_id = v_user_id;

  get diagnostics v_save_count = row_count;
  if v_save_count <> 1 then
    raise exception 'target_game_save_count_invalid: %', v_save_count;
  end if;

  update public.bug_reports
  set status = 'fixed',
      admin_note = '계좌가 과거 시점으로 돌아간 피해를 확인해 요청하신 현금 $600T를 1회 지급했습니다. 불편을 드려 죄송합니다.',
      updated_at = now()
  where id = v_bug_id;
end;
$$;
