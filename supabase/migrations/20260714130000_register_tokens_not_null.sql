-- GoTrue 로그인 호환: 직접 생성하는 auth.users 의 토큰 컬럼을 NULL 이 아닌 ''로.
--
-- 배경: register_game_account 가 confirmation_token/recovery_token/email_change/
--   email_change_token_new 등을 넣지 않아 NULL 로 남았는데, GoTrue 는 이 문자열
--   컬럼을 NULL 이 아닌 ''로 기대한다. NULL 이면 비밀번호가 맞아도 로그인이 거부된다
--   (신규 프로젝트로 데이터 이전 후 "PIN 불일치"로 오인된 근본 원인).
--
-- 여기서는 함수만 고친다. 이미 만들어진 유저의 NULL → '' 보정은 데이터 보정
--   쿼리로 별도 수행한다(이전 스크립트).

create or replace function public.register_game_account(p_game_id text, p_pin text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_uid uuid;
  v_now timestamptz := now();
begin
  if p_game_id !~ '^[a-z0-9_]{3,20}$' then return 'invalid_game_id'; end if;
  if p_pin !~ '^\d{6}$' then return 'invalid_pin'; end if;

  v_email := 'game.' || p_game_id || '@2dstock.local';
  if exists (select 1 from auth.users where email = v_email) then return 'exists'; end if;

  v_uid := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
    v_now, v_now,
    jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
    jsonb_build_object('game_id',p_game_id,'email_verified',true),
    v_now, v_now,
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider, provider_id, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid, 'email', v_uid::text,
    jsonb_build_object('sub',v_uid::text,'email',v_email,'email_verified',false,'phone_verified',false),
    v_now, v_now, v_now
  );

  return 'created';
end;
$$;
