-- 회사 탭의 공개 회사 명부. 비공개 지갑 JSON 전체는 노출하지 않고
-- 회사 소개와 설립자 게임 ID만 제한적으로 반환한다.

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
  select
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
  order by lower(saves.state -> 'playerCompany' ->> 'name'), accounts.game_id
  limit 500;
$$;

revoke all on function public.list_public_player_companies() from public;
grant execute on function public.list_public_player_companies() to anon, authenticated;
