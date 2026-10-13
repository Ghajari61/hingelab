-- AI designer example library (D143).
-- Finished products of the shop (a photo and the cut file) that the AI designer looks at before it
-- draws an original design. Only curators add or remove them; only the server reads them. The
-- tables live in the private schema and the files in a private bucket, reached by the service role.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.ai_curators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists private.ai_examples (
  id uuid primary key,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  tags text not null default '' check (char_length(tags) <= 300),
  width_mm real not null check (width_mm > 0 and width_mm <= 5000),
  height_mm real not null check (height_mm > 0 and height_mm <= 5000),
  render_path text not null,
  svg_path text not null,
  photo_path text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

revoke all on private.ai_curators, private.ai_examples from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.ai_curators, private.ai_examples to service_role;

-- Private bucket: {example id}/render.png, drawing.svg and photo.jpg. No policies: service role only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ai-examples', 'ai-examples', false, 5242880, array['image/png', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The owner's account (its confirmed email) always curates; more curators: insert their user id
-- into private.ai_curators.
create or replace function public.ai_is_curator(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.ai_curators c where c.user_id = p_user)
    or exists (select 1 from auth.users u where u.id = p_user and lower(u.email) = 'ghajari61@gmail.com' and u.email_confirmed_at is not null);
$$;

create or replace function public.ai_examples_list()
returns table (id uuid, title text, description text, tags text, width_mm real, height_mm real, render_path text, svg_path text, photo_path text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.description, e.tags, e.width_mm, e.height_mm, e.render_path, e.svg_path, e.photo_path, e.created_at
  from private.ai_examples e order by e.created_at desc limit 500;
$$;

-- Adds an example for a curator; at most 500 in the library.
create or replace function public.ai_example_add(p_user uuid, p_id uuid, p_title text, p_description text, p_tags text, p_width real, p_height real, p_render_path text, p_svg_path text, p_photo_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.ai_is_curator(p_user) then
    raise exception 'not a curator';
  end if;
  if (select count(*) from private.ai_examples) >= 500 then
    raise exception 'the example library is full';
  end if;
  insert into private.ai_examples (id, title, description, tags, width_mm, height_mm, render_path, svg_path, photo_path, created_by)
  values (p_id, p_title, coalesce(p_description, ''), coalesce(p_tags, ''), p_width, p_height, p_render_path, p_svg_path, p_photo_path, p_user);
end;
$$;

-- Removes an example for a curator; returns its files so the caller can delete them.
create or replace function public.ai_example_delete(p_user uuid, p_id uuid)
returns table (render_path text, svg_path text, photo_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.ai_is_curator(p_user) then
    raise exception 'not a curator';
  end if;
  return query delete from private.ai_examples e where e.id = p_id returning e.render_path, e.svg_path, e.photo_path;
end;
$$;

revoke all on function public.ai_is_curator(uuid) from public, anon, authenticated;
revoke all on function public.ai_examples_list() from public, anon, authenticated;
revoke all on function public.ai_example_add(uuid, uuid, text, text, text, real, real, text, text, text) from public, anon, authenticated;
revoke all on function public.ai_example_delete(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_is_curator(uuid) to service_role;
grant execute on function public.ai_examples_list() to service_role;
grant execute on function public.ai_example_add(uuid, uuid, text, text, text, real, real, text, text, text) to service_role;
grant execute on function public.ai_example_delete(uuid, uuid) to service_role;
