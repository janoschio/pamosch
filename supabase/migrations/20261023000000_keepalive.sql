-- A harmless call for the scheduled GitHub Action, so the free project counts as active
-- and is not paused after a week without traffic. Reveals nothing about the plan.

create or replace function public.keepalive() returns timestamptz
language sql stable set search_path = '' as $$
  select now();
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
