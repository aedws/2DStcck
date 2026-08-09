-- Player companies are legally separate from personal financial assets. The
-- 18:00 financial rollback cleared playerCompany from affected saves even
-- though the shipped foundation ledger and the complete pre-rollback company
-- objects remained. Restore only that object; keep every current wallet field.

begin;

-- Every user trigger is paused under the table's transactional ACCESS
-- EXCLUSIVE lock. Several wallet preservation/reconciliation triggers can
-- rewrite cash even when this migration changes only playerCompany. Keeping
-- them paused guarantees byte-for-byte preservation of the current wallet;
-- PostgreSQL rolls this DDL back too if any assertion below fails.
alter table public.game_saves disable trigger user;

do $$
declare
  remaining bigint;
begin
  perform set_config('app.recovery_bypass', 'on', true);

  update public.game_saves as save
  set state = jsonb_set(
        save.state,
        '{playerCompany}',
        backup.state -> 'playerCompany',
        true
      ),
      wallet_revision = save.wallet_revision + 1,
      updated_at = clock_timestamp()
  from admin_rollback.r20260808_1800_game_saves as backup
  where backup.user_id = save.user_id
    and jsonb_typeof(save.state -> 'playerCompany') is distinct from 'object'
    and jsonb_typeof(backup.state -> 'playerCompany') = 'object'
    and nullif(backup.state -> 'playerCompany' ->> 'id', '') is not null
    and exists (
      select 1
      from public.stock_requests foundation
      where foundation.user_id = save.user_id
        and foundation.status = 'shipped'
        and split_part(foundation.description, E'\n', 1) = '[PLAYER_COMPANY_FOUNDATION]'
        and upper(split_part(foundation.description, E'\n', 2)::jsonb ->> 'ticker')
          = upper(backup.state -> 'playerCompany' ->> 'ticker')
    );

  -- Some affected founders submitted the same ticker again while their company
  -- object was missing. Close only those duplicate attempts after restoration.
  update public.stock_requests as candidate
  set status = 'rejected',
      admin_note = '개인 자산 복구 중 유실된 기존 회사가 원본 상태로 복구되어 중복 재설립 신청을 종료했습니다. 출자금은 다시 차감되지 않습니다.',
      updated_at = clock_timestamp()
  where candidate.status in ('pending', 'reviewing', 'accepted')
    and split_part(candidate.description, E'\n', 1) = '[PLAYER_COMPANY_FOUNDATION]'
    and exists (
      select 1
      from public.stock_requests original
      where original.user_id = candidate.user_id
        and original.id <> candidate.id
        and original.status = 'shipped'
        and split_part(original.description, E'\n', 1) = '[PLAYER_COMPANY_FOUNDATION]'
        and upper(split_part(original.description, E'\n', 2)::jsonb ->> 'ticker')
          = upper(split_part(candidate.description, E'\n', 2)::jsonb ->> 'ticker')
    );

  select count(*) into remaining
  from public.game_saves save
  where jsonb_typeof(save.state -> 'playerCompany') is distinct from 'object'
    and exists (
      select 1
      from public.stock_requests foundation
      join admin_rollback.r20260808_1800_game_saves backup
        on backup.user_id = foundation.user_id
      where foundation.user_id = save.user_id
        and foundation.status = 'shipped'
        and split_part(foundation.description, E'\n', 1) = '[PLAYER_COMPANY_FOUNDATION]'
        and jsonb_typeof(backup.state -> 'playerCompany') = 'object'
    );

  if remaining <> 0 then
    raise exception 'rolled_back_player_company_restore_incomplete:%', remaining;
  end if;
end;
$$;

alter table public.game_saves enable trigger user;

commit;
