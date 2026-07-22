create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gid text := new.raw_user_meta_data ->> 'game_id';
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;

  if gid is not null and gid ~ '^[a-z0-9_]{3,20}$' then
    insert into public.game_accounts (game_id, user_id)
    values (gid, new.id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.autoconfirm_game_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email like 'game.%@2dstock.local' and new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists autoconfirm_game_user on auth.users;
create trigger autoconfirm_game_user
  before insert on auth.users
  for each row execute function public.autoconfirm_game_user();;
