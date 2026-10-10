-- Phase 3: the user's cloud projects (Hinge Box, Letters, later Parametric).

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default 'Untitled box' check (char_length(name) between 1 and 200),
  product text not null default 'hinge-box' check (product in ('hinge-box', 'letters', 'parametric')),
  params jsonb not null check (jsonb_typeof(params) = 'object'),
  thumbnail_svg text check (thumbnail_svg is null or char_length(thumbnail_svg) <= 200000),
  engine_version int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index projects_user_updated on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

create policy "own projects" on public.projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The server clock decides updated_at, so "newer copy wins" never trusts a client clock for the cloud side.
create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_touch
  before update on public.projects
  for each row execute function public.touch_updated_at();
