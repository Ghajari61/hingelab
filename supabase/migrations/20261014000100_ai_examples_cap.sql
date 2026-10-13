-- AI designer example library holds up to 2000 examples (D144): the shop's archive of finished
-- laser projects is imported into it. Only the cap changes.

create or replace function public.ai_examples_list()
returns table (id uuid, title text, description text, tags text, width_mm real, height_mm real, render_path text, svg_path text, photo_path text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.description, e.tags, e.width_mm, e.height_mm, e.render_path, e.svg_path, e.photo_path, e.created_at
  from private.ai_examples e order by e.created_at desc limit 2000;
$$;

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
  if (select count(*) from private.ai_examples) >= 2000 then
    raise exception 'the example library is full';
  end if;
  insert into private.ai_examples (id, title, description, tags, width_mm, height_mm, render_path, svg_path, photo_path, created_by)
  values (p_id, p_title, coalesce(p_description, ''), coalesce(p_tags, ''), p_width, p_height, p_render_path, p_svg_path, p_photo_path, p_user);
end;
$$;

revoke all on function public.ai_examples_list() from public, anon, authenticated;
revoke all on function public.ai_example_add(uuid, uuid, text, text, text, real, real, text, text, text) from public, anon, authenticated;
grant execute on function public.ai_examples_list() to service_role;
grant execute on function public.ai_example_add(uuid, uuid, text, text, text, real, real, text, text, text) to service_role;
