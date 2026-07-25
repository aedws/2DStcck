-- 채택된 캐릭터 대사 요청을 모든 유저가 볼 수 있는 공개 테이블로 승격한다.
create table if not exists public.character_quotes (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid unique references public.feedback(id) on delete cascade,
  character_id text not null,
  quote text not null,
  situation text,
  submitted_by uuid,
  game_id text,
  created_at timestamptz not null default now()
);

create index if not exists character_quotes_character_id_idx
  on public.character_quotes (character_id);

alter table public.character_quotes enable row level security;

drop policy if exists character_quotes_read on public.character_quotes;
create policy character_quotes_read on public.character_quotes
  for select to authenticated using (true);

-- feedback 가 채택(done)되면 [char:<id>] 마커를 파싱해 공개 대사로 승격한다.
-- SECURITY DEFINER 로 RLS 를 우회해 삽입하며, 일반 유저의 직접 INSERT 정책은 없다.
create or replace function public.promote_accepted_character_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_char_id text;
  v_situation text;
begin
  if new.category = '캐릭터 대사 요청'
     and new.status = 'done'
     and new.description ~ '^\[char:[A-Za-z0-9_-]+\]'
     and coalesce(trim(new.title), '') <> '' then
    v_char_id := substring(new.description from '^\[char:([A-Za-z0-9_-]+)\]');
    v_situation := nullif(
      trim(regexp_replace(new.description, '^\[char:[^\]]+\]\s*', '')),
      ''
    );
    insert into public.character_quotes
      (feedback_id, character_id, quote, situation, submitted_by, game_id)
    values
      (new.id, v_char_id, trim(new.title), v_situation, new.user_id, new.game_id)
    on conflict (feedback_id) do update
      set character_id = excluded.character_id,
          quote = excluded.quote,
          situation = excluded.situation;
  end if;
  return new;
end;
$$;

drop trigger if exists promote_accepted_character_quote on public.feedback;
create trigger promote_accepted_character_quote
  after insert or update on public.feedback
  for each row execute function public.promote_accepted_character_quote();

revoke all on function public.promote_accepted_character_quote() from public, anon;
