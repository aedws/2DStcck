-- 로그인/회원가입을 Edge Function 없이 동작하도록 재설계한다.
--
-- 배경: 기존 가입은 game-account Edge Function(admin.createUser)에 의존했다.
--   Free 플랜에서 Edge Function 무료 한도를 소진하면 게이트웨이가 402(Payment
--   Required)로 전체 Edge Function을 막아버려, 신규 가입이 전부 실패했다.
--   (기존 계정 로그인은 /token 이라 정상, 신규 가입만 붕괴)
--
-- 해결: 클라이언트가 supabase.auth.signUp() 으로 직접 가입하고, 아래 트리거가
--   game_accounts 매핑을 자동 생성한다. 시세 크론(tick-market)과 가입이 더 이상
--   같은 Edge Function 한도를 공유하지 않는다.

-- 1) 신규 유저 생성 시 profiles + game_accounts 매핑을 자동 생성.
--    game_id 는 raw_user_meta_data.game_id 에서 읽는다(클라이언트 signUp 의
--    options.data.game_id, 그리고 기존 Edge Function 이 넣던 user_metadata 와 동일 키).
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

  -- 게임 아이디 형식이 맞을 때만 매핑을 만든다(형식 밖 계정은 건너뜀).
  -- 이메일이 game_id 에서 파생돼 이미 유일하므로 여기서 충돌은 없지만,
  -- 어떤 경우에도 auth 가입 자체를 깨지 않도록 방어적으로 on conflict do nothing.
  if gid is not null and gid ~ '^[a-z0-9_]{3,20}$' then
    insert into public.game_accounts (game_id, user_id)
    values (gid, new.id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- 2) 게임 계정(가짜 이메일)은 생성 즉시 확인 처리한다.
--    프로젝트의 "Confirm email" 설정과 무관하게 로그인이 되도록 하는 안전장치다.
--    이 계정들은 실제 이메일을 받지 않으므로 이메일 확인은 의미가 없다.
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
  for each row execute function public.autoconfirm_game_user();
