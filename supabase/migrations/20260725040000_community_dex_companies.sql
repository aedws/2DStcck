-- 채택된 '도감 반영 요청'(캐릭터 이름을 단 유저 설립 회사)을 모든 유저 공개로 승격한다.
create table if not exists public.community_dex_companies (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid unique references public.feedback(id) on delete cascade,
  character_id text not null,
  company_name text not null,
  concept text,
  submitted_by uuid,
  game_id text,
  created_at timestamptz not null default now()
);

create index if not exists community_dex_companies_character_id_idx
  on public.community_dex_companies (character_id);

alter table public.community_dex_companies enable row level security;

drop policy if exists community_dex_companies_read on public.community_dex_companies;
create policy community_dex_companies_read on public.community_dex_companies
  for select to authenticated using (true);

create or replace function public.promote_accepted_dex_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_char_id text;
  v_concept text;
begin
  if new.category = '도감 반영 요청'
     and new.status = 'done'
     and new.description ~ '^\[char:[A-Za-z0-9_-]+\]'
     and coalesce(trim(new.title), '') <> '' then
    v_char_id := substring(new.description from '^\[char:([A-Za-z0-9_-]+)\]');
    v_concept := nullif(
      trim(regexp_replace(new.description, '^\[char:[^\]]+\]\s*', '')),
      ''
    );
    insert into public.community_dex_companies
      (feedback_id, character_id, company_name, concept, submitted_by, game_id)
    values
      (new.id, v_char_id, trim(new.title), v_concept, new.user_id, new.game_id)
    on conflict (feedback_id) do update
      set character_id = excluded.character_id,
          company_name = excluded.company_name,
          concept = excluded.concept;
  end if;
  return new;
end;
$$;

drop trigger if exists promote_accepted_dex_company on public.feedback;
create trigger promote_accepted_dex_company
  after insert or update on public.feedback
  for each row execute function public.promote_accepted_dex_company();

revoke all on function public.promote_accepted_dex_company() from public, anon;
