-- 회사 공개 명부에 설립 완료 지갑 객체뿐 아니라 최신 설립 허가 신청도 노출한다.
-- 과거 반려 신청은 후보에서 제외하므로 이후 승인 건을 가리지 않는다.

create or replace function public.list_public_player_companies()
returns table (
  founder_game_id text,
  company_id text,
  company_name text,
  ticker text,
  sector text,
  subsector text,
  description text,
  company_status text,
  founded_at text
)
language sql
stable
security definer
set search_path = ''
as $$
  with saved_companies as (
    select
      saves.user_id,
      accounts.game_id as founder_game_id,
      saves.state -> 'playerCompany' ->> 'id' as company_id,
      saves.state -> 'playerCompany' ->> 'name' as company_name,
      upper(saves.state -> 'playerCompany' ->> 'ticker') as ticker,
      saves.state -> 'playerCompany' ->> 'sector' as sector,
      nullif(saves.state -> 'playerCompany' ->> 'subsector', '') as subsector,
      nullif(saves.state -> 'playerCompany' ->> 'description', '') as description,
      case saves.state -> 'playerCompany' ->> 'status'
        when 'active' then 'active'
        when 'paused' then 'paused'
        when 'ipo-requested' then 'ipo-requested'
        else 'active'
      end as company_status,
      saves.state -> 'playerCompany' ->> 'foundedAt' as founded_at
    from public.game_saves as saves
    join public.game_accounts as accounts on accounts.user_id = saves.user_id
    where jsonb_typeof(saves.state -> 'playerCompany') = 'object'
      and nullif(btrim(saves.state -> 'playerCompany' ->> 'id'), '') is not null
      and nullif(btrim(saves.state -> 'playerCompany' ->> 'name'), '') is not null
      and nullif(btrim(saves.state -> 'playerCompany' ->> 'ticker'), '') is not null
  ),
  approved_requests as (
    select distinct on (requests.user_id)
      requests.user_id,
      requests.id,
      requests.game_id,
      requests.name,
      requests.sector,
      requests.created_at,
      split_part(requests.description, E'\n', 2)::jsonb as payload
    from public.stock_requests as requests
    where requests.status in ('accepted', 'shipped')
      and split_part(requests.description, E'\n', 1) = '[PLAYER_COMPANY_FOUNDATION]'
    order by requests.user_id, requests.updated_at desc, requests.created_at desc
  ),
  directory as (
    select
      saved.founder_game_id,
      saved.company_id,
      saved.company_name,
      saved.ticker,
      saved.sector,
      saved.subsector,
      saved.description,
      saved.company_status,
      saved.founded_at
    from saved_companies as saved

    union all

    select
      approved.game_id as founder_game_id,
      'foundation-request:' || approved.id::text as company_id,
      approved.name as company_name,
      upper(approved.payload ->> 'ticker') as ticker,
      approved.sector,
      nullif(approved.payload ->> 'subsector', '') as subsector,
      nullif(approved.payload ->> 'description', '') as description,
      'foundation-accepted' as company_status,
      floor(extract(epoch from approved.created_at) * 1000)::bigint::text
        as founded_at
    from approved_requests as approved
    where not exists (
      select 1
      from saved_companies as saved
      where saved.user_id = approved.user_id
    )
      and nullif(btrim(approved.name), '') is not null
      and nullif(btrim(approved.payload ->> 'ticker'), '') is not null
  )
  select
    directory.founder_game_id,
    directory.company_id,
    directory.company_name,
    directory.ticker,
    directory.sector,
    directory.subsector,
    directory.description,
    directory.company_status,
    directory.founded_at
  from directory
  order by lower(directory.company_name), directory.founder_game_id
  limit 500;
$$;

revoke all on function public.list_public_player_companies() from public;
grant execute on function public.list_public_player_companies() to anon, authenticated;
