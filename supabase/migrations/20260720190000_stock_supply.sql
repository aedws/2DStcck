-- 보통주 전역 유통 재고. 가격·차트는 기존 결정론 클라이언트 시장을 그대로 쓴다.
-- ETF·채권·지수·선물·급등주·관계 보상 우선주는 이 원장에 넣지 않는다.

create table if not exists public.stock_supply (
  stock_id text primary key,
  ticker text not null unique,
  issued_shares numeric(24, 6) not null check (issued_shares > 0),
  float_shares numeric(24, 6) not null check (float_shares > 0 and float_shares <= issued_shares),
  remaining_shares numeric(24, 6) not null check (remaining_shares >= 0 and remaining_shares <= float_shares),
  split_multiplier numeric(24, 8) not null default 1 check (split_multiplier > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_supply_operations (
  user_id uuid not null references auth.users (id) on delete cascade,
  operation_id text not null,
  stock_id text not null references public.stock_supply (stock_id),
  side text not null check (side in ('buy', 'sell')),
  quantity numeric(24, 6) not null check (quantity > 0),
  remaining_after numeric(24, 6) not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

create index if not exists stock_supply_operations_stock_idx
  on public.stock_supply_operations (stock_id, created_at desc);

alter table public.stock_supply enable row level security;
alter table public.stock_supply_operations enable row level security;

drop policy if exists "stock_supply_read_all" on public.stock_supply;
create policy "stock_supply_read_all" on public.stock_supply
  for select using (true);

drop policy if exists "stock_supply_operations_select_own" on public.stock_supply_operations;
create policy "stock_supply_operations_select_own" on public.stock_supply_operations
  for select using (auth.uid() = user_id);

grant select on public.stock_supply to anon, authenticated;
grant select on public.stock_supply_operations to authenticated;
revoke insert, update, delete on public.stock_supply from anon, authenticated;
revoke insert, update, delete on public.stock_supply_operations from anon, authenticated;

insert into public.stock_supply
  (stock_id, ticker, issued_shares, float_shares, remaining_shares)
values
  ('udnge', 'UDGE', 62000000, 29140000, 29140000),
  ('dante', 'DNTE', 149000000, 67050000, 67050000),
  ('baridc', 'BARIDC', 32000000, 18240000, 18240000),
  ('bagdi', 'BAGDI', 80000000, 48800000, 48800000),
  ('bavts', 'BAVTS', 156000000, 92040000, 92040000),
  ('banru', 'BANRU', 113000000, 51980000, 51980000),
  ('bahbk', 'BAHBK', 163000000, 109210000, 109210000),
  ('basmr', 'BASMR', 21000000, 11550000, 11550000),
  ('bakaya', 'BAKAYA', 173000000, 91690000, 91690000),
  ('baabs', 'BAABS', 130000000, 98800000, 98800000),
  ('ba68', 'BA68', 157000000, 92630000, 92630000),
  ('bahina', 'BAHINA', 134000000, 71020000, 71020000),
  ('bahrn', 'BAHRN', 72000000, 41040000, 41040000),
  ('bafka', 'BAFKA', 27000000, 19710000, 19710000),
  ('basena', 'BASENA', 115000000, 51750000, 51750000),
  ('baksm', 'BAKSM', 23000000, 16560000, 16560000),
  ('bakrr', 'BAKRR', 191000000, 105050000, 105050000),
  ('bahnk', 'BAHNK', 32000000, 25280000, 25280000),
  ('baszm', 'BASZM', 120000000, 73200000, 73200000),
  ('baui', 'BAUI', 200000000, 94000000, 94000000),
  ('baair', 'BAAIR', 135000000, 94500000, 94500000),
  ('bamine', 'BAMINE', 78000000, 39780000, 39780000),
  ('batrg', 'BATRG', 33000000, 18810000, 18810000),
  ('bamari', 'BAMARI', 84000000, 42000000, 42000000),
  ('wwjin', 'WWJIN', 99000000, 53460000, 53460000),
  ('wwchl', 'WWCHL', 138000000, 66240000, 66240000),
  ('wwxly', 'WWXLY', 23000000, 12190000, 12190000),
  ('wwjyn', 'WWJYN', 139000000, 98690000, 98690000),
  ('wwskp', 'WWSKP', 126000000, 56700000, 56700000),
  ('wwcam', 'WWCAM', 178000000, 122820000, 122820000),
  ('nkltr', 'NKLTR', 157000000, 80070000, 80070000),
  ('nkvol', 'NKVOL', 166000000, 84660000, 84660000),
  ('nkneo', 'NKNEO', 67000000, 45560000, 45560000),
  ('nkexa', 'NKEXA', 155000000, 75950000, 75950000),
  ('aeyvn', 'AEYVN', 127000000, 81280000, 81280000),
  ('nkilg', 'NKILG', 131000000, 85150000, 85150000),
  ('aegil', 'AEGIL', 69000000, 34500000, 34500000),
  ('wwlne', 'WWLNE', 67000000, 48240000, 48240000),
  ('ersua', 'ERSUA', 35000000, 16100000, 16100000),
  ('nkmna', 'NKMNA', 149000000, 104300000, 104300000),
  ('wwmne', 'WWMNE', 66000000, 40920000, 40920000),
  ('wwlcl', 'WWLCL', 164000000, 118080000, 118080000),
  ('nkccl', 'NKCCL', 28000000, 13160000, 13160000)
on conflict (stock_id) do update set ticker = excluded.ticker;

create or replace function public.adjust_stock_supply(
  p_operation_id text,
  p_stock_id text,
  p_side text,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_supply public.stock_supply%rowtype;
  v_existing public.stock_supply_operations%rowtype;
  v_remaining numeric(24, 6);
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated');
  end if;
  if p_operation_id is null or length(p_operation_id) < 8 or length(p_operation_id) > 120 then
    return jsonb_build_object('success', false, 'code', 'invalid_operation_id');
  end if;
  if p_side not in ('buy', 'sell') or p_quantity <= 0 or round(p_quantity, 6) <> p_quantity then
    return jsonb_build_object('success', false, 'code', 'invalid_request');
  end if;

  select * into v_existing
  from public.stock_supply_operations
  where user_id = v_user_id and operation_id = p_operation_id;
  if found then
    if v_existing.stock_id <> p_stock_id
       or v_existing.side <> p_side
       or v_existing.quantity <> p_quantity then
      return jsonb_build_object('success', false, 'code', 'idempotency_conflict');
    end if;
    return jsonb_build_object(
      'success', true,
      'code', 'already_applied',
      'remaining_shares', v_existing.remaining_after
    );
  end if;

  select * into v_supply
  from public.stock_supply
  where stock_id = p_stock_id
  for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'unknown_stock');
  end if;

  if p_side = 'buy' then
    if v_supply.remaining_shares < p_quantity then
      return jsonb_build_object(
        'success', false,
        'code', 'insufficient_supply',
        'remaining_shares', v_supply.remaining_shares
      );
    end if;
    v_remaining := v_supply.remaining_shares - p_quantity;
  else
    -- 기존 보유분(도입 전 매수 포함)을 팔아도 총 유통량을 넘지 않게 반환한다.
    v_remaining := least(v_supply.float_shares, v_supply.remaining_shares + p_quantity);
  end if;

  update public.stock_supply
  set remaining_shares = v_remaining, updated_at = now()
  where stock_id = p_stock_id;

  insert into public.stock_supply_operations
    (user_id, operation_id, stock_id, side, quantity, remaining_after)
  values
    (v_user_id, p_operation_id, p_stock_id, p_side, p_quantity, v_remaining);

  return jsonb_build_object(
    'success', true,
    'code', 'applied',
    'remaining_shares', v_remaining
  );
end;
$$;

revoke all on function public.adjust_stock_supply(text, text, text, numeric) from public, anon;
grant execute on function public.adjust_stock_supply(text, text, text, numeric) to authenticated;

-- 분할·병합 이력과 관리자용 원자 조정 함수. 같은 event_id 재실행은 무시된다.
create table if not exists public.stock_supply_actions (
  event_id text primary key,
  stock_id text not null references public.stock_supply (stock_id),
  numerator integer not null check (numerator > 0),
  denominator integer not null check (denominator > 0),
  created_at timestamptz not null default now()
);
alter table public.stock_supply_actions enable row level security;
revoke all on public.stock_supply_actions from anon, authenticated;

create or replace function public.apply_stock_split(
  p_event_id text,
  p_stock_id text,
  p_numerator integer,
  p_denominator integer
)
returns public.stock_supply
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.stock_supply%rowtype;
  v_ratio numeric;
begin
  if p_event_id is null or length(p_event_id) < 4
     or p_numerator <= 0 or p_denominator <= 0 then
    raise exception 'invalid_stock_split';
  end if;

  select * into v_result from public.stock_supply where stock_id = p_stock_id for update;
  if not found then raise exception 'unknown_stock'; end if;

  if exists (select 1 from public.stock_supply_actions where event_id = p_event_id) then
    return v_result;
  end if;

  v_ratio := p_numerator::numeric / p_denominator::numeric;
  update public.stock_supply
  set issued_shares = round(issued_shares * v_ratio, 6),
      float_shares = round(float_shares * v_ratio, 6),
      remaining_shares = round(remaining_shares * v_ratio, 6),
      split_multiplier = split_multiplier * v_ratio,
      updated_at = now()
  where stock_id = p_stock_id
  returning * into v_result;

  insert into public.stock_supply_actions (event_id, stock_id, numerator, denominator)
  values (p_event_id, p_stock_id, p_numerator, p_denominator);
  return v_result;
end;
$$;

revoke all on function public.apply_stock_split(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.apply_stock_split(text, text, integer, integer)
  to service_role;

-- 사용 예시(SQL Editor/service role에서만):
-- 5:1 액면분할
-- select public.apply_stock_split('UDGE-2026-08-01-split-5-1', 'udnge', 5, 1);
-- 1:2 주식병합(2주를 1주로)
-- select public.apply_stock_split('UDGE-2026-09-01-merge-1-2', 'udnge', 1, 2);
