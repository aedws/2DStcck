-- Listed player-company founders can send a rate-limited letter to accounts that
-- have continuously held at least one public share for 20 market sessions.
-- Recipients are snapshotted at send time and are never exposed to the founder.

create table if not exists public.player_company_shareholder_streaks (
  user_id uuid not null references auth.users (id) on delete cascade,
  stock_id text not null,
  held_since_session bigint,
  last_seen_session bigint not null,
  current_quantity numeric not null default 0 check (current_quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, stock_id)
);

create index if not exists player_company_shareholder_streaks_stock_idx
  on public.player_company_shareholder_streaks
  (stock_id, held_since_session)
  where current_quantity >= 1;

create table if not exists public.player_company_shareholder_letters (
  id uuid primary key default gen_random_uuid(),
  stock_id text not null,
  ticker text not null,
  company_name text not null,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 500),
  sent_session bigint not null,
  declared_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists player_company_shareholder_letters_stock_idx
  on public.player_company_shareholder_letters (stock_id, sent_session desc);

create table if not exists public.player_company_shareholder_letter_recipients (
  letter_id uuid not null
    references public.player_company_shareholder_letters (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz,
  delivered_at timestamptz not null default now(),
  primary key (letter_id, user_id)
);

create index if not exists player_company_shareholder_letter_recipient_idx
  on public.player_company_shareholder_letter_recipients
  (user_id, delivered_at desc);

alter table public.player_company_shareholder_streaks enable row level security;
alter table public.player_company_shareholder_letters enable row level security;
alter table public.player_company_shareholder_letter_recipients enable row level security;

revoke all on public.player_company_shareholder_streaks
  from public, anon, authenticated;
revoke all on public.player_company_shareholder_letters
  from public, anon, authenticated;
revoke all on public.player_company_shareholder_letter_recipients
  from public, anon, authenticated;

create or replace function public.player_company_saved_holding_quantity(
  p_holding jsonb
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select greatest(
    0,
    case
      when coalesce(p_holding ->> 'quantityExact', '')
        ~ '^[0-9]+([.][0-9]+)?$'
      then (p_holding ->> 'quantityExact')::numeric
      when jsonb_typeof(p_holding -> 'quantity') = 'number'
      then (p_holding ->> 'quantity')::numeric
      else 0
    end
  );
$$;

revoke all on function public.player_company_saved_holding_quantity(jsonb)
  from public, anon, authenticated;

create or replace function public.sync_player_company_shareholder_streaks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session bigint :=
    floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
  v_company jsonb := new.state -> 'playerCompany';
  v_stock_id text;
  v_ticker text;
begin
  -- Keep the verified listed-company registry current for future IPO approvals.
  if jsonb_typeof(v_company) = 'object'
     and coalesce(v_company ->> 'status', '') = 'listed'
  then
    v_stock_id := lower(trim(coalesce(
      v_company ->> 'ipoListingStockId',
      ''
    )));
    v_ticker := upper(trim(coalesce(v_company ->> 'ticker', '')));
    if v_stock_id ~ '^[a-z][a-z0-9]{1,31}$'
       and v_ticker ~ '^[A-Z0-9]{2,6}$'
       and exists (
         select 1
         from public.stock_requests request
         where request.user_id = new.user_id
           and request.status in ('accepted', 'shipped')
           and request.description like '%[PLAYER_COMPANY_FOUNDATION]%'
           and request.description like
             '%"ticker":"' || v_ticker || '"%'
       )
    then
      insert into public.player_company_market_listings (
        stock_id, ticker, founder_id
      )
      values (v_stock_id, v_ticker, new.user_id)
      on conflict do nothing;
    end if;
  end if;

  -- A missing or sub-one-share position breaks the continuous holding streak.
  update public.player_company_shareholder_streaks streak
  set held_since_session = null,
      last_seen_session = v_session,
      current_quantity = 0,
      updated_at = now()
  where streak.user_id = new.user_id
    and streak.current_quantity > 0
    and not exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(new.state -> 'holdings') = 'array'
          then new.state -> 'holdings'
          else '[]'::jsonb
        end
      ) holding
      where lower(coalesce(holding ->> 'stockId', '')) = streak.stock_id
        and public.player_company_saved_holding_quantity(holding) >= 1
    );

  insert into public.player_company_shareholder_streaks (
    user_id,
    stock_id,
    held_since_session,
    last_seen_session,
    current_quantity,
    updated_at
  )
  select
    new.user_id,
    listing.stock_id,
    v_session,
    v_session,
    sum(public.player_company_saved_holding_quantity(holding)),
    now()
  from jsonb_array_elements(
    case
      when jsonb_typeof(new.state -> 'holdings') = 'array'
      then new.state -> 'holdings'
      else '[]'::jsonb
    end
  ) holding
  join public.player_company_market_listings listing
    on listing.stock_id = lower(coalesce(holding ->> 'stockId', ''))
  group by listing.stock_id
  having sum(public.player_company_saved_holding_quantity(holding)) >= 1
  on conflict (user_id, stock_id) do update
  set held_since_session = case
        when public.player_company_shareholder_streaks.current_quantity >= 1
        then public.player_company_shareholder_streaks.held_since_session
        else excluded.held_since_session
      end,
      last_seen_session = excluded.last_seen_session,
      current_quantity = excluded.current_quantity,
      updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke all on function public.sync_player_company_shareholder_streaks()
  from public, anon, authenticated;

drop trigger if exists game_saves_player_company_shareholder_streaks
  on public.game_saves;
create trigger game_saves_player_company_shareholder_streaks
after insert or update of state on public.game_saves
for each row execute function public.sync_player_company_shareholder_streaks();

-- Existing holders start a fresh verified streak at deployment time because old
-- saves do not contain a server-verifiable continuous acquisition timestamp.
insert into public.player_company_shareholder_streaks (
  user_id,
  stock_id,
  held_since_session,
  last_seen_session,
  current_quantity
)
select
  saves.user_id,
  listing.stock_id,
  floor(extract(epoch from clock_timestamp()) / 3600)::bigint,
  floor(extract(epoch from clock_timestamp()) / 3600)::bigint,
  sum(public.player_company_saved_holding_quantity(holding))
from public.game_saves saves
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(saves.state -> 'holdings') = 'array'
    then saves.state -> 'holdings'
    else '[]'::jsonb
  end
) holding
join public.player_company_market_listings listing
  on listing.stock_id = lower(coalesce(holding ->> 'stockId', ''))
group by saves.user_id, listing.stock_id
having sum(public.player_company_saved_holding_quantity(holding)) >= 1
on conflict (user_id, stock_id) do nothing;

create or replace function public.get_player_company_letter_status(
  p_stock_id text
)
returns table (
  eligible_count bigint,
  last_sent_session bigint,
  next_send_session bigint,
  can_send boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_stock_id text := lower(trim(coalesce(p_stock_id, '')));
  v_session bigint :=
    floor(extract(epoch from statement_timestamp()) / 3600)::bigint;
  v_last bigint;
  v_count bigint;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1
    from public.player_company_market_listings listing
    join public.game_saves saves on saves.user_id = listing.founder_id
    where listing.stock_id = v_stock_id
      and listing.founder_id = v_user
      and saves.state -> 'playerCompany' ->> 'status' = 'listed'
      and lower(coalesce(
        saves.state -> 'playerCompany' ->> 'ipoListingStockId',
        ''
      )) = v_stock_id
  ) then
    raise exception 'not_listed_founder';
  end if;

  select max(letter.sent_session)
    into v_last
  from public.player_company_shareholder_letters letter
  where letter.stock_id = v_stock_id;

  select count(*)
    into v_count
  from public.player_company_shareholder_streaks streak
  where streak.stock_id = v_stock_id
    and streak.user_id <> v_user
    and streak.current_quantity >= 1
    and streak.held_since_session is not null
    and v_session - streak.held_since_session >= 20;

  return query
  select
    v_count,
    v_last,
    case when v_last is null then v_session else v_last + 20 end,
    v_count > 0 and (v_last is null or v_session >= v_last + 20);
end;
$$;

create or replace function public.send_player_company_shareholder_letter(
  p_stock_id text,
  p_title text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_stock_id text := lower(trim(coalesce(p_stock_id, '')));
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_session bigint :=
    floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
  v_ticker text;
  v_company_name text;
  v_last bigint;
  v_letter_id uuid;
  v_recipient_count integer;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'invalid_title';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    raise exception 'invalid_body';
  end if;
  if v_title ~* '(https?://|www[.])'
     or v_body ~* '(https?://|www[.])'
  then
    raise exception 'links_not_allowed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_stock_id, 0));

  select
    listing.ticker,
    saves.state -> 'playerCompany' ->> 'name'
    into v_ticker, v_company_name
  from public.player_company_market_listings listing
  join public.game_saves saves on saves.user_id = listing.founder_id
  where listing.stock_id = v_stock_id
    and listing.founder_id = v_user
    and saves.state -> 'playerCompany' ->> 'status' = 'listed'
    and lower(coalesce(
      saves.state -> 'playerCompany' ->> 'ipoListingStockId',
      ''
    )) = v_stock_id;

  if not found then raise exception 'not_listed_founder'; end if;

  select max(letter.sent_session)
    into v_last
  from public.player_company_shareholder_letters letter
  where letter.stock_id = v_stock_id;
  if v_last is not null and v_session < v_last + 20 then
    raise exception 'letter_cooldown';
  end if;

  insert into public.player_company_shareholder_letters (
    stock_id,
    ticker,
    company_name,
    title,
    body,
    sent_session,
    declared_by
  )
  values (
    v_stock_id,
    v_ticker,
    v_company_name,
    v_title,
    v_body,
    v_session,
    v_user
  )
  returning id into v_letter_id;

  insert into public.player_company_shareholder_letter_recipients (
    letter_id,
    user_id
  )
  select v_letter_id, streak.user_id
  from public.player_company_shareholder_streaks streak
  where streak.stock_id = v_stock_id
    and streak.user_id <> v_user
    and streak.current_quantity >= 1
    and streak.held_since_session is not null
    and v_session - streak.held_since_session >= 20;

  get diagnostics v_recipient_count = row_count;
  if v_recipient_count = 0 then
    raise exception 'no_eligible_shareholders';
  end if;

  return jsonb_build_object(
    'id', v_letter_id,
    'recipientCount', v_recipient_count,
    'sentSession', v_session,
    'nextSendSession', v_session + 20
  );
end;
$$;

create or replace function public.list_my_shareholder_letters(
  p_limit integer default 100
)
returns table (
  id uuid,
  stock_id text,
  ticker text,
  company_name text,
  title text,
  body text,
  sent_session bigint,
  created_at timestamptz,
  read_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    letter.id,
    letter.stock_id,
    letter.ticker,
    letter.company_name,
    letter.title,
    letter.body,
    letter.sent_session,
    letter.created_at,
    recipient.read_at
  from public.player_company_shareholder_letter_recipients recipient
  join public.player_company_shareholder_letters letter
    on letter.id = recipient.letter_id
  where recipient.user_id = auth.uid()
  order by letter.created_at desc
  limit least(200, greatest(1, coalesce(p_limit, 100)));
$$;

create or replace function public.mark_shareholder_letter_read(
  p_letter_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.player_company_shareholder_letter_recipients
  set read_at = coalesce(read_at, now())
  where letter_id = p_letter_id
    and user_id = auth.uid();
  return found;
end;
$$;

create or replace function public.mark_all_shareholder_letters_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.player_company_shareholder_letter_recipients
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.get_player_company_letter_status(text)
  from public, anon;
revoke all on function public.send_player_company_shareholder_letter(text, text, text)
  from public, anon;
revoke all on function public.list_my_shareholder_letters(integer)
  from public, anon;
revoke all on function public.mark_shareholder_letter_read(uuid)
  from public, anon;
revoke all on function public.mark_all_shareholder_letters_read()
  from public, anon;

grant execute on function public.get_player_company_letter_status(text)
  to authenticated;
grant execute on function public.send_player_company_shareholder_letter(text, text, text)
  to authenticated;
grant execute on function public.list_my_shareholder_letters(integer)
  to authenticated;
grant execute on function public.mark_shareholder_letter_read(uuid)
  to authenticated;
grant execute on function public.mark_all_shareholder_letters_read()
  to authenticated;
