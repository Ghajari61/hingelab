-- Windows desktop app sign-in (D96).
-- One-time authorization codes (PKCE) and desktop sessions with opaque, rotating tokens.
-- Tables live in the private schema (not exposed by the API); only the service role reaches them,
-- through the functions below. Every token and code is stored as a SHA-256 hash.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.desktop_auth_codes (
  code_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  code_challenge text not null,
  redirect_uri text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists desktop_auth_codes_expires on private.desktop_auth_codes (expires_at);

create table if not exists private.desktop_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  access_hash text not null unique,
  access_expires_at timestamptz not null,
  refresh_hash text not null unique,
  prev_refresh_hash text,
  refresh_expires_at timestamptz not null,
  device text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists desktop_sessions_user on private.desktop_sessions (user_id);
create index if not exists desktop_sessions_prev on private.desktop_sessions (prev_refresh_hash);

revoke all on private.desktop_auth_codes, private.desktop_sessions from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.desktop_auth_codes, private.desktop_sessions to service_role;

-- A new one-time code for a signed-in user (the consent page). Expired codes are swept here.
create or replace function public.desktop_code_create(p_user uuid, p_code_hash text, p_challenge text, p_redirect text, p_ttl_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or length(p_code_hash) <> 43 or length(p_challenge) <> 43 or length(p_redirect) > 64 or p_ttl_seconds not between 10 and 600 then
    raise exception 'invalid desktop code arguments';
  end if;
  delete from private.desktop_auth_codes where expires_at < now() - interval '1 hour';
  insert into private.desktop_auth_codes (code_hash, user_id, code_challenge, redirect_uri, expires_at)
  values (p_code_hash, p_user, p_challenge, p_redirect, now() + make_interval(secs => p_ttl_seconds));
end;
$$;

-- Takes a code out (single use: it is deleted whether or not the caller's PKCE check then passes).
create or replace function public.desktop_code_take(p_code_hash text)
returns table (user_id uuid, code_challenge text, redirect_uri text, expired boolean)
language sql
security definer
set search_path = ''
as $$
  delete from private.desktop_auth_codes c where c.code_hash = p_code_hash
  returning c.user_id, c.code_challenge, c.redirect_uri, c.expires_at < now();
$$;

create or replace function public.desktop_session_create(p_user uuid, p_access_hash text, p_access_ttl integer, p_refresh_hash text, p_refresh_ttl integer, p_device text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
begin
  if length(p_access_hash) <> 43 or length(p_refresh_hash) <> 43 then
    raise exception 'invalid desktop session arguments';
  end if;
  -- Sessions that can no longer be refreshed are dead weight.
  delete from private.desktop_sessions where refresh_expires_at < now() - interval '7 days' or revoked_at < now() - interval '7 days';
  insert into private.desktop_sessions (user_id, access_hash, access_expires_at, refresh_hash, refresh_expires_at, device)
  values (p_user, p_access_hash, now() + make_interval(secs => p_access_ttl), p_refresh_hash, now() + make_interval(secs => p_refresh_ttl), left(coalesce(p_device, ''), 120))
  returning id into sid;
  return sid;
end;
$$;

-- The user behind a live access token (null when unknown, expired or revoked).
create or replace function public.desktop_session_user(p_access_hash text)
returns table (session_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update private.desktop_sessions s set last_used_at = now()
  where s.access_hash = p_access_hash and s.revoked_at is null and s.access_expires_at > now()
  returning s.id, s.user_id;
end;
$$;

-- Rotates a session's tokens. A refresh token that was already used (the previous one) means it
-- was copied: the whole session is revoked and nothing is returned.
create or replace function public.desktop_session_refresh(p_refresh_hash text, p_access_hash text, p_access_ttl integer, p_refresh_hash_new text, p_refresh_ttl integer)
returns table (session_id uuid, user_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  s private.desktop_sessions%rowtype;
begin
  if length(p_access_hash) <> 43 or length(p_refresh_hash_new) <> 43 then
    raise exception 'invalid desktop session arguments';
  end if;
  select * into s from private.desktop_sessions d where d.refresh_hash = p_refresh_hash for update;
  if found then
    if s.revoked_at is not null or s.refresh_expires_at <= now() then
      return query select s.id, s.user_id, 'expired'::text;
      return;
    end if;
    update private.desktop_sessions d set
      access_hash = p_access_hash, access_expires_at = now() + make_interval(secs => p_access_ttl),
      prev_refresh_hash = d.refresh_hash, refresh_hash = p_refresh_hash_new,
      refresh_expires_at = now() + make_interval(secs => p_refresh_ttl), last_used_at = now()
    where d.id = s.id;
    return query select s.id, s.user_id, 'ok'::text;
    return;
  end if;
  select * into s from private.desktop_sessions d where d.prev_refresh_hash = p_refresh_hash for update;
  if found then
    update private.desktop_sessions d set revoked_at = coalesce(d.revoked_at, now()) where d.id = s.id;
    return query select s.id, s.user_id, 'reused'::text;
    return;
  end if;
  return query select null::uuid, null::uuid, 'unknown'::text;
end;
$$;

-- Sign out: revokes the session that owns this access or refresh token.
create or replace function public.desktop_session_revoke(p_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.desktop_sessions s set revoked_at = coalesce(s.revoked_at, now())
  where s.access_hash = p_hash or s.refresh_hash = p_hash;
  return found;
end;
$$;

-- Sign out everywhere: every desktop session of a user (account page, or a password change).
create or replace function public.desktop_sessions_revoke_all(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update private.desktop_sessions s set revoked_at = now() where s.user_id = p_user and s.revoked_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.desktop_code_create(uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.desktop_code_take(text) from public, anon, authenticated;
revoke all on function public.desktop_session_create(uuid, text, integer, text, integer, text) from public, anon, authenticated;
revoke all on function public.desktop_session_user(text) from public, anon, authenticated;
revoke all on function public.desktop_session_refresh(text, text, integer, text, integer) from public, anon, authenticated;
revoke all on function public.desktop_session_revoke(text) from public, anon, authenticated;
revoke all on function public.desktop_sessions_revoke_all(uuid) from public, anon, authenticated;
grant execute on function public.desktop_code_create(uuid, text, text, text, integer) to service_role;
grant execute on function public.desktop_code_take(text) to service_role;
grant execute on function public.desktop_session_create(uuid, text, integer, text, integer, text) to service_role;
grant execute on function public.desktop_session_user(text) to service_role;
grant execute on function public.desktop_session_refresh(text, text, integer, text, integer) to service_role;
grant execute on function public.desktop_session_revoke(text) to service_role;
grant execute on function public.desktop_sessions_revoke_all(uuid) to service_role;
