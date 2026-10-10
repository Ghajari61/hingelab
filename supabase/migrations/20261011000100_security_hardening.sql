-- Security hardening (D95).
-- 1. Shared rate limiting for the API routes (service role only, callers stored hashed).
-- 2. Plan limits and the preset cap serialised per user, so parallel inserts cannot pass them.
-- 3. Size limits on project params, and Storage restricted to the model and photo types.
-- 4. Trigger functions not callable by API roles.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_ts timestamptz := clock_timestamp();
  w_start timestamptz;
  n integer;
begin
  if p_key is null or length(p_key) > 128 or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit arguments';
  end if;
  insert into private.rate_limits as r (key, window_start, count)
  values (p_key, now_ts, 1)
  on conflict (key) do update set
    window_start = case when r.window_start + make_interval(secs => p_window_seconds) <= now_ts then now_ts else r.window_start end,
    count = case when r.window_start + make_interval(secs => p_window_seconds) <= now_ts then 1 else r.count + 1 end
  returning r.window_start, r.count into w_start, n;
  if random() < 0.01 then
    delete from private.rate_limits where window_start < now_ts - interval '1 day';
  end if;
  return query select n <= p_limit,
    greatest(0, ceil(extract(epoch from (w_start + make_interval(secs => p_window_seconds) - now_ts))))::integer;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.rate_limits to service_role;

-- Plan limits: lock the user's row of limits first, so two parallel inserts both count the other.
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
  if coalesce(user_plan, 'free') = 'pro' then
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

create or replace function public.limit_user_presets() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('presets:' || new.user_id::text, 0));
  if (select count(*) from public.user_presets where user_id = new.user_id) >= 200 then
    raise exception 'You can keep up to 200 presets. Delete some to save more.';
  end if;
  return new;
end;
$$;

-- A project's settings are a few kB (the app refuses more than 256 kB); 1 MB stops abuse of the table.
alter table public.projects drop constraint if exists projects_params_size;
alter table public.projects add constraint projects_params_size check (pg_column_size(params) <= 1048576) not valid;
alter table public.projects validate constraint projects_params_size;

-- Users may not move a project or preset to someone else, nor change who owns it.
create or replace function public.keep_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception using errcode = 'P0001', message = 'The owner of a row cannot be changed.';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_keep_owner on public.projects;
create trigger projects_keep_owner before update on public.projects
  for each row execute function public.keep_owner();
drop trigger if exists user_presets_keep_owner on public.user_presets;
create trigger user_presets_keep_owner before update on public.user_presets
  for each row execute function public.keep_owner();

-- Trigger functions run from triggers only.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.enforce_plan_limits() from public, anon, authenticated;
revoke all on function public.limit_user_presets() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.keep_owner() from public, anon, authenticated;

-- Storage: the models bucket holds 3D files and photos only, at most 100 MB each.
update storage.buckets
set allowed_mime_types = array[
  'application/octet-stream', 'model/stl', 'model/obj', 'model/gltf-binary', 'model/gltf+json',
  'image/jpeg', 'image/png', 'image/webp'
]
where id = 'models';
