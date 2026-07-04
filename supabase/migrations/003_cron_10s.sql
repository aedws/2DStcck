-- tick 스케줄을 10초 간격으로 변경 (1분봉 하위 틱, 봉당 6틱)
-- 다른 프로젝트에 적용 시 YOUR_PROJECT_REF / YOUR_ANON_KEY 교체

do $$
begin
  perform cron.unschedule('tick-market-every-minute');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.unschedule('tick-market-10s');
exception when others then
  null;
end $$;

select cron.schedule(
  'tick-market-10s',
  '10 seconds',
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
