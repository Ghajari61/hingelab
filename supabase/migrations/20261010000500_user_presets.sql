-- U3: "Save as my preset". Settings a signed-in user keeps for later, per product. Any plan may
-- save presets (they hold settings only, no geometry); 200 per user keeps the table small.

create table public.user_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product text not null check (product in ('hinge-box', 'letters', 'parametric')),
  name text not null check (char_length(name) between 1 and 60),
  params jsonb not null check (jsonb_typeof(params) = 'object' and pg_column_size(params) < 100000),
  created_at timestamptz not null default now()
);

create index user_presets_user_created on public.user_presets (user_id, created_at desc);

alter table public.user_presets enable row level security;

create policy "own presets" on public.user_presets for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create function public.limit_user_presets() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.user_presets where user_id = new.user_id) >= 200 then
    raise exception 'You can keep up to 200 presets. Delete some to save more.';
  end if;
  return new;
end;
$$;

create trigger user_presets_limit before insert on public.user_presets
  for each row execute function public.limit_user_presets();
