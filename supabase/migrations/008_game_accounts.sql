-- 이메일 노출 없는 게임 아이디 로그인용 공개 식별자 매핑.
-- PIN은 이 테이블에 저장하지 않고 Supabase Auth 비밀번호 해시만 사용한다.

create table if not exists public.game_accounts (
  game_id text primary key check (game_id ~ '^[a-z0-9_]{3,20}$'),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

alter table public.game_accounts enable row level security;

-- 클라이언트 직접 접근은 허용하지 않는다. 가입 함수의 service role만 사용한다.
