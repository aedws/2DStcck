-- 관리자 즉시 IPO(동적 상장) — 코드 배포 없이 런타임에 상장하는 종목을 저장한다.
-- 시장은 종목별 (틱, id) 시드 난수로 가격을 만들어, 미래 시각에 상장하는 독립 종목을
-- 추가해도 기존 종목·번들 체크포인트·클라이언트 간 일치에 영향이 없다(MARKET_SIM_VERSION
-- 불변). 모든 클라이언트가 이 테이블을 읽어 같은 정의를 병합하므로 desync가 없다.
--
-- 읽기: 활성 항목은 전체 공개(anon·authenticated). 쓰기: 관리자(is_stock_request_admin)만
-- SECURITY DEFINER RPC 로 가능. 상장 시각은 반드시 미래여야 한다(과거 상장은 desync 유발).

create table if not exists public.ipo_listings (
  id text primary key,
  ticker text not null,
  name text not null,
  sector text not null,
  active boolean not null default true,
  listing_epoch_ms bigint not null,
  payload jsonb not null,
  created_by uuid,
  game_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ipo_listings_active_idx
  on public.ipo_listings (active, listing_epoch_ms);

alter table public.ipo_listings enable row level security;
revoke all on public.ipo_listings from public, anon, authenticated;
grant select on public.ipo_listings to anon, authenticated;

drop policy if exists ipo_listings_read on public.ipo_listings;
create policy ipo_listings_read on public.ipo_listings
  for select to anon, authenticated using (active = true);

-- 관리자는 비활성 항목도 볼 수 있어야 재활성화할 수 있다(정책은 OR로 합쳐진다).
drop policy if exists ipo_listings_admin_read on public.ipo_listings;
create policy ipo_listings_admin_read on public.ipo_listings
  for select to authenticated using (public.is_stock_request_admin());

-- 관리자 전용: 상장 등록/수정(upsert). payload 에서 핵심 필드를 뽑아 컬럼에 반영한다.
create or replace function public.upsert_ipo_listing(p_payload jsonb)
returns public.ipo_listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ipo_listings;
  v_id text;
  v_listing_ms bigint;
  v_now_ms bigint;
begin
  if not public.is_stock_request_admin() then
    raise exception 'not_admin';
  end if;

  v_id := lower(btrim(coalesce(p_payload ->> 'id', '')));
  if v_id !~ '^[a-z][a-z0-9]{1,11}$' then
    raise exception 'invalid_id';
  end if;

  v_listing_ms := (p_payload ->> 'listingEpochMs')::bigint;
  v_now_ms := (extract(epoch from now()) * 1000)::bigint;
  -- 이미 상장 시각이 지난 항목은 클라이언트 간 desync를 유발하므로 거부한다.
  if v_listing_ms is null or v_listing_ms <= v_now_ms then
    raise exception 'listing_must_be_future';
  end if;

  insert into public.ipo_listings
    (id, ticker, name, sector, active, listing_epoch_ms, payload,
     created_by, game_id, updated_at)
  values
    (v_id,
     upper(btrim(coalesce(p_payload ->> 'ticker', ''))),
     btrim(coalesce(p_payload ->> 'name', '')),
     btrim(coalesce(p_payload ->> 'sector', '')),
     true,
     v_listing_ms,
     p_payload,
     auth.uid(),
     nullif(btrim(coalesce(p_payload ->> 'gameId', '')), ''),
     now())
  on conflict (id) do update set
    ticker = excluded.ticker,
    name = excluded.name,
    sector = excluded.sector,
    active = true,
    listing_epoch_ms = excluded.listing_epoch_ms,
    payload = excluded.payload,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- 관리자 전용: 상장 활성/비활성 토글(비활성 시 모든 클라이언트 목록에서 사라진다).
create or replace function public.set_ipo_listing_active(p_id text, p_active boolean)
returns public.ipo_listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ipo_listings;
begin
  if not public.is_stock_request_admin() then
    raise exception 'not_admin';
  end if;
  update public.ipo_listings
    set active = coalesce(p_active, false), updated_at = now()
    where id = p_id
    returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.upsert_ipo_listing(jsonb) from public, anon;
grant execute on function public.upsert_ipo_listing(jsonb) to authenticated;
revoke all on function public.set_ipo_listing_active(text, boolean) from public, anon;
grant execute on function public.set_ipo_listing_active(text, boolean) to authenticated;
