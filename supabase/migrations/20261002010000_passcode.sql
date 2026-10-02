-- The plan is no longer readable or writable directly. The page reads and saves it through
-- get_plan / save_plan, which check a shared team password against a bcrypt hash kept in a
-- schema the API does not expose. The hash itself is set outside this file.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.secrets (
  name text primary key,
  hash text not null
);
revoke all on private.secrets from public, anon, authenticated;

drop policy if exists "anyone reads the plan" on public.plans;
drop policy if exists "anyone edits the main plan" on public.plans;
revoke all on public.plans from anon, authenticated;
alter publication supabase_realtime drop table public.plans;

create or replace function private.passcode_ok(passcode text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.secrets s
    where s.name = 'planning' and s.hash = extensions.crypt(coalesce(passcode, ''), s.hash)
  );
$$;
revoke all on function private.passcode_ok(text) from public, anon, authenticated;

create or replace function public.get_plan(passcode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.passcode_ok(passcode) then
    perform pg_sleep(1); -- slows down guessing
    raise exception 'wrong password' using errcode = '28P01';
  end if;
  return (select p.data from public.plans p where p.id = 'main');
end $$;

create or replace function public.save_plan(passcode text, new_data jsonb) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare saved timestamptz;
begin
  if not private.passcode_ok(passcode) then
    perform pg_sleep(1);
    raise exception 'wrong password' using errcode = '28P01';
  end if;
  update public.plans set data = new_data where id = 'main' returning updated_at into saved;
  return saved;
end $$;

revoke all on function public.get_plan(text) from public;
revoke all on function public.save_plan(text, jsonb) from public;
grant execute on function public.get_plan(text) to anon, authenticated;
grant execute on function public.save_plan(text, jsonb) to anon, authenticated;
