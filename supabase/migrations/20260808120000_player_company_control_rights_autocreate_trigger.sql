-- 신규 상장 시 창업주 지배권(control_rights) 행을 자동 생성한다.
-- 2026-07-31 일회성 백필 이후 상장된 회사(iga·omniro·ksgk·nacm·jbinvb)는 지배권
-- 행이 없어 이사회 분기경영·주주총회 상정 RPC가 not_founder 로 창업주를 거부했다.
-- 트리거로 상장 경로와 무관하게 항상 보장한다.

create or replace function public.ensure_player_company_control_rights()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.player_company_control_rights (
    stock_id, original_founder_id, controller_id, control_source
  )
  values (
    new.stock_id,
    coalesce(new.original_founder_id, new.founder_id),
    new.founder_id,
    'founder'
  )
  on conflict (stock_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ensure_control_rights_on_listing
  on public.player_company_market_listings;
create trigger ensure_control_rights_on_listing
  after insert on public.player_company_market_listings
  for each row execute function public.ensure_player_company_control_rights();

-- 트리거 이전에 상장된 누락분 백필.
insert into public.player_company_control_rights (
  stock_id, original_founder_id, controller_id, control_source
)
select
  listing.stock_id,
  coalesce(listing.original_founder_id, listing.founder_id),
  listing.founder_id,
  'founder'
from public.player_company_market_listings listing
on conflict (stock_id) do nothing;
