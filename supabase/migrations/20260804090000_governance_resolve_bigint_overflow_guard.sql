-- 회생·초고액 계정 등에서 회사 발행 좌수(totalShares/publicShares)가 bigint 범위
-- (9,223,372,036,854,775,807)를 넘으면, resolve_due_player_company_governance()의
-- `::bigint` 캐스트가 "value out of range"로 던져 배치 전체가 롤백된다. 그 결과 도래한
-- 이사회 분기 경영·주주총회 안건이 전부 미해결(D-0 고착)로 남는다(버그리포트 6b951861).
--
-- 좌수 관련 캐스트를 numeric 경유로 bigint 범위에 클램프해 오버플로 없이 항상 해결되게
-- 한다. 정상 범위 값에는 영향이 없고, 범위를 넘는 비정상 값만 상한으로 접힌다.
create or replace function public.resolve_due_player_company_governance()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session bigint := floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
  v_epoch_seconds bigint := 1783728000;
  v_count integer := 0;
  v_decision public.player_company_board_decisions;
  v_proposal public.player_company_governance_proposals;
  v_state public.player_company_market_state;
  v_save jsonb;
  v_company jsonb;
  v_total bigint;
  v_public bigint;
  v_shares bigint;
  v_total_after bigint;
  v_public_after bigint;
  v_factor numeric;
  v_rep integer;
  v_yes numeric;
  v_no numeric;
  v_passed boolean;
  v_tick bigint;
  v_patch jsonb;
  v_headline text;
  v_description text;
begin
  for v_decision in
    select * from public.player_company_board_decisions
    where status = 'pending' and resolve_session <= v_session
    order by resolve_session, id
    for update skip locked
  loop
    select state into v_save
    from public.game_saves
    where user_id = v_decision.founder_id;
    v_company := v_save -> 'playerCompany';
    v_total := least(9223372036854775807::numeric, greatest(1::numeric, floor(coalesce(nullif(v_company ->> 'totalShares', '')::numeric, 1))))::bigint;
    v_public := least(9223372036854775807::numeric, greatest(0::numeric, floor(coalesce(nullif(v_company ->> 'publicShares', '')::numeric, 0))))::bigint;
    v_tick := greatest(0, v_decision.resolve_session * 3600 - v_epoch_seconds);
    select greatest(v_tick, coalesce(max(effective_tick) + 1, v_tick))
      into v_tick
    from public.player_company_market_actions
    where stock_id = v_decision.stock_id;

    v_headline := v_decision.ticker || ' 분기 실적 · ' || v_decision.outcome_label;
    v_description :=
      '이사회 선택이 다음 분기 매출 성장률에 ' ||
      case when v_decision.earnings_growth_delta >= 0 then '+' else '' end ||
      v_decision.earnings_growth_delta::text ||
      '%p 반영됐습니다. 회사 명성 ' ||
      case when v_decision.reputation_delta >= 0 then '+' else '' end ||
      v_decision.reputation_delta::text || '.';

    insert into public.player_company_market_actions (
      request_id, stock_id, ticker, action_type, shares,
      total_shares_before, public_shares_before,
      total_shares_after, public_shares_after,
      price_factor, price_cents, effective_tick, declared_by,
      decision_type, headline, description,
      reputation_delta, earnings_growth_delta
    )
    values (
      v_decision.id, v_decision.stock_id, v_decision.ticker, 'board', 0,
      v_total, v_public, v_total, v_public,
      v_decision.price_factor, 1, v_tick, v_decision.founder_id,
      v_decision.decision_type, v_headline, v_description,
      v_decision.reputation_delta, v_decision.earnings_growth_delta
    )
    on conflict (request_id) do nothing;

    perform public.apply_player_company_reputation(
      v_decision.founder_id,
      v_decision.reputation_delta
    );
    update public.player_company_board_decisions
    set status = 'resolved', resolved_at = now()
    where id = v_decision.id;
    v_count := v_count + 1;
  end loop;

  for v_proposal in
    select * from public.player_company_governance_proposals
    where status = 'open' and closes_session <= v_session
    order by closes_session, id
    for update skip locked
  loop
    select
      coalesce(sum(voting_weight) filter (where vote = 'yes'), 0),
      coalesce(sum(voting_weight) filter (where vote = 'no'), 0)
    into v_yes, v_no
    from public.player_company_governance_votes
    where proposal_id = v_proposal.id;
    v_passed := v_yes > v_no and v_yes > 0;

    select state into v_save
    from public.game_saves
    where user_id = v_proposal.founder_id
    for update;
    v_company := v_save -> 'playerCompany';
    v_total := least(9223372036854775807::numeric, greatest(1::numeric, floor(coalesce(nullif(v_company ->> 'totalShares', '')::numeric, 1))))::bigint;
    v_public := least(9223372036854775807::numeric, greatest(0::numeric, floor(coalesce(nullif(v_company ->> 'publicShares', '')::numeric, 0))))::bigint;
    insert into public.player_company_market_state (
      stock_id, ticker, founder_id, total_shares, public_shares
    )
    values (
      v_proposal.stock_id, v_proposal.ticker, v_proposal.founder_id,
      v_total, v_public
    )
    on conflict (stock_id) do nothing;
    select * into v_state
    from public.player_company_market_state
    where stock_id = v_proposal.stock_id
    for update;
    v_total := v_state.total_shares;
    v_public := v_state.public_shares;
    v_shares := 0;
    v_total_after := v_total;
    v_public_after := v_public;
    v_factor := case when v_passed then 1 else 0.99 end;
    v_rep := case when v_passed then 1 else -1 end;
    v_patch := '{}'::jsonb;

    if v_passed and v_proposal.proposal_type = 'dividend' then
      v_factor := 1.02;
      v_rep := 3;
      v_patch := jsonb_build_object('dividendRate', v_proposal.proposed_value);
    elsif v_passed and v_proposal.proposal_type = 'issue' then
      v_shares := least(9223372036854775807::numeric, greatest(1::numeric, ceil(v_total::numeric * v_proposal.proposed_value)))::bigint;
      v_total_after := least(9223372036854775807::numeric, v_total::numeric + v_shares::numeric)::bigint;
      v_public_after := least(9223372036854775807::numeric, v_public::numeric + v_shares::numeric)::bigint;
      v_factor := greatest(0.85, v_total::numeric / v_total_after::numeric);
      v_rep := -2;
      v_patch := jsonb_build_object(
        'totalShares', v_total_after,
        'publicShares', v_public_after
      );
    elsif v_passed and v_proposal.proposal_type = 'retire' then
      v_shares := least(
        v_public::numeric,
        least(9223372036854775807::numeric, greatest(1::numeric, ceil(v_public::numeric * v_proposal.proposed_value)))
      )::bigint;
      if v_shares > 0 and v_shares < v_total then
        v_total_after := v_total - v_shares;
        v_public_after := v_public - v_shares;
        v_factor := least(1.15, v_total::numeric / v_total_after::numeric);
        v_rep := 3;
        v_patch := jsonb_build_object(
          'totalShares', v_total_after,
          'publicShares', v_public_after
        );
      end if;
    elsif v_passed and v_proposal.proposal_type = 'expansion' then
      v_factor := 1.04;
      v_rep := 5;
    end if;

    update public.player_company_market_state
    set total_shares = v_total_after,
        public_shares = v_public_after,
        updated_at = now()
    where stock_id = v_proposal.stock_id;

    v_tick := greatest(0, v_proposal.closes_session * 3600 - v_epoch_seconds);
    select greatest(v_tick, coalesce(max(effective_tick) + 1, v_tick))
      into v_tick
    from public.player_company_market_actions
    where stock_id = v_proposal.stock_id;
    v_headline :=
      v_proposal.company_name || ' 주주총회 · ' ||
      case when v_passed then '안건 가결' else '안건 부결' end;
    v_description :=
      case v_proposal.proposal_type
        when 'dividend' then '다음 1회 배당 예산 조정'
        when 'issue' then '신주 발행'
        when 'retire' then '자사주 소각'
        else '사업 확장'
      end ||
      ' 안건이 ' || case when v_passed then '가결' else '부결' end ||
      '됐습니다. 찬성 ' || round(v_yes, 2)::text ||
      '표, 반대 ' || round(v_no, 2)::text || '표.';

    insert into public.player_company_market_actions (
      request_id, stock_id, ticker, action_type, shares,
      total_shares_before, public_shares_before,
      total_shares_after, public_shares_after,
      price_factor, price_cents, effective_tick, declared_by,
      decision_type, headline, description,
      reputation_delta, earnings_growth_delta
    )
    values (
      v_proposal.id, v_proposal.stock_id, v_proposal.ticker, 'governance',
      v_shares, v_total, v_public, v_total_after, v_public_after,
      v_factor, 1, v_tick, v_proposal.founder_id,
      v_proposal.proposal_type, v_headline, v_description,
      v_rep, 0
    )
    on conflict (request_id) do nothing;

    perform public.apply_player_company_reputation(
      v_proposal.founder_id,
      v_rep,
      v_patch
    );
    update public.player_company_governance_proposals
    set
      status = case when v_passed then 'passed' else 'rejected' end,
      reputation_delta = v_rep,
      resolved_at = now()
    where id = v_proposal.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
