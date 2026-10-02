-- One shared plan, readable and editable without login (anyone with the site can change it).
-- Guard rails instead of auth: anon may only UPDATE the existing row (no insert, no delete),
-- the body must be a JSON object under 200 KB, and every change keeps the previous version
-- in plan_history (not readable by anon) so an accidental overwrite can be restored.

create table public.plans (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint data_is_object check (jsonb_typeof(data) = 'object'),
  constraint data_size check (pg_column_size(data) < 200000)
);

create table public.plan_history (
  id bigint generated always as identity primary key,
  plan_id text not null,
  data jsonb not null,
  saved_at timestamptz not null
);
create index plan_history_plan_saved on public.plan_history (plan_id, saved_at desc);

create function public.plans_keep_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  -- one snapshot per 10 minutes is enough to undo mistakes without flooding the table
  if not exists (
    select 1 from public.plan_history h
    where h.plan_id = old.id and h.saved_at > now() - interval '10 minutes'
  ) then
    insert into public.plan_history (plan_id, data, saved_at) values (old.id, old.data, now());
    delete from public.plan_history h
    where h.plan_id = old.id
      and h.id not in (select id from public.plan_history where plan_id = old.id order by saved_at desc limit 500);
  end if;
  return new;
end $$;

create trigger plans_history before update on public.plans
for each row execute function public.plans_keep_history();

alter table public.plans enable row level security;
alter table public.plan_history enable row level security;

create policy "anyone reads the plan" on public.plans for select to anon, authenticated using (true);
create policy "anyone edits the main plan" on public.plans for update to anon, authenticated
  using (id = 'main') with check (id = 'main');

revoke all on public.plans from anon, authenticated;
grant select, update (data) on public.plans to anon, authenticated;
revoke all on public.plan_history from anon, authenticated;
revoke execute on function public.plans_keep_history() from public, anon, authenticated;

-- live updates for both viewers
alter publication supabase_realtime add table public.plans;
