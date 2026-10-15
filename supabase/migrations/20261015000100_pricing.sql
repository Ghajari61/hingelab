-- Pricing: Business, Founder Lifetime, and the original Pro prices left untouched in Stripe.
-- Apply this yourself (supabase db push, or the SQL editor). It is not applied by the app.
--
-- profiles.plan gains 'business' and 'lifetime'. founder stays true after a one-time Lifetime
-- purchase so cancelling a later Business subscription falls back to Pro features, not Free.
-- TODO: Business "up to 3 devices" is a plan label only. This migration does not track seats.

alter table public.profiles add column if not exists founder boolean not null default false;
alter table public.profiles add column if not exists stripe_price_id text;

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check
  check (plan in ('free', 'pro', 'business', 'lifetime'));

create index if not exists profiles_founder_idx on public.profiles (founder) where founder;

-- Paid plans share Pro's project, shape and parametric limits. Free stays capped at 3.
create or replace function public.enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_plan text;
  n int;
begin
  perform pg_advisory_xact_lock(hashtextextended('projects:' || new.user_id::text, 0));
  select plan into user_plan from public.profiles where id = new.user_id;
  if coalesce(user_plan, 'free') in ('pro', 'business', 'lifetime') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select count(*) into n from public.projects where user_id = new.user_id;
    if n >= 3 then
      raise exception using errcode = 'P0001',
        message = 'The Free plan keeps up to 3 cloud projects. Upgrade to Pro for unlimited projects, or delete one.';
    end if;
  end if;

  if new.product = 'hinge-box'
     and (tg_op = 'INSERT' or new.params is distinct from old.params)
     and (coalesce(new.params ->> 'shape', 'rect') <> 'rect'
          or coalesce(new.params ->> 'pattern', 'straight') <> 'straight') then
    raise exception using errcode = 'P0001',
      message = 'Pill, polygon and cylinder boxes and the wave, relief and serpentine patterns are Pro features.';
  end if;

  if new.product = 'parametric' then
    raise exception using errcode = 'P0001', message = 'Parametric projects are a Pro feature.';
  end if;

  return new;
end;
$$;

drop policy if exists "models: Pro uploads own" on storage.objects;
create policy "models: paid uploads own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'models'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and plan in ('pro', 'business', 'lifetime')
    )
  );

-- Public count for the pricing page. Security definer so the landing page can read it
-- without exposing profiles.
create or replace function public.founder_seats_left()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, 200 - count(*)::int) from public.profiles where founder;
$$;

revoke all on function public.founder_seats_left() from public;
grant execute on function public.founder_seats_left() to anon, authenticated, service_role;

-- One seat, under a lock, so two payments cannot both become the 200th.
-- An active Business plan is left as Business; founder is still recorded for the fallback.
create or replace function public.grant_founder(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform pg_advisory_xact_lock(hashtextextended('founder', 0));
  if exists (select 1 from public.profiles where id = p_user and founder) then
    return true;
  end if;
  select count(*) into n from public.profiles where founder;
  if n >= 200 then
    return false;
  end if;
  update public.profiles
    set founder = true,
        plan = case when plan = 'business' then plan else 'lifetime' end,
        plan_status = case when plan = 'business' then plan_status else 'active' end
    where id = p_user;
  return true;
end;
$$;

revoke all on function public.grant_founder(uuid) from public, anon, authenticated;
grant execute on function public.grant_founder(uuid) to service_role;
