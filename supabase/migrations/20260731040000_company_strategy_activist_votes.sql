-- 행동주의 주주 안건을 기존 90거래일 장기주주 거버넌스와 공통 시장 원장에 연결한다.

alter table public.player_company_governance_proposals
  drop constraint if exists player_company_governance_proposals_proposal_type_check;
alter table public.player_company_governance_proposals
  add constraint player_company_governance_proposals_proposal_type_check
  check (
    proposal_type in (
      'dividend',
      'issue',
      'retire',
      'expansion',
      'ceo_change',
      'asset_sale'
    )
  );

create or replace function public.create_player_company_governance_proposal(
  p_stock_id text,
  p_proposal_type text,
  p_proposed_value numeric
)
returns public.player_company_governance_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_stock_id text := lower(trim(coalesce(p_stock_id, '')));
  v_listing public.player_company_market_listings;
  v_save jsonb;
  v_company jsonb;
  v_session bigint := floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
  v_value numeric := coalesce(p_proposed_value, 0);
  v_row public.player_company_governance_proposals;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select * into v_listing
  from public.player_company_market_listings
  where stock_id = v_stock_id and founder_id = v_user;
  if not found then raise exception 'not_founder'; end if;
  if p_proposal_type not in (
    'dividend',
    'issue',
    'retire',
    'expansion',
    'ceo_change',
    'asset_sale'
  ) then
    raise exception 'invalid_proposal_type';
  end if;
  if exists (
    select 1 from public.player_company_governance_proposals
    where stock_id = v_stock_id and status = 'open'
  ) then
    raise exception 'open_proposal_exists';
  end if;

  if p_proposal_type = 'dividend' then
    if v_value < 0 or v_value > 0.5 then raise exception 'invalid_value'; end if;
  elsif p_proposal_type in ('issue', 'retire', 'asset_sale') then
    if v_value < 0.01 or v_value > 0.2 then raise exception 'invalid_value'; end if;
  else
    v_value := 1;
  end if;

  select state into v_save from public.game_saves where user_id = v_user;
  v_company := v_save -> 'playerCompany';
  insert into public.player_company_governance_proposals (
    stock_id, ticker, company_name, founder_id, proposal_type,
    proposed_value, opened_session, closes_session
  )
  values (
    v_stock_id,
    v_listing.ticker,
    coalesce(v_company ->> 'name', v_listing.ticker),
    v_user,
    p_proposal_type,
    v_value,
    v_session,
    v_session + 24
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- 기존 만기 정산기는 알 수 없는 안건에도 기본 가결/부결 원장을 먼저 만든다.
-- 상태 변경 직후 트리거에서 행동주의 안건의 고유 주가·명성·뉴스 값으로 보정한다.
create or replace function public.apply_player_company_activist_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passed boolean := new.status = 'passed';
  v_factor numeric;
  v_reputation integer;
  v_existing_reputation integer := case when v_passed then 1 else -1 end;
  v_title text;
  v_description text;
begin
  if old.status <> 'open'
     or new.status = 'open'
     or new.proposal_type not in ('ceo_change', 'asset_sale')
  then
    return new;
  end if;

  if new.proposal_type = 'ceo_change' then
    v_factor := case when v_passed then 0.98 else 0.97 end;
    v_reputation := case when v_passed then 4 else -4 end;
    v_title := new.company_name || ' 행동주의 주주총회 · CEO 교체 ' ||
      case when v_passed then '가결' else '부결' end;
    v_description := case
      when v_passed then
        '장기주주의 CEO 교체 요구가 가결됐습니다. 단기 경영 공백으로 주가가 조정되지만 책임 경영 명성은 개선됩니다.'
      else
        'CEO 교체 요구가 부결돼 현 경영진이 유임됐습니다. 주주 갈등과 신뢰 저하가 주가와 회사 명성에 반영됩니다.'
    end;
  else
    v_factor := case when v_passed then 1.035 else 0.985 end;
    v_reputation := case when v_passed then 3 else -2 end;
    v_title := new.company_name || ' 행동주의 주주총회 · 자산 매각 ' ||
      case when v_passed then '가결' else '부결' end;
    v_description := case
      when v_passed then
        '비핵심 자산 매각안이 가결돼 현금과 자본 효율성이 개선됐습니다.'
      else
        '비핵심 자산 매각안이 부결돼 행동주의 주주와의 갈등이 이어집니다.'
    end;
  end if;

  update public.player_company_market_actions
  set price_factor = v_factor,
      decision_type = new.proposal_type,
      headline = v_title,
      description = v_description,
      reputation_delta = v_reputation
  where request_id = new.id;

  perform public.apply_player_company_reputation(
    new.founder_id,
    v_reputation - v_existing_reputation
  );

  update public.player_company_governance_proposals
  set reputation_delta = v_reputation
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists player_company_activist_result_trigger
  on public.player_company_governance_proposals;
create trigger player_company_activist_result_trigger
  after update of status on public.player_company_governance_proposals
  for each row
  when (
    old.status = 'open'
    and new.status in ('passed', 'rejected')
    and new.proposal_type in ('ceo_change', 'asset_sale')
  )
  execute function public.apply_player_company_activist_result();

revoke all on function public.apply_player_company_activist_result()
  from public, anon, authenticated;
