-- Apply the four remaining feedback items atomically:
-- 1) enable controller/90-session 3% holder governance proposals,
-- 2) expose a dedicated company governance directory,
-- 3) safely delist LCID and settle all holders at the frozen common quote,
-- 4) close the two deterministic market-phase requests (implemented in app code).

begin;

create schema if not exists admin_rollback;
revoke all on schema admin_rollback from public, anon, authenticated;

create table if not exists admin_rollback.r20260809_remaining_feedback as
select *
from public.feedback
where id in (
  '68f47296-ffe6-4fc5-aa1f-b2c54c17203a'::uuid,
  'e073cd2b-6b89-42a0-935e-ff8135226c5c'::uuid,
  'a01413ed-79ba-4080-92e9-31b88eb4627a'::uuid,
  '66dcab0f-f344-4460-8c56-efa5503968a3'::uuid
);
alter table admin_rollback.r20260809_remaining_feedback enable row level security;

create table if not exists admin_rollback.r20260809_lcid_wallets as
select saves.*
from public.game_saves saves
where saves.user_id = 'c62072f1-cb50-43ea-ba73-554ce39b1b8f'::uuid
   or exists (
     select 1
     from jsonb_array_elements(coalesce(saves.state -> 'holdings', '[]'::jsonb)) holding
     where holding ->> 'stockId' in (
       'lcid', 'lcid-inverse', 'lcid-inverse-2x', 'lcid-leverage-2x'
     )
   );
alter table admin_rollback.r20260809_lcid_wallets enable row level security;

alter table public.player_company_market_listings
  add column if not exists delisted_at timestamptz,
  add column if not exists delisting_price_cents numeric;

create table if not exists public.player_company_delistings (
  stock_id text primary key,
  ticker text not null,
  requested_by uuid not null,
  settlement_price_cents numeric not null check (settlement_price_cents > 0),
  settlement_marker text not null unique,
  delisted_at timestamptz not null,
  settled_wallets integer not null default 0,
  settled_shares numeric not null default 0,
  created_at timestamptz not null default now()
);
alter table public.player_company_delistings enable row level security;
revoke all on public.player_company_delistings from public, anon, authenticated;

insert into public.player_company_delistings (
  stock_id, ticker, requested_by, settlement_price_cents,
  settlement_marker, delisted_at
)
values (
  'lcid', 'LCID', 'c62072f1-cb50-43ea-ba73-554ce39b1b8f'::uuid,
  11900, 'lcid-safe-delisting-20260809', '2026-08-09 00:00:00+00'::timestamptz
)
on conflict (stock_id) do update
set settlement_price_cents = excluded.settlement_price_cents,
    settlement_marker = excluded.settlement_marker,
    delisted_at = excluded.delisted_at;

update public.player_company_market_listings
set delisted_at = '2026-08-09 00:00:00+00'::timestamptz,
    delisting_price_cents = 11900
where stock_id = 'lcid';

create or replace function public.enforce_safe_player_company_delistings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marker constant text := 'lcid-safe-delisting-20260809';
  v_ids constant text[] := array[
    'lcid', 'lcid-inverse', 'lcid-inverse-2x', 'lcid-leverage-2x'
  ];
  v_holding jsonb;
  v_stock_id text;
  v_quantity numeric;
  v_price numeric;
  v_total numeric;
  v_settlement numeric := 0;
  v_cash numeric;
  v_applied jsonb := coalesce(new.state -> 'appliedDelistingIds', '[]'::jsonb);
  v_trades jsonb := coalesce(new.state -> 'trades', '[]'::jsonb);
  v_already_applied boolean;
begin
  v_already_applied := v_applied @> jsonb_build_array(v_marker);

  for v_holding in
    select value
    from jsonb_array_elements(coalesce(new.state -> 'holdings', '[]'::jsonb))
    where value ->> 'stockId' = any(v_ids)
  loop
    v_stock_id := v_holding ->> 'stockId';
    if coalesce(v_holding ->> 'quantityExact', v_holding ->> 'quantity', '0')
       !~ '^([0-9]+)(\.[0-9]{1,6})?$'
    then
      raise exception 'invalid_delisting_quantity';
    end if;
    v_quantity := coalesce(
      nullif(v_holding ->> 'quantityExact', ''),
      nullif(v_holding ->> 'quantity', ''),
      '0'
    )::numeric;
    v_price := case v_stock_id
      when 'lcid' then 11900
      when 'lcid-inverse' then 1448
      when 'lcid-inverse-2x' then 1607
      when 'lcid-leverage-2x' then 2251
    end;
    v_total := round(greatest(0, v_quantity) * v_price);
    v_settlement := v_settlement + v_total;

    if not v_already_applied then
      v_trades := jsonb_build_array(jsonb_build_object(
        'id', 'safe-delist-' || v_stock_id || '-1786233600000',
        'stockId', v_stock_id,
        'ticker', upper(replace(v_stock_id, 'lcid', 'LCID')),
        'type', 'sell',
        'quantity', v_quantity,
        'quantityExact', v_quantity::text,
        'price', v_price,
        'total', v_total,
        'totalExact', v_total::text,
        'timestamp', 1786233600000
      )) || v_trades;
    end if;
  end loop;

  if v_settlement <= 0 then
    return new;
  end if;

  if not v_already_applied then
    if coalesce(new.state ->> 'cashExact', new.state ->> 'cash', '0')
       !~ '^-?([0-9]+)(\.[0-9]+)?$'
    then
      raise exception 'invalid_delisting_cash';
    end if;
    v_cash := coalesce(new.state ->> 'cashExact', new.state ->> 'cash', '0')::numeric
      + v_settlement;
    new.state := jsonb_set(new.state, '{cashExact}', to_jsonb(v_cash::text), true);
    new.state := jsonb_set(new.state, '{cash}', to_jsonb(v_cash), true);
    new.state := jsonb_set(new.state, '{trades}', v_trades, true);
    new.state := jsonb_set(
      new.state,
      '{appliedDelistingIds}',
      v_applied || jsonb_build_array(v_marker),
      true
    );
  end if;

  new.state := jsonb_set(
    new.state,
    '{holdings}',
    coalesce((
      select jsonb_agg(value)
      from jsonb_array_elements(coalesce(new.state -> 'holdings', '[]'::jsonb))
      where value ->> 'stockId' <> all(v_ids)
    ), '[]'::jsonb),
    true
  );
  new.state := jsonb_set(
    new.state,
    '{openOrders}',
    coalesce((
      select jsonb_agg(value)
      from jsonb_array_elements(coalesce(new.state -> 'openOrders', '[]'::jsonb))
      where value ->> 'stockId' <> all(v_ids)
    ), '[]'::jsonb),
    true
  );
  new.state := jsonb_set(
    new.state,
    '{recurringInvestments}',
    coalesce((
      select jsonb_agg(value)
      from jsonb_array_elements(coalesce(new.state -> 'recurringInvestments', '[]'::jsonb))
      where value ->> 'stockId' <> all(v_ids)
    ), '[]'::jsonb),
    true
  );
  return new;
end;
$$;

revoke all on function public.enforce_safe_player_company_delistings()
  from public, anon, authenticated;
drop trigger if exists game_saves_20_safe_player_company_delistings
  on public.game_saves;
create trigger game_saves_20_safe_player_company_delistings
  before insert or update of state on public.game_saves
  for each row execute function public.enforce_safe_player_company_delistings();

-- Trigger the idempotent settlement immediately for the two audited holders.
update public.game_saves saves
set state = saves.state,
    wallet_revision = saves.wallet_revision + 1,
    updated_at = now()
where exists (
  select 1
  from jsonb_array_elements(coalesce(saves.state -> 'holdings', '[]'::jsonb)) holding
  where holding ->> 'stockId' in (
    'lcid', 'lcid-inverse', 'lcid-inverse-2x', 'lcid-leverage-2x'
  )
);

-- Remove the founder's private management object while preserving the historical
-- listing, control and market-action rows as a non-tradable audit trail.
update public.game_saves
set state = jsonb_set(state, '{playerCompany}', 'null'::jsonb, true),
    wallet_revision = wallet_revision + 1,
    updated_at = now()
where user_id = 'c62072f1-cb50-43ea-ba73-554ce39b1b8f'::uuid
  and jsonb_typeof(state -> 'playerCompany') = 'object';

update public.player_company_governance_proposals
set status = 'rejected',
    reputation_delta = coalesce(reputation_delta, 0)
where stock_id = 'lcid' and status = 'open';

update public.player_company_delistings
set settled_wallets = (
      select count(*)::integer
      from admin_rollback.r20260809_lcid_wallets saves
      where exists (
        select 1
        from jsonb_array_elements(coalesce(saves.state -> 'holdings', '[]'::jsonb)) holding
        where holding ->> 'stockId' in (
          'lcid', 'lcid-inverse', 'lcid-inverse-2x', 'lcid-leverage-2x'
        )
      )
    ),
    settled_shares = (
      select coalesce(sum(coalesce(
        nullif(holding ->> 'quantityExact', ''),
        nullif(holding ->> 'quantity', ''),
        '0'
      )::numeric), 0)
      from admin_rollback.r20260809_lcid_wallets saves
      cross join lateral jsonb_array_elements(coalesce(saves.state -> 'holdings', '[]'::jsonb)) holding
      where holding ->> 'stockId' = 'lcid'
    )
where stock_id = 'lcid';

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
  v_control public.player_company_control_rights;
  v_save jsonb;
  v_company jsonb;
  v_session bigint := floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
  v_value numeric := coalesce(p_proposed_value, 0);
  v_quantity numeric := 0;
  v_total_quantity numeric := 0;
  v_held_since bigint;
  v_is_controller boolean := false;
  v_row public.player_company_governance_proposals;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select * into v_listing
  from public.player_company_market_listings
  where stock_id = v_stock_id and delisted_at is null;
  if not found then raise exception 'listing_missing'; end if;

  select * into v_control
  from public.player_company_control_rights
  where stock_id = v_stock_id;
  v_is_controller := found and v_control.controller_id = v_user;

  if not v_is_controller then
    select greatest(0, current_quantity), held_since_session
      into v_quantity, v_held_since
    from public.player_company_shareholder_streaks
    where user_id = v_user and stock_id = v_stock_id;

    select coalesce(sum(greatest(0, current_quantity)), 0)
      into v_total_quantity
    from public.player_company_shareholder_streaks
    where stock_id = v_stock_id;

    if coalesce(v_quantity, 0) <= 0
       or v_held_since is null
       or v_held_since > v_session - 90
       or v_total_quantity <= 0
       or v_quantity / v_total_quantity < 0.03
    then
      raise exception 'not_major_shareholder';
    end if;
  end if;

  if p_proposal_type not in (
    'dividend', 'issue', 'retire', 'expansion', 'ceo_change', 'asset_sale'
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

  select state into v_save
  from public.game_saves
  where user_id = coalesce(v_listing.original_founder_id, v_listing.founder_id);
  v_company := v_save -> 'playerCompany';
  insert into public.player_company_governance_proposals (
    stock_id, ticker, company_name, founder_id, proposal_type,
    proposed_value, opened_session, closes_session
  )
  values (
    v_stock_id,
    v_listing.ticker,
    coalesce(v_company ->> 'name', v_listing.ticker),
    coalesce(v_listing.original_founder_id, v_listing.founder_id),
    p_proposal_type,
    v_value,
    v_session,
    v_session + 24
  )
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.create_player_company_governance_proposal(text, text, numeric)
  from public, anon;
grant execute on function public.create_player_company_governance_proposal(text, text, numeric)
  to authenticated;

create or replace function public.list_player_company_governance_directory()
returns table (
  stock_id text,
  ticker text,
  company_name text,
  founder_game_id text,
  sector text,
  subsector text,
  description text,
  open_proposal_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    listing.stock_id,
    listing.ticker,
    coalesce(company.state -> 'playerCompany' ->> 'name', listing.ticker),
    coalesce(account.game_id, 'unknown'),
    coalesce(company.state -> 'playerCompany' ->> 'sector', '기타'),
    nullif(company.state -> 'playerCompany' ->> 'subsector', ''),
    nullif(company.state -> 'playerCompany' ->> 'description', ''),
    count(proposal.id) filter (where proposal.status = 'open')
  from public.player_company_market_listings listing
  left join public.game_saves company
    on company.user_id = coalesce(listing.original_founder_id, listing.founder_id)
  left join public.game_accounts account
    on account.user_id = coalesce(listing.original_founder_id, listing.founder_id)
  left join public.player_company_governance_proposals proposal
    on proposal.stock_id = listing.stock_id
  where listing.delisted_at is null
  group by
    listing.stock_id,
    listing.ticker,
    company.state,
    account.game_id
  order by lower(coalesce(company.state -> 'playerCompany' ->> 'name', listing.ticker));
$$;

revoke all on function public.list_player_company_governance_directory()
  from public;
grant execute on function public.list_player_company_governance_directory()
  to anon, authenticated;

update public.feedback
set status = 'done',
    admin_note = case id
      when '68f47296-ffe6-4fc5-aa1f-b2c54c17203a'::uuid then
        '요청하신 「뭐임? 왜오름???」 국면을 반영했습니다. 국면 시작 시 실제 기존 국면을 결정론적으로 고른 뒤 80% 지점까지 이름을 숨기고 횡보장·약세장 표시와 수익률을 교대로 보여줍니다. 마지막 20%에는 숨겨진 국면 정체를 공개하고 종가까지 강한 상승 편향을 적용합니다. 모든 계정은 같은 전역 세션에서 같은 위장·공개 결과를 보며 과거 시세는 변경하지 않습니다. 국면 추가 요청 채택 보상 $1,000,000를 지급합니다.'
      when 'e073cd2b-6b89-42a0-935e-ff8135226c5c'::uuid then
        '요청하신 「역사적인 경제위기는 언제나 대전쟁의 불씨였다」 국면을 반영했습니다. 전반 30거래일에는 기존 경제위기 유형 하나를 선택해 전 업종 충격을 1.35배 확대하고, 이어지는 5거래일은 회복·횡보, 남은 25거래일은 기존 전면전 업종 규칙으로 전환합니다. 방산·식품 생산·의료·안전자산과 일반주의 반응이 기존 전쟁 원장을 그대로 따르며 모든 결과는 전역 세션의 순함수입니다. 국면 추가 요청 채택 보상 $1,000,000를 지급합니다.'
      when 'a01413ed-79ba-4080-92e9-31b88eb4627a'::uuid then
        '회사 탭에서 주주총회를 분리해 전용 「주주총회」 탭과 회사별 상세 화면을 추가했습니다. 상장 플레이어 회사가 시장형 카드 목록으로 표시되고, 회사마다 진행 안건·최근 결과·장기주주 투표를 따로 확인합니다. 경영권자뿐 아니라 실제 유통 보유량 3% 이상을 90거래일 연속 보유한 주요 주주도 배당·자사주 소각·CEO 교체·자산 매각 등 안건을 직접 상정할 수 있도록 서버 권한을 확대했습니다. 기능 채택 보상 $50,000를 지급합니다.'
      when '66dcab0f-f344-4460-8c56-efa5503968a3'::uuid then
        '레이크루시드증권(LCID) 삭제 요청을 안전 상장폐지로 완료했습니다. 회사와 연결 파생상품의 신규 거래·모으기·공매도·옵션을 종료하고, 확인된 보유자 2명의 LCID 562,772,694,035,191주를 마지막 공통 시세 $119.00(11,900센트)로 정확한 현금 원장에 일괄 정산했습니다. 구버전 탭이 종목을 다시 저장해도 중복 환급 없이 자동 제거하는 서버 가드와 감사 백업을 추가했습니다. 회사 운영 객체는 제거했으며 과거 차트·기업행동 원장은 감사 기록으로만 보존합니다. 처리 보상 $50,000를 지급합니다.'
    end,
    updated_at = now()
where id in (
  '68f47296-ffe6-4fc5-aa1f-b2c54c17203a'::uuid,
  'e073cd2b-6b89-42a0-935e-ff8135226c5c'::uuid,
  'a01413ed-79ba-4080-92e9-31b88eb4627a'::uuid,
  '66dcab0f-f344-4460-8c56-efa5503968a3'::uuid
)
and status in ('open', 'considering', 'planned');

do $$
begin
  if exists (
    select 1 from public.feedback
    where id in (
      '68f47296-ffe6-4fc5-aa1f-b2c54c17203a'::uuid,
      'e073cd2b-6b89-42a0-935e-ff8135226c5c'::uuid,
      'a01413ed-79ba-4080-92e9-31b88eb4627a'::uuid,
      '66dcab0f-f344-4460-8c56-efa5503968a3'::uuid
    ) and status <> 'done'
  ) then
    raise exception 'remaining_feedback_not_closed';
  end if;
  if exists (
    select 1 from public.game_saves saves
    cross join lateral jsonb_array_elements(coalesce(saves.state -> 'holdings', '[]'::jsonb)) holding
    where holding ->> 'stockId' in (
      'lcid', 'lcid-inverse', 'lcid-inverse-2x', 'lcid-leverage-2x'
    )
  ) then
    raise exception 'lcid_position_remains_after_settlement';
  end if;
end;
$$;

commit;
