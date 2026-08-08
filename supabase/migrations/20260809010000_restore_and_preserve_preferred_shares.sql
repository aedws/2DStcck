-- Restore preferred shares erased by the old diversification rule and make
-- ownership monotonic at the database boundary. Restored face values use the
-- canonical initial stock prices, not contaminated historical face values.

begin;

create schema if not exists admin_rollback;
revoke all on schema admin_rollback from public, anon, authenticated;

create or replace function public.preserve_owned_preferred_shares()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_shares jsonb := case
    when jsonb_typeof(old.state -> 'preferredShares') = 'array'
      then old.state -> 'preferredShares'
    else '[]'::jsonb
  end;
  v_new_shares jsonb := case
    when jsonb_typeof(new.state -> 'preferredShares') = 'array'
      then new.state -> 'preferredShares'
    else '[]'::jsonb
  end;
  v_merged_shares jsonb;
  v_issued_ids jsonb;
begin
  -- Old deployed clients may still send the former destructive reconciliation.
  -- Merge instead of rejecting the save so unrelated progress is not lost.
  with character_ids as (
    select distinct item ->> 'characterId' as character_id
    from jsonb_array_elements(v_old_shares) item
    where coalesce(item ->> 'characterId', '') <> ''
    union
    select distinct item ->> 'characterId'
    from jsonb_array_elements(v_new_shares) item
    where coalesce(item ->> 'characterId', '') <> ''
  ), merged as (
    select
      ids.character_id,
      case
        when new_item.item is null then old_item.item
        when old_item.item is null then new_item.item
        else old_item.item || new_item.item || jsonb_build_object(
          'shares', greatest(
            case when coalesce(old_item.item ->> 'shares', '') ~ '^[0-9]+$'
              then (old_item.item ->> 'shares')::bigint else 0 end,
            case when coalesce(new_item.item ->> 'shares', '') ~ '^[0-9]+$'
              then (new_item.item ->> 'shares')::bigint else 0 end
          )
        )
      end as item
    from character_ids ids
    left join lateral (
      select value as item
      from jsonb_array_elements(v_old_shares)
      where value ->> 'characterId' = ids.character_id
      limit 1
    ) old_item on true
    left join lateral (
      select value as item
      from jsonb_array_elements(v_new_shares)
      where value ->> 'characterId' = ids.character_id
      limit 1
    ) new_item on true
  )
  select coalesce(jsonb_agg(item order by character_id), '[]'::jsonb)
  into v_merged_shares
  from merged
  where item is not null;

  with issued_ids as (
    select value #>> '{}' as character_id
    from jsonb_array_elements(case
      when jsonb_typeof(old.state -> 'preferredIssuedCharacterIds') = 'array'
        then old.state -> 'preferredIssuedCharacterIds'
      else '[]'::jsonb
    end)
    where jsonb_typeof(value) = 'string'
    union
    select value #>> '{}'
    from jsonb_array_elements(case
      when jsonb_typeof(new.state -> 'preferredIssuedCharacterIds') = 'array'
        then new.state -> 'preferredIssuedCharacterIds'
      else '[]'::jsonb
    end)
    where jsonb_typeof(value) = 'string'
    union
    select item ->> 'characterId'
    from jsonb_array_elements(v_merged_shares) item
    where coalesce(item ->> 'characterId', '') <> ''
  )
  select coalesce(jsonb_agg(to_jsonb(character_id) order by character_id), '[]'::jsonb)
  into v_issued_ids
  from issued_ids
  where coalesce(character_id, '') <> '';

  new.state := jsonb_set(new.state, '{preferredShares}', v_merged_shares, true);
  new.state := jsonb_set(
    new.state,
    '{preferredIssuedCharacterIds}',
    v_issued_ids,
    true
  );
  return new;
end;
$$;

revoke all on function public.preserve_owned_preferred_shares()
  from public, anon, authenticated;

drop trigger if exists game_saves_10_preferred_share_preservation
  on public.game_saves;
create trigger game_saves_10_preferred_share_preservation
  before update of state on public.game_saves
  for each row execute function public.preserve_owned_preferred_shares();

create table if not exists admin_rollback.r20260809_preferred_share_restore_before as
select gs.*
from public.game_saves gs
where false;

alter table admin_rollback.r20260809_preferred_share_restore_before
  enable row level security;

create table if not exists admin_rollback.r20260809_preferred_share_restore_targets (
  user_id uuid not null,
  username text not null,
  character_id text not null,
  company_id text not null,
  ticker text not null,
  company_name text not null,
  emoji text not null,
  shares bigint not null check (shares > 0),
  face_value bigint not null check (face_value > 0),
  dividend_per_share bigint not null check (dividend_per_share > 0),
  last_track_price bigint not null check (last_track_price > 0),
  historical_share jsonb,
  recovery_basis text not null,
  primary key (user_id, character_id)
);

alter table admin_rollback.r20260809_preferred_share_restore_targets
  enable row level security;
revoke all on admin_rollback.r20260809_preferred_share_restore_targets
  from public, anon, authenticated;

with definitions (
  username, character_id, company_id, ticker, company_name, emoji,
  shares, face_value, dividend_per_share, last_track_price, recovery_basis
) as (
  values
    ('asterisk7262', 'chr_bahina', 'hinafg',  'HINA', '소라사키 히나 금융지주', '⚡',  1::bigint,  67600::bigint, 270400::bigint, 52000::bigint, 'issued_marker_minimum'),
    ('doglife',      'chr_asuna',  'asuna',   'ASNA', '아스나 유업',             '🥛', 31::bigint,  50700::bigint, 202800::bigint, 39000::bigint, 'backup_exact'),
    ('dorothy',      'chr_bahnk',  'bahnk',   'BAHNK','하나코 교육그룹',          '📚', 39::bigint,  37700::bigint, 150800::bigint, 29000::bigint, 'backup_exact'),
    ('dorothy',      'chr_dorothy','dorothy', 'EDEN', '에덴 오트쿠튀르',          '👑', 31::bigint, 153400::bigint, 613600::bigint,118000::bigint, 'backup_exact'),
    ('dorothy',      'chr_elysia', 'elysia',  'ELYS', '엘리시아 파마',            '🌸', 29::bigint, 111800::bigint, 447200::bigint, 86000::bigint, 'backup_exact'),
    ('sedim',        'chr_miku',   'miku',    'MIKU', '미쿠 엔터테인먼트',         '🎤',  6::bigint,  54600::bigint, 218400::bigint, 42000::bigint, 'backup_exact'),
    ('titia8397',    'chr_ames',   'ames',    'WWAM', '에이메스 엔터테인먼트',     '🎼',  3::bigint,  49400::bigint, 197600::bigint, 38000::bigint, 'backup_exact'),
    ('titia8397',    'chr_elysia', 'elysia',  'ELYS', '엘리시아 파마',            '🌸', 26::bigint, 111800::bigint, 447200::bigint, 86000::bigint, 'backup_exact'),
    ('titia8397',    'chr_monc',   'monc',    'MONC', '몬텔리 캐피탈',            '💼',  7::bigint,  75400::bigint, 301600::bigint, 58000::bigint, 'backup_exact'),
    ('wakamo',       'chr_wakamo', 'wakamo',  'KAMO', '까모투자증권',             '🦊', 16::bigint,  80600::bigint, 322400::bigint, 62000::bigint, 'backup_exact')
), historical_items as (
  select source.user_id, item
  from (
    select user_id, state from admin_rollback.r20260808_1800_game_saves
    union all
    select user_id, state from admin_rollback.r20260808_1800_stabilize_game_saves
    union all
    select user_id, state from admin_rollback.r20260808_1800_finalize_game_saves
  ) source
  cross join lateral jsonb_array_elements(case
    when jsonb_typeof(source.state -> 'preferredShares') = 'array'
      then source.state -> 'preferredShares'
    else '[]'::jsonb
  end) item
), ranked_history as (
  select
    user_id,
    item,
    row_number() over (
      partition by user_id, item ->> 'characterId'
      order by case when coalesce(item ->> 'shares', '') ~ '^[0-9]+$'
        then (item ->> 'shares')::bigint else 0 end desc
    ) as rank
  from historical_items
)
insert into admin_rollback.r20260809_preferred_share_restore_targets (
  user_id, username, character_id, company_id, ticker, company_name, emoji,
  shares, face_value, dividend_per_share, last_track_price,
  historical_share, recovery_basis
)
select
  lb.user_id,
  d.username,
  d.character_id,
  d.company_id,
  d.ticker,
  d.company_name,
  d.emoji,
  d.shares,
  d.face_value,
  d.dividend_per_share,
  d.last_track_price,
  history.item,
  d.recovery_basis
from definitions d
join public.leaderboard lb on lb.display_name = d.username
left join ranked_history history
  on history.user_id = lb.user_id
 and history.item ->> 'characterId' = d.character_id
 and history.rank = 1
on conflict (user_id, character_id) do nothing;

do $$
declare
  v_bad_cash integer;
  v_existing integer;
begin
  if (select count(*) from admin_rollback.r20260809_preferred_share_restore_targets) <> 10
     or (select count(distinct user_id) from admin_rollback.r20260809_preferred_share_restore_targets) <> 6
     or (select sum(shares) from admin_rollback.r20260809_preferred_share_restore_targets) <> 189 then
    raise exception 'preferred-share recovery target set is incomplete';
  end if;

  if (select count(*) from admin_rollback.r20260809_preferred_share_restore_targets
      where recovery_basis = 'backup_exact' and historical_share is not null) <> 9 then
    raise exception 'preferred-share backup evidence is incomplete';
  end if;

  select count(*) into v_existing
  from public.game_saves gs
  join admin_rollback.r20260809_preferred_share_restore_targets t
    on t.user_id = gs.user_id
  cross join lateral jsonb_array_elements(case
    when jsonb_typeof(gs.state -> 'preferredShares') = 'array'
      then gs.state -> 'preferredShares'
    else '[]'::jsonb
  end) item
  where item ->> 'characterId' = t.character_id;
  if v_existing <> 0 then
    raise exception 'one or more recovery targets already owns the preferred share';
  end if;

  with costs as (
    select user_id, sum(shares * face_value)::numeric as restore_cost
    from admin_rollback.r20260809_preferred_share_restore_targets
    group by user_id
  )
  select count(*) into v_bad_cash
  from public.game_saves gs
  join costs c using (user_id)
  where not (coalesce(gs.state ->> 'cashExact', gs.state ->> 'cash', '')
             ~ '^[0-9]+([.][0-9]+)?$')
     or coalesce(gs.state ->> 'cashExact', gs.state ->> 'cash')::numeric
        < c.restore_cost;
  if v_bad_cash <> 0 then
    raise exception 'one or more recovery wallets cannot fund the neutral asset conversion';
  end if;
end;
$$;

insert into admin_rollback.r20260809_preferred_share_restore_before
select gs.*
from public.game_saves gs
where gs.user_id in (
  select distinct user_id
  from admin_rollback.r20260809_preferred_share_restore_targets
)
and not exists (
  select 1
  from admin_rollback.r20260809_preferred_share_restore_before backup
  where backup.user_id = gs.user_id
);

set local app.recovery_bypass = 'on';

with per_user as (
  select
    t.user_id,
    sum(t.shares * t.face_value)::numeric as restore_cost,
    jsonb_agg(
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
        'issuedSession', case
          when coalesce(t.historical_share ->> 'issuedSession', '') ~ '^[0-9]+$'
            then (t.historical_share ->> 'issuedSession')::bigint
          else floor(extract(epoch from clock_timestamp()) / 3600)::bigint
        end,
        'issuedAt', case
          when coalesce(t.historical_share ->> 'issuedAt', '') ~ '^[0-9]+$'
            then (t.historical_share ->> 'issuedAt')::bigint
          else floor(extract(epoch from clock_timestamp()) * 1000)::bigint
        end,
        'lastIssuedSession', case
          when coalesce(t.historical_share ->> 'lastIssuedSession', '') ~ '^[0-9]+$'
            then (t.historical_share ->> 'lastIssuedSession')::bigint
          when coalesce(t.historical_share ->> 'issuedSession', '') ~ '^[0-9]+$'
            then (t.historical_share ->> 'issuedSession')::bigint
          else floor(extract(epoch from clock_timestamp()) / 3600)::bigint
        end
      ) order by t.character_id
    ) as restored_shares,
    jsonb_agg(to_jsonb(t.character_id) order by t.character_id) as restored_ids
  from admin_rollback.r20260809_preferred_share_restore_targets t
  group by t.user_id
), prepared as (
  select
    gs.user_id,
    p.restore_cost,
    p.restored_shares,
    (
      select coalesce(jsonb_agg(to_jsonb(character_id) order by character_id), '[]'::jsonb)
      from (
        select value #>> '{}' as character_id
        from jsonb_array_elements(case
          when jsonb_typeof(gs.state -> 'preferredIssuedCharacterIds') = 'array'
            then gs.state -> 'preferredIssuedCharacterIds'
          else '[]'::jsonb
        end)
        where jsonb_typeof(value) = 'string'
        union
        select value #>> '{}'
        from jsonb_array_elements(p.restored_ids)
      ) ids
      where coalesce(character_id, '') <> ''
    ) as issued_ids,
    coalesce(gs.state ->> 'cashExact', gs.state ->> 'cash')::numeric
      - p.restore_cost as remaining_cash
  from public.game_saves gs
  join per_user p using (user_id)
)
update public.game_saves gs
set state = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              gs.state,
              '{preferredShares}',
              coalesce(gs.state -> 'preferredShares', '[]'::jsonb)
                || prepared.restored_shares,
              true
            ),
            '{preferredIssuedCharacterIds}', prepared.issued_ids, true
          ),
          '{preferredDiversifiedSince}', 'null'::jsonb, true
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
  v_lines integer;
  v_shares numeric;
  v_missing integer;
begin
  select count(*), sum((item ->> 'shares')::numeric)
  into v_lines, v_shares
  from public.game_saves gs
  join admin_rollback.r20260809_preferred_share_restore_targets t
    on t.user_id = gs.user_id
  cross join lateral jsonb_array_elements(gs.state -> 'preferredShares') item
  where item ->> 'characterId' = t.character_id;

  select count(*) into v_missing
  from public.game_saves gs
  join admin_rollback.r20260809_preferred_share_restore_targets t
    on t.user_id = gs.user_id
  where not (gs.state -> 'preferredIssuedCharacterIds' ? t.character_id);

  if v_lines <> 10 or v_shares <> 189 or v_missing <> 0 then
    raise exception 'preferred-share recovery verification failed: lines %, shares %, missing ids %',
      v_lines, v_shares, v_missing;
  end if;
end;
$$;

commit;
