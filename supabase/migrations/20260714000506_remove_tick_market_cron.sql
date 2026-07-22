do $$
begin
  perform cron.unschedule('tick-market-10s');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.unschedule('tick-market-every-minute');
exception when others then
  null;
end $$;;
