-- Publicly expose only the aggregate number of registered game accounts.
-- Individual game ids and auth user ids remain inaccessible to clients.
create or replace function public.get_registered_account_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint from public.game_accounts;
$$;

revoke all on function public.get_registered_account_count() from public;
grant execute on function public.get_registered_account_count() to anon, authenticated;
