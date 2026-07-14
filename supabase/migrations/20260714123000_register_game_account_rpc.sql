-- 가입을 이메일 발송/Edge Function/"Confirm email" 설정에 전혀 의존하지 않도록
-- DB 함수로 처리한다.
--
-- 배경: 클라이언트 signUp 은 프로젝트의 "Confirm email" 설정이 켜져 있으면
--   가짜 이메일(game.*@2dstock.local)로 확인메일 발송을 시도하다 실패/레이트리밋으로
--   가입이 깨진다("서버 문제로 로그인할 수 없습니다"). Edge Function 경로는 Free 플랜
--   402 로 막혀 있다. 그래서 GoTrue 가 관리자 API 로 만드는 계정과 "동일한 구조"의
--   auth.users + auth.identities 행을 직접 만들어(비밀번호는 bcrypt 해시) 어떤 외부
--   요소에도 의존하지 않게 한다. 로그인은 표준 signInWithPassword 로 검증한다.
--
-- 반환값: 'created' | 'exists' | 'invalid_game_id' | 'invalid_pin'
--   - 'exists' 는 계정 탈취 방지를 위해 아무것도 변경하지 않는다(클라이언트가 이어서
--     로그인으로 PIN 을 검증한다).

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
  if p_game_id !~ '^[a-z0-9_]{3,20}$' then
    return 'invalid_game_id';
  end if;
  if p_pin !~ '^\d{6}$' then
    return 'invalid_pin';
  end if;

  v_email := 'game.' || p_game_id || '@2dstock.local';

  if exists (select 1 from auth.users where email = v_email) then
    return 'exists';
  end if;

  v_uid := gen_random_uuid();

  -- GoTrue(admin.createUser)가 만드는 이메일 계정과 동일한 형태로 생성한다.
  -- confirmed_at 은 generated 컬럼이라 넣지 않는다(email_confirmed_at 에서 파생).
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
    v_now, v_now,
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('game_id', p_game_id, 'email_verified', true),
    v_now, v_now
  );

  -- 이메일 로그인에 필요한 identity. email 컬럼은 generated 라 넣지 않는다.
  insert into auth.identities (
    id, user_id, provider, provider_id, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid, 'email', v_uid::text,
    jsonb_build_object(
      'sub', v_uid::text, 'email', v_email,
      'email_verified', false, 'phone_verified', false
    ),
    v_now, v_now, v_now
  );

  -- profiles / game_accounts 는 on_auth_user_created 트리거가 자동 생성한다.
  return 'created';
end;
$$;

revoke all on function public.register_game_account(text, text) from public;
grant execute on function public.register_game_account(text, text) to anon, authenticated;
