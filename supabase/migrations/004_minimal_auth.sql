-- 데이터 최소화: 인증은 이메일(아이디)+비밀번호만 보관
-- profiles에서 nickname 제거, 가입 트리거는 게임 데이터(현금)만 초기화

alter table public.profiles drop column if exists nickname;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;
