-- One-time $100M login compensation for this week's server instability.
-- Eligible window ends at 2026-08-14 23:59:59.999 KST.

create table if not exists public.service_compensation_claims (
  compensation_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents numeric not null check (amount_cents > 0),
  claimed_at timestamptz not null default now(),
  wallet_revision bigint not null,
  primary key (compensation_id, user_id)
);

alter table public.service_compensation_claims enable row level security;
revoke all on table public.service_compensation_claims from anon, authenticated;

comment on table public.service_compensation_claims is
  'Authoritative one-row-per-account ledger for time-limited service compensations.';

create or replace function public.claim_server_instability_compensation_20260814()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_compensation_id constant text := 'server-instability-20260814';
  v_payment_id constant text := 'operational-server-instability-20260814';
  v_amount_cents constant numeric := 10000000000;
  v_deadline constant timestamptz := '2026-08-14 14:59:59.999+00';
  v_claimed_at timestamptz := clock_timestamp();
  v_state jsonb;
  v_cash_text text;
  v_cash numeric;
  v_new_cash numeric;
  v_payments jsonb;
  v_claimed_ids jsonb;
  v_revision bigint;
  v_timestamp_ms bigint;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if v_claimed_at > v_deadline then
    return jsonb_build_object(
      'status', 'expired',
      'amountCents', 0,
      'walletRevision', 0
    );
  end if;

  select saves.state, saves.wallet_revision
  into v_state, v_revision
  from public.game_saves saves
  where saves.user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'missing_save',
      'amountCents', 0,
      'walletRevision', 0
    );
  end if;

  if exists (
    select 1
    from public.service_compensation_claims claims
    where claims.compensation_id = v_compensation_id
      and claims.user_id = v_user_id
  ) then
    return jsonb_build_object(
      'status', 'already_claimed',
      'amountCents', 0,
      'walletRevision', v_revision
    );
  end if;

  v_state := coalesce(v_state, '{}'::jsonb);
  v_cash_text := coalesce(
    nullif(v_state ->> 'cashExact', ''),
    nullif(v_state ->> 'cash', ''),
    '0'
  );
  begin
    v_cash := v_cash_text::numeric;
  exception when others then
    raise exception 'invalid_cash_ledger';
  end;
  v_new_cash := v_cash + v_amount_cents;

  v_payments := case
    when jsonb_typeof(v_state -> 'cashPayments') = 'array'
      then v_state -> 'cashPayments'
    else '[]'::jsonb
  end;
  v_claimed_ids := case
    when jsonb_typeof(v_state -> 'claimedCompensationIds') = 'array'
      then v_state -> 'claimedCompensationIds'
    else '[]'::jsonb
  end;
  v_timestamp_ms := floor(extract(epoch from v_claimed_at) * 1000)::bigint;

  if not exists (
    select 1
    from jsonb_array_elements(v_payments) as payment(value)
    where payment.value ->> 'id' = v_payment_id
  ) then
    v_payments := jsonb_build_array(
      jsonb_build_object(
        'id', v_payment_id,
        'kind', 'compensation',
        'sourceId', 'operations',
        'dueSession', floor(v_timestamp_ms::numeric / 3600000),
        'amount', v_amount_cents,
        'timestamp', v_timestamp_ms
      )
    ) || v_payments;
  end if;

  if not exists (
    select 1
    from jsonb_array_elements_text(v_claimed_ids) as claim_id(value)
    where claim_id.value = v_compensation_id
  ) then
    v_claimed_ids := jsonb_build_array(v_compensation_id) || v_claimed_ids;
  end if;

  v_state := jsonb_set(v_state, '{cash}', to_jsonb(v_new_cash), true);
  v_state := jsonb_set(v_state, '{cashExact}', to_jsonb(v_new_cash::text), true);
  v_state := jsonb_set(v_state, '{cashPayments}', v_payments, true);
  v_state := jsonb_set(
    v_state,
    '{claimedCompensationIds}',
    v_claimed_ids,
    true
  );

  insert into public.service_compensation_claims (
    compensation_id,
    user_id,
    amount_cents,
    claimed_at,
    wallet_revision
  ) values (
    v_compensation_id,
    v_user_id,
    v_amount_cents,
    v_claimed_at,
    v_revision + 1
  );

  update public.game_saves
  set state = v_state,
      wallet_revision = wallet_revision + 1,
      updated_at = v_claimed_at
  where user_id = v_user_id
  returning wallet_revision into v_revision;

  return jsonb_build_object(
    'status', 'granted',
    'amountCents', v_amount_cents,
    'walletRevision', v_revision
  );
end;
$$;

revoke all on function public.claim_server_instability_compensation_20260814()
  from public, anon;
grant execute on function public.claim_server_instability_compensation_20260814()
  to authenticated;

-- A current-revision client can legitimately spend the reward, so this guard
-- preserves only the immutable evidence. CAS prevents a pre-claim wallet from
-- overwriting the credited balance, while this trigger prevents later clients
-- from deleting the claim/payment markers and reopening a duplicate claim path.
create or replace function public.preserve_service_compensation_evidence()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claim record;
  v_state jsonb := coalesce(new.state, '{}'::jsonb);
  v_payments jsonb;
  v_claimed_ids jsonb;
  v_payment_id text;
  v_timestamp_ms bigint;
begin
  for v_claim in
    select compensation_id, amount_cents, claimed_at
    from public.service_compensation_claims
    where user_id = new.user_id
    order by claimed_at
  loop
    v_payment_id := 'operational-' || v_claim.compensation_id;
    v_payments := case
      when jsonb_typeof(v_state -> 'cashPayments') = 'array'
        then v_state -> 'cashPayments'
      else '[]'::jsonb
    end;
    v_claimed_ids := case
      when jsonb_typeof(v_state -> 'claimedCompensationIds') = 'array'
        then v_state -> 'claimedCompensationIds'
      else '[]'::jsonb
    end;
    v_timestamp_ms := floor(extract(epoch from v_claim.claimed_at) * 1000)::bigint;

    if not exists (
      select 1
      from jsonb_array_elements(v_payments) as payment(value)
      where payment.value ->> 'id' = v_payment_id
    ) then
      v_payments := jsonb_build_array(
        jsonb_build_object(
          'id', v_payment_id,
          'kind', 'compensation',
          'sourceId', 'operations',
          'dueSession', floor(v_timestamp_ms::numeric / 3600000),
          'amount', v_claim.amount_cents,
          'timestamp', v_timestamp_ms
        )
      ) || v_payments;
    end if;

    if not exists (
      select 1
      from jsonb_array_elements_text(v_claimed_ids) as claim_id(value)
      where claim_id.value = v_claim.compensation_id
    ) then
      v_claimed_ids := jsonb_build_array(v_claim.compensation_id) || v_claimed_ids;
    end if;

    v_state := jsonb_set(v_state, '{cashPayments}', v_payments, true);
    v_state := jsonb_set(
      v_state,
      '{claimedCompensationIds}',
      v_claimed_ids,
      true
    );
  end loop;

  new.state := v_state;
  return new;
end;
$$;

drop trigger if exists game_saves_30_service_compensation_evidence
  on public.game_saves;
create trigger game_saves_30_service_compensation_evidence
  before update of state on public.game_saves
  for each row execute function public.preserve_service_compensation_evidence();

comment on function public.claim_server_instability_compensation_20260814() is
  'Claims one $100M service-instability reward per authenticated account through 2026-08-14 23:59:59.999 KST.';
