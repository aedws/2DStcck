-- HIGENA 복구 중 잘못 증가한 현금을 운영 요청에 따라 1회 차감한다.
-- 접속 중인 구 지갑이 다시 저장되어도 조정 표식이 없다면 같은 기준으로 보정하고,
-- 표식이 포함된 뒤에는 다시 차감하지 않는다.

create table if not exists public.account_cash_adjustments (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null,
  amount_cents numeric not null check (amount_cents <> 0),
  reason text not null,
  cash_before_cents numeric,
  cash_after_cents numeric,
  first_applied_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.account_cash_adjustments
  add column if not exists cash_before_cents numeric,
  add column if not exists cash_after_cents numeric,
  add column if not exists first_applied_at timestamptz;

create index if not exists account_cash_adjustments_user_idx
  on public.account_cash_adjustments (user_id);

alter table public.account_cash_adjustments enable row level security;
revoke all on public.account_cash_adjustments from public, anon, authenticated;

create or replace function public.apply_account_cash_adjustments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adjustment public.account_cash_adjustments%rowtype;
  v_claimed jsonb;
  v_payments jsonb;
  v_cash_before numeric;
  v_cash_after numeric;
begin
  if new.state is null then return new; end if;

  v_claimed := coalesce(new.state -> 'claimedCompensationIds', '[]'::jsonb);
  v_payments := coalesce(new.state -> 'cashPayments', '[]'::jsonb);

  for v_adjustment in
    select *
    from public.account_cash_adjustments
    where user_id = new.user_id
    order by created_at, id
  loop
    if not (v_claimed ? v_adjustment.id) then
      v_cash_before := coalesce((new.state ->> 'cash')::numeric, 0);
      v_cash_after := v_cash_before + v_adjustment.amount_cents;
      new.state := jsonb_set(
        new.state,
        '{cash}',
        to_jsonb(v_cash_after),
        true
      );
      v_claimed := v_claimed || jsonb_build_array(v_adjustment.id);
      v_payments := jsonb_build_array(jsonb_build_object(
        'id', v_adjustment.id,
        'kind', 'compensation',
        'sourceId', 'account-cash-adjustment',
        'dueSession', floor(extract(epoch from now()) * 1000 / 3600000)::bigint,
        'amount', v_adjustment.amount_cents,
        'timestamp', floor(extract(epoch from now()) * 1000)::bigint
      )) || v_payments;

      update public.account_cash_adjustments
      set cash_before_cents = coalesce(cash_before_cents, v_cash_before),
          cash_after_cents = coalesce(cash_after_cents, v_cash_after),
          first_applied_at = coalesce(first_applied_at, now())
      where id = v_adjustment.id;
    end if;
  end loop;

  new.state := jsonb_set(new.state, '{claimedCompensationIds}', v_claimed, true);
  new.state := jsonb_set(new.state, '{cashPayments}', v_payments, true);
  return new;
end;
$$;

revoke all on function public.apply_account_cash_adjustments() from public, anon, authenticated;

drop trigger if exists game_saves_account_cash_adjustments on public.game_saves;
create trigger game_saves_account_cash_adjustments
  before insert or update of state on public.game_saves
  for each row execute function public.apply_account_cash_adjustments();

do $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from public.game_accounts
  where lower(game_id) = 'gudokza111';

  if v_user_id is null then
    raise exception 'target_account_not_found';
  end if;

  insert into public.account_cash_adjustments (
    id, user_id, game_id, amount_cents, reason
  ) values (
    'higena-recovery-cash-correction-20260722',
    v_user_id,
    'gudokza111',
    -190000000000000000,
    'HIGENA 복구 버그로 증가한 $1,900T 현금 1회 차감 요청'
  ) on conflict (id) do nothing;

  -- 현재 서버 지갑에도 즉시 적용한다. 이후 구 클라이언트가 덮어써도 트리거가
  -- 표식을 다시 심어 같은 1회 조정 결과를 유지한다.
  update public.game_saves
  set state = state,
      updated_at = now()
  where user_id = v_user_id;
end;
$$;
