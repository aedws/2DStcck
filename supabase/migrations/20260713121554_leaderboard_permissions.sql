-- Keep leaderboard reads public, but require authenticated users to submit
-- through the validated security-definer RPC.
revoke insert, update, delete, truncate, references, trigger
  on public.leaderboard from anon, authenticated;

grant select on public.leaderboard to anon, authenticated;

revoke execute on function public.submit_leaderboard(
  text, bigint, numeric, bigint, bigint, int, int, text[], bigint
) from public, anon;

grant execute on function public.submit_leaderboard(
  text, bigint, numeric, bigint, bigint, int, int, text[], bigint
) to authenticated;
