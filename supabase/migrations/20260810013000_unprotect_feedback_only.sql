-- V1 금융 원장 동결은 유지하되 feedback 접수만 명시적으로 보호 대상에서 제외한다.
-- RLS, 인증 사용자 제한, 길이 검증과 제출 쿨다운은 feedback 자체 정책으로 계속 적용된다.

drop trigger if exists service_rebuild_shutdown_guard on public.feedback;

comment on table public.feedback is
  'Authenticated V2 improvement feedback remains writable while the legacy financial ledger is frozen.';
