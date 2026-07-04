-- 시장 tick 스케줄러: pg_cron + pg_net 으로 1분마다 tick-market Edge Function 호출
-- tick-market 함수는 verify_jwt(anon key) + 시간 게이트(50초)로 보호되므로 별도 시크릿 불필요.
-- 다른 프로젝트에 적용 시 아래 2곳 교체:
--   YOUR_PROJECT_REF → Supabase 프로젝트 ref
--   YOUR_ANON_KEY    → Settings → API 의 anon key

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 기존 스케줄 제거 (재실행 대비)
do $$
begin
  perform cron.unschedule('tick-market-every-minute');
exception when others then
  null;
end $$;

select cron.schedule(
  'tick-market-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/tick-market',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_ANON_KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
