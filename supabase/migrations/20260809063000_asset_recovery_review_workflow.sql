-- Asset recovery requests must be verified against server evidence before any
-- money is credited. The review row, exact-once cash adjustment and source
-- report resolution are kept as one auditable workflow.

begin;

create table if not exists public.asset_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in ('bug', 'feedback')),
  report_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null,
  requested_amount_text text,
  status text not null default 'under_review'
    check (status in ('under_review', 'verified', 'paid', 'corrected', 'rejected')),
  verified_amount_cents numeric,
  evidence_note text,
  resolution_note text,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  paid_at timestamptz,
  adjustment_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_kind, report_id),
  check (
    (status = 'under_review' and verified_amount_cents is null) or
    (status in ('verified', 'paid') and verified_amount_cents > 0) or
    (status = 'corrected' and verified_amount_cents <> 0) or
    status = 'rejected'
  )
);

create index if not exists asset_recovery_requests_user_created_idx
  on public.asset_recovery_requests (user_id, created_at desc);
create index if not exists asset_recovery_requests_status_created_idx
  on public.asset_recovery_requests (status, created_at);

alter table public.asset_recovery_requests enable row level security;
revoke all on public.asset_recovery_requests from public, anon, authenticated;
grant select on public.asset_recovery_requests to authenticated;

drop policy if exists "asset_recovery_select_own_or_admin"
  on public.asset_recovery_requests;
create policy "asset_recovery_select_own_or_admin"
  on public.asset_recovery_requests
  for select to authenticated
  using (auth.uid() = user_id or public.is_stock_request_admin());

create or replace function public.queue_asset_recovery_report(
  p_source_kind text,
  p_report_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request_id uuid;
  v_user_id uuid;
  v_game_id text;
  v_description text;
begin
  if not public.is_stock_request_admin() then
    raise exception 'admin_only';
  end if;
  if p_source_kind = 'bug' then
    select user_id, game_id, description
      into v_user_id, v_game_id, v_description
    from public.bug_reports where id = p_report_id;
  elsif p_source_kind = 'feedback' then
    select user_id, game_id, description
      into v_user_id, v_game_id, v_description
    from public.feedback where id = p_report_id;
  else
    raise exception 'invalid_source_kind';
  end if;
  if v_user_id is null then raise exception 'report_not_found'; end if;

  insert into public.asset_recovery_requests (
    source_kind, report_id, user_id, game_id, requested_amount_text
  ) values (
    p_source_kind, p_report_id, v_user_id, v_game_id, v_description
  )
  on conflict (source_kind, report_id) do update
  set updated_at = public.asset_recovery_requests.updated_at
  returning id into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.queue_asset_recovery_report(text, uuid)
  from public, anon;
grant execute on function public.queue_asset_recovery_report(text, uuid)
  to authenticated;

-- New reports that clearly request asset restoration enter review
-- automatically. False positives are safe because this step never pays.
create or replace function public.auto_queue_asset_recovery_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_text text := lower(coalesce(new.title, '') || ' ' || coalesce(new.description, ''));
  v_source text := case when tg_table_name = 'bug_reports' then 'bug' else 'feedback' end;
begin
  if v_text like '%자산%'
     and v_text ~ '(복구|소멸|사라|증발|오염|누락|초기화)' then
    insert into public.asset_recovery_requests (
      source_kind, report_id, user_id, game_id, requested_amount_text
    ) values (
      v_source, new.id, new.user_id, new.game_id, new.description
    ) on conflict (source_kind, report_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists bug_reports_auto_queue_asset_recovery
  on public.bug_reports;
create trigger bug_reports_auto_queue_asset_recovery
  after insert on public.bug_reports
  for each row execute function public.auto_queue_asset_recovery_report();

drop trigger if exists feedback_auto_queue_asset_recovery
  on public.feedback;
create trigger feedback_auto_queue_asset_recovery
  after insert on public.feedback
  for each row execute function public.auto_queue_asset_recovery_report();

-- A queued recovery cannot be closed with the generic report buttons. It must
-- be paid or rejected by the review RPC so the decision remains auditable.
create or replace function public.guard_asset_recovery_report_resolution()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source text := case when tg_table_name = 'bug_reports' then 'bug' else 'feedback' end;
  v_terminal boolean;
begin
  if current_setting('app.asset_recovery_bypass', true) = 'on' then
    return new;
  end if;
  v_terminal := case
    when v_source = 'bug' then new.status in ('fixed', 'wontfix', 'duplicate')
    else new.status in ('done', 'declined')
  end;
  if v_terminal and new.status is distinct from old.status and exists (
    select 1 from public.asset_recovery_requests request
    where request.source_kind = v_source
      and request.report_id = new.id
      and request.status in ('under_review', 'verified')
  ) then
    raise exception 'asset_recovery_requires_review_workflow';
  end if;
  return new;
end;
$$;

drop trigger if exists bug_reports_guard_asset_recovery_resolution
  on public.bug_reports;
create trigger bug_reports_guard_asset_recovery_resolution
  before update of status on public.bug_reports
  for each row execute function public.guard_asset_recovery_report_resolution();

drop trigger if exists feedback_guard_asset_recovery_resolution
  on public.feedback;
create trigger feedback_guard_asset_recovery_resolution
  before update of status on public.feedback
  for each row execute function public.guard_asset_recovery_report_resolution();

create or replace function public.verify_asset_recovery_request(
  p_request_id uuid,
  p_verified_amount_cents numeric,
  p_evidence_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.asset_recovery_requests%rowtype;
begin
  if not public.is_stock_request_admin() then raise exception 'admin_only'; end if;
  if p_verified_amount_cents is null
     or p_verified_amount_cents <= 0
     or p_verified_amount_cents <> trunc(p_verified_amount_cents) then
    raise exception 'verified_amount_must_be_positive_integer_cents';
  end if;
  if char_length(trim(coalesce(p_evidence_note, ''))) < 10 then
    raise exception 'evidence_note_required';
  end if;

  select * into v_request
  from public.asset_recovery_requests
  where id = p_request_id for update;
  if not found then raise exception 'recovery_request_not_found'; end if;
  if v_request.status not in ('under_review', 'verified') then
    raise exception 'recovery_request_not_reviewable';
  end if;

  update public.asset_recovery_requests
  set status = 'verified',
      verified_amount_cents = p_verified_amount_cents,
      evidence_note = trim(p_evidence_note),
      reviewed_by = auth.uid(),
      reviewed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_request_id;

  return jsonb_build_object(
    'status', 'verified',
    'amountCents', p_verified_amount_cents
  );
end;
$$;

revoke all on function public.verify_asset_recovery_request(uuid, numeric, text)
  from public, anon;
grant execute on function public.verify_asset_recovery_request(uuid, numeric, text)
  to authenticated;

create or replace function public.pay_verified_asset_recovery(
  p_request_id uuid,
  p_resolution_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.asset_recovery_requests%rowtype;
  v_adjustment_id text;
  v_note text;
  v_revision bigint;
begin
  if not public.is_stock_request_admin() then raise exception 'admin_only'; end if;
  if char_length(trim(coalesce(p_resolution_note, ''))) < 10 then
    raise exception 'resolution_note_required';
  end if;

  select * into v_request
  from public.asset_recovery_requests
  where id = p_request_id for update;
  if not found then raise exception 'recovery_request_not_found'; end if;
  if v_request.status = 'paid' then
    return jsonb_build_object(
      'status', 'already_paid',
      'amountCents', v_request.verified_amount_cents,
      'walletRevision', 0
    );
  end if;
  if v_request.status <> 'verified' or v_request.verified_amount_cents <= 0 then
    raise exception 'recovery_request_not_verified';
  end if;

  v_adjustment_id := 'asset-recovery-' || v_request.id::text;
  v_note := trim(p_resolution_note);

  insert into public.account_cash_adjustments (
    id, user_id, game_id, amount_cents, reason
  ) values (
    v_adjustment_id,
    v_request.user_id,
    v_request.game_id,
    v_request.verified_amount_cents,
    '검증 완료 자산 복구: ' || v_note
  ) on conflict (id) do nothing;

  perform set_config('app.recovery_bypass', 'on', true);
  update public.game_saves
  set state = state,
      wallet_revision = wallet_revision + 1,
      updated_at = clock_timestamp()
  where user_id = v_request.user_id
  returning wallet_revision into v_revision;
  if v_revision is null then raise exception 'target_game_save_missing'; end if;

  if not exists (
    select 1 from public.account_cash_adjustments
    where id = v_adjustment_id and first_applied_at is not null
  ) then
    raise exception 'recovery_adjustment_not_applied';
  end if;

  update public.asset_recovery_requests
  set status = 'paid',
      resolution_note = v_note,
      paid_at = clock_timestamp(),
      adjustment_id = v_adjustment_id,
      updated_at = clock_timestamp()
  where id = p_request_id;

  perform set_config('app.asset_recovery_bypass', 'on', true);
  if v_request.source_kind = 'bug' then
    update public.bug_reports
    set status = 'fixed', admin_note = v_note, updated_at = clock_timestamp()
    where id = v_request.report_id and user_id = v_request.user_id;
  else
    update public.feedback
    set status = 'done', admin_note = v_note, updated_at = clock_timestamp()
    where id = v_request.report_id and user_id = v_request.user_id;
  end if;

  return jsonb_build_object(
    'status', 'paid',
    'amountCents', v_request.verified_amount_cents,
    'walletRevision', v_revision,
    'adjustmentId', v_adjustment_id
  );
end;
$$;

revoke all on function public.pay_verified_asset_recovery(uuid, text)
  from public, anon;
grant execute on function public.pay_verified_asset_recovery(uuid, text)
  to authenticated;

create or replace function public.reject_asset_recovery_request(
  p_request_id uuid,
  p_resolution_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.asset_recovery_requests%rowtype;
  v_note text := trim(coalesce(p_resolution_note, ''));
begin
  if not public.is_stock_request_admin() then raise exception 'admin_only'; end if;
  if char_length(v_note) < 10 then raise exception 'resolution_note_required'; end if;
  select * into v_request
  from public.asset_recovery_requests
  where id = p_request_id for update;
  if not found then raise exception 'recovery_request_not_found'; end if;
  if v_request.status in ('paid', 'rejected') then
    raise exception 'recovery_request_already_closed';
  end if;

  update public.asset_recovery_requests
  set status = 'rejected',
      verified_amount_cents = null,
      resolution_note = v_note,
      reviewed_by = auth.uid(),
      reviewed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_request_id;

  perform set_config('app.asset_recovery_bypass', 'on', true);
  if v_request.source_kind = 'bug' then
    update public.bug_reports
    set status = 'wontfix', admin_note = v_note, updated_at = clock_timestamp()
    where id = v_request.report_id and user_id = v_request.user_id;
  else
    update public.feedback
    set status = 'declined', admin_note = v_note, updated_at = clock_timestamp()
    where id = v_request.report_id and user_id = v_request.user_id;
  end if;

  return jsonb_build_object('status', 'rejected');
end;
$$;

revoke all on function public.reject_asset_recovery_request(uuid, text)
  from public, anon;
grant execute on function public.reject_asset_recovery_request(uuid, text)
  to authenticated;

-- Queue the five currently open DB-corruption/asset-recovery reports. The rows
-- remain under review and therefore credit nothing until evidence is entered.
insert into public.asset_recovery_requests (
  source_kind, report_id, user_id, game_id, requested_amount_text
)
select 'bug', report.id, report.user_id, report.game_id, report.description
from public.bug_reports report
where report.id in (
  '531edb9f-c104-457e-bc49-9de4c3737d15'::uuid,
  '878e36e6-6320-46ba-9498-6bc9b3b2fd72'::uuid,
  'ff141d61-f329-4d46-84c1-776f7095fe92'::uuid,
  '2c1bde9f-9810-45bf-b403-439bfece9730'::uuid,
  '838b6ac7-1f91-4d5f-b23a-ef2128dd029c'::uuid
)
on conflict (source_kind, report_id) do nothing;

insert into public.asset_recovery_requests (
  source_kind, report_id, user_id, game_id, requested_amount_text
)
select 'feedback', report.id, report.user_id, report.game_id, report.description
from public.feedback report
where report.id = '04b50a1e-3e33-4e17-8649-1a22dc999e1c'::uuid
on conflict (source_kind, report_id) do nothing;

commit;
