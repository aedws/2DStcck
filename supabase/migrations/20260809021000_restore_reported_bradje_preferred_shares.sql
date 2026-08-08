-- Follow-up recovery for the original preferred-share deletion report.
-- The former client removed both the shares and issued-character marker, so
-- this account could not be discovered by the first marker/backup-only audit.

begin;

create schema if not exists admin_rollback;
revoke all on schema admin_rollback from public, anon, authenticated;

create table if not exists admin_rollback.r20260809_reported_preferred_restore_before as
select gs.*
from public.game_saves gs
join public.leaderboard lb using (user_id)
where lb.display_name = 'bradje';

alter table admin_rollback.r20260809_reported_preferred_restore_before
  enable row level security;

do $$
declare
  v_user_id uuid;
  v_cash numeric;
begin
  select lb.user_id
  into strict v_user_id
  from public.leaderboard lb
  where lb.display_name = 'bradje';

  if not exists (
    select 1
    from public.bug_reports report
    where report.user_id = v_user_id
      and (report.title ilike '%우선주%' or report.description ilike '%우선주%')
      and report.description ilike '%30%'
      and report.description ilike '%사라%'
  ) then
    raise exception 'reported preferred-share deletion evidence is missing';
  end if;

  if coalesce((
    select (gs.state #>> '{characterProgress,chr_bahina,affinity}')::numeric
    from public.game_saves gs
    where gs.user_id = v_user_id
  ), 0) < 100 then
    raise exception 'reported preferred-share character evidence is missing';
  end if;

  if exists (
    select 1
    from public.game_saves gs
    cross join lateral jsonb_array_elements(case
      when jsonb_typeof(gs.state -> 'preferredShares') = 'array'
        then gs.state -> 'preferredShares'
      else '[]'::jsonb
    end) item
    where gs.user_id = v_user_id
      and item ->> 'characterId' = 'chr_bahina'
  ) then
    raise exception 'reported preferred share is already present';
  end if;

  select coalesce(gs.state ->> 'cashExact', gs.state ->> 'cash')::numeric
  into strict v_cash
  from public.game_saves gs
  where gs.user_id = v_user_id;

  if v_cash < 2028000 then
    raise exception 'reported preferred-share wallet cannot fund neutral conversion';
  end if;
end;
$$;

insert into admin_rollback.r20260809_preferred_share_restore_targets (
  user_id, username, character_id, company_id, ticker, company_name, emoji,
  shares, face_value, dividend_per_share, last_track_price,
  historical_share, recovery_basis
)
select
  lb.user_id,
  'bradje',
  'chr_bahina',
  'hinafg',
  'HINA',
  '소라사키 히나 금융지주',
  '⚡',
  30,
  67600,
  270400,
  52000,
  null,
  'bug_report_exact_quantity'
from public.leaderboard lb
where lb.display_name = 'bradje'
on conflict (user_id, character_id) do nothing;

set local app.recovery_bypass = 'on';

with target as (
  select
    t.user_id,
    t.shares * t.face_value as restore_cost,
    jsonb_build_object(
      'characterId', t.character_id,
      'companyId', t.company_id,
      'ticker', t.ticker,
      'companyName', t.company_name,
      'emoji', t.emoji,
      'shares', t.shares,
      'faceValue', t.face_value,
      'dividendPerShare', t.dividend_per_share,
      'lastTrackPrice', t.last_track_price,
      'issuedSession', floor(extract(epoch from report.created_at) / 3600)::bigint,
      'issuedAt', floor(extract(epoch from report.created_at) * 1000)::bigint,
      'lastIssuedSession', floor(extract(epoch from report.created_at) / 3600)::bigint
    ) as restored_share
  from admin_rollback.r20260809_preferred_share_restore_targets t
  join lateral (
    select created_at
    from public.bug_reports
    where user_id = t.user_id
      and (title ilike '%우선주%' or description ilike '%우선주%')
    order by created_at
    limit 1
  ) report on true
  where t.username = 'bradje'
    and t.character_id = 'chr_bahina'
), prepared as (
  select
    gs.user_id,
    target.restore_cost,
    target.restored_share,
    coalesce(gs.state ->> 'cashExact', gs.state ->> 'cash')::numeric
      - target.restore_cost as remaining_cash,
    (
      select coalesce(
        jsonb_agg(to_jsonb(character_id) order by character_id),
        '[]'::jsonb
      )
      from (
        select value #>> '{}' as character_id
        from jsonb_array_elements(case
          when jsonb_typeof(gs.state -> 'preferredIssuedCharacterIds') = 'array'
            then gs.state -> 'preferredIssuedCharacterIds'
          else '[]'::jsonb
        end)
        where jsonb_typeof(value) = 'string'
        union
        select 'chr_bahina'
      ) ids
    ) as issued_ids
  from public.game_saves gs
  join target using (user_id)
)
update public.game_saves gs
set state = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            gs.state,
            '{preferredShares}',
            (case
              when jsonb_typeof(gs.state -> 'preferredShares') = 'array'
                then gs.state -> 'preferredShares'
              else '[]'::jsonb
            end) || jsonb_build_array(prepared.restored_share),
            true
          ),
          '{preferredIssuedCharacterIds}', prepared.issued_ids, true
        ),
        '{cash}', to_jsonb(prepared.remaining_cash), true
      ),
      '{cashExact}', to_jsonb(prepared.remaining_cash::text), true
    ),
    wallet_revision = gs.wallet_revision + 1,
    updated_at = now()
from prepared
where gs.user_id = prepared.user_id;

do $$
declare
  v_shares bigint;
  v_cash_delta numeric;
begin
  select (item ->> 'shares')::bigint
  into strict v_shares
  from public.game_saves gs
  join public.leaderboard lb using (user_id)
  cross join lateral jsonb_array_elements(gs.state -> 'preferredShares') item
  where lb.display_name = 'bradje'
    and item ->> 'characterId' = 'chr_bahina';

  select
    (coalesce(backup.state ->> 'cashExact', backup.state ->> 'cash'))::numeric
      - (coalesce(gs.state ->> 'cashExact', gs.state ->> 'cash'))::numeric
  into strict v_cash_delta
  from admin_rollback.r20260809_reported_preferred_restore_before backup
  join public.game_saves gs using (user_id);

  if v_shares <> 30 or v_cash_delta <> 2028000 then
    raise exception 'reported preferred-share recovery verification failed';
  end if;
end;
$$;

commit;
