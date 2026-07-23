-- Restore the season 1 operational Master award that was accidentally removed
-- while resetting only the active performance baseline for season 2.
create or replace function public.season_one_master_archive()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'id', 'season-1-master-award',
    'number', 1,
    'startSession', 495580,
    'endSession', 495600,
    'startEquity', 1,
    'startBenchmarkPrice', 1,
    'minimumEquity', 1,
    'peakEquity', 1,
    'maximumDrawdown', 0,
    'startExternalCashTotal', 0,
    'completedAt', 1784160000000,
    'playerReturn', 0,
    'benchmarkReturn', 0,
    'alpha', 0,
    'maxDrawdown', 0,
    'tierId', 'master',
    'seasonScore', 100,
    'baseScore', 100,
    'goalBonus', 0,
    'goalPenalty', 0,
    'goalComplianceRate', 1,
    'traitScore', 0,
    'operationalAward', true
  );
$$;

create or replace function public.ensure_season_one_history(p_history jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_input jsonb := case
    when jsonb_typeof(p_history) = 'array' then p_history
    else '[]'::jsonb
  end;
  v_competitive jsonb;
begin
  select coalesce(jsonb_agg(item order by season_number desc), '[]'::jsonb)
  into v_competitive
  from (
    select
      item,
      case
        when coalesce(item ->> 'number', '') ~ '^[0-9]+$'
          then (item ->> 'number')::integer
        else 0
      end as season_number
    from jsonb_array_elements(v_input) as item
    where not (
      coalesce(item ->> 'number', '') ~ '^[0-9]+$'
      and (item ->> 'number')::integer = 1
    )
    order by season_number desc
    limit 19
  ) as retained;

  return v_competitive || jsonb_build_array(public.season_one_master_archive());
end;
$$;

create or replace function public.ensure_season_one_seen(p_seen jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_input jsonb := case
    when jsonb_typeof(p_seen) = 'array' then p_seen
    else '[]'::jsonb
  end;
  v_retained jsonb;
begin
  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_retained
  from (
    select item
    from jsonb_array_elements(v_input) as item
    where item <> to_jsonb('season-1-master-award'::text)
    limit 49
  ) as retained;

  return v_retained || jsonb_build_array(to_jsonb('season-1-master-award'::text));
end;
$$;

-- Backfill every save. Epoch 2 active tracking is preserved; only stale active
-- baselines are cleared. Completed history is retained and season 1 is restored.
with normalized as (
  select
    user_id,
    case
      when jsonb_typeof(state -> 'investmentSeason') = 'object'
        then state -> 'investmentSeason'
      else '{}'::jsonb
    end as season
  from public.game_saves
)
update public.game_saves as saves
set state = jsonb_set(
      saves.state,
      '{investmentSeason}',
      normalized.season || jsonb_build_object(
        'trackingEpoch', 2,
        'current', case
          when coalesce(normalized.season ->> 'trackingEpoch', '') ~ '^[0-9]+$'
            and (normalized.season ->> 'trackingEpoch')::integer >= 2
            then coalesce(normalized.season -> 'current', 'null'::jsonb)
          else 'null'::jsonb
        end,
        'history', public.ensure_season_one_history(normalized.season -> 'history'),
        'seenCeremonyIds', public.ensure_season_one_seen(normalized.season -> 'seenCeremonyIds')
      ),
      true
    ),
    updated_at = now()
from normalized
where normalized.user_id = saves.user_id;

-- Old clients may still submit an epoch-less state. Reset only their active
-- baseline while preserving all completed seasons and the season 1 award.
create or replace function public.enforce_investment_season_tracking_epoch()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_season jsonb;
  v_epoch integer;
  v_current jsonb;
begin
  v_season := case
    when jsonb_typeof(new.state -> 'investmentSeason') = 'object'
      then new.state -> 'investmentSeason'
    else '{}'::jsonb
  end;
  v_epoch := case
    when coalesce(v_season ->> 'trackingEpoch', '') ~ '^[0-9]+$'
      then (v_season ->> 'trackingEpoch')::integer
    else 0
  end;
  v_current := case
    when v_epoch >= 2 then coalesce(v_season -> 'current', 'null'::jsonb)
    else 'null'::jsonb
  end;

  new.state := jsonb_set(
    new.state,
    '{investmentSeason}',
    v_season || jsonb_build_object(
      'trackingEpoch', 2,
      'current', v_current,
      'history', public.ensure_season_one_history(v_season -> 'history'),
      'seenCeremonyIds', public.ensure_season_one_seen(v_season -> 'seenCeremonyIds')
    ),
    true
  );
  return new;
end;
$$;

drop trigger if exists game_saves_investment_season_epoch on public.game_saves;
create trigger game_saves_investment_season_epoch
before insert or update of state on public.game_saves
for each row execute function public.enforce_investment_season_tracking_epoch();
