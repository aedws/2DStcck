-- 2026-07-26 승인 IPO 4건을 오전·오후·저녁·밤으로 분산한다.
-- 플레이어 회사는 정적 종목이 먼저 배포돼도 ipoListingAt 전에는
-- `ipo-requested` 상태를 유지하고 창업주 지분도 계좌에 반영하지 않는다.

update public.stock_requests
set
  status = 'shipped',
  admin_note = '플레이어 회사 주붕투자증권(JBINV)을 2026-07-26 09:00 KST 상장 일정으로 반영했습니다. 상장 시각 전에는 거래·시세·창업주 지분 반영이 잠기며, 개장 시 창업주 보통주가 계좌에 1회 반영됩니다.',
  updated_at = now()
where id = '8c7a2e1c-f438-48ce-89bc-caf5c29aa7bf'
  and lower(game_id) = 'gudokza111'
  and name ilike '%JBINV%'
  and status in ('pending', 'reviewing', 'accepted', 'shipped');

update public.stock_requests
set
  status = 'shipped',
  admin_note = '홍루 은행(HONGL)을 2026-07-26 14:00 KST 상장 일정으로 반영했습니다. 높은 자기자본비율과 고금리·약세장 방어 성향, 순수 은행업 구조를 적용했습니다.',
  updated_at = now()
where id = 'ce058cb3-a766-49c0-9619-e1c160ba864a'
  and lower(game_id) = 'warning'
  and name ilike '%홍루%'
  and status in ('pending', 'reviewing', 'accepted', 'shipped');

update public.stock_requests
set
  status = 'shipped',
  admin_note = '플레이어 회사 파급효과(PGHG)를 2026-07-26 19:00 KST 상장 일정으로 반영했습니다. 상장 시각 전에는 거래·시세·창업주 지분 반영이 잠기며, 기존 10% 희석을 보존한 창업주 보통주가 개장 시 계좌에 1회 반영됩니다.',
  updated_at = now()
where id = '47f4569e-e7f9-4c85-9a20-966a82da5ef5'
  and lower(game_id) = 'sedim'
  and name ilike '%PGHG%'
  and status in ('pending', 'reviewing', 'accepted', 'shipped');

update public.stock_requests
set
  status = 'shipped',
  admin_note = '플레이어 회사 에이메스 네트웍스(AMNW)를 2026-07-26 22:00 KST 상장 일정으로 반영했습니다. 상장 시각 전에는 거래·시세·창업주 지분 반영이 잠기며, 개장 시 창업주 보통주가 계좌에 1회 반영됩니다.',
  updated_at = now()
where id = 'e60bbdb2-9291-4f82-8ecd-75ac009b1313'
  and lower(game_id) = 'titia8397'
  and name ilike '%AMNW%'
  and status in ('pending', 'reviewing', 'accepted', 'shipped');

with schedules(ticker, stock_id, listing_at) as (
  values
    ('JBINV', 'jbinv', 1785024000000::bigint),
    ('PGHG', 'pghg', 1785060000000::bigint),
    ('AMNW', 'amnw', 1785070800000::bigint)
)
update public.game_saves as saves
set
  state = jsonb_set(
    jsonb_set(
      jsonb_set(
        saves.state,
        '{playerCompany,status}',
        to_jsonb('ipo-requested'::text),
        true
      ),
      '{playerCompany,ipoListingStockId}',
      to_jsonb(schedules.stock_id),
      true
    ),
    '{playerCompany,ipoListingAt}',
    to_jsonb(schedules.listing_at),
    true
  ),
  wallet_revision = saves.wallet_revision + 1,
  updated_at = now()
from schedules
where upper(saves.state -> 'playerCompany' ->> 'ticker') = schedules.ticker
  and jsonb_typeof(saves.state -> 'playerCompany') = 'object';

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
        when 'listed' then 'listed'
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
