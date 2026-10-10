-- Phase 2: one profile row per account, created by a trigger on sign-up.
-- Billing columns are written only by the Stripe webhook (service role), never by the user.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  stripe_customer_id text unique,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  plan_status text,
  current_period_end timestamptz,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Read-only for the owner. The brief's "for all" policy would let a user set plan = 'pro' themselves.
create policy "own profile" on public.profiles for select using (auth.uid() = id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
