-- Feature brief Phase 9 (D167): the community gallery, behind the `gallery` flag. Signed-in users
-- publish a design (its settings and a small SVG preview); anyone can read published designs and
-- remix them. Owners can remove their own; `hidden` is for moderation with the service role only.

create table public.gallery_designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product text not null check (product ~ '^[a-z]{2,20}$'),
  name text not null check (char_length(name) between 1 and 80),
  params jsonb not null check (jsonb_typeof(params) = 'object' and pg_column_size(params) < 300000),
  thumbnail text not null check (char_length(thumbnail) <= 60000 and thumbnail like '<svg xmlns="http://www.w3.org/2000/svg"%'),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index gallery_designs_recent on public.gallery_designs (created_at desc) where not hidden;
create index gallery_designs_user on public.gallery_designs (user_id, created_at desc);

alter table public.gallery_designs enable row level security;

create policy "read published designs" on public.gallery_designs for select to anon, authenticated
  using (not hidden or user_id = (select auth.uid()));

create policy "publish own designs" on public.gallery_designs for insert to authenticated
  with check (user_id = (select auth.uid()) and not hidden);

create policy "remove own designs" on public.gallery_designs for delete to authenticated
  using (user_id = (select auth.uid()));

create function public.limit_gallery_designs() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.gallery_designs where user_id = new.user_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'You can publish up to 20 designs a day.';
  end if;
  return new;
end;
$$;

create trigger gallery_designs_limit before insert on public.gallery_designs
  for each row execute function public.limit_gallery_designs();
