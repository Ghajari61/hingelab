-- Security review before release: designs reach the gallery only through the publish server action,
-- which checks the `gallery` flag and cleans the entry (name, size, an inert SVG preview) before it
-- inserts with the service role. Signed-in users could otherwise insert rows straight through the
-- REST API with the anon key, skipping both. The daily limit trigger still applies.

drop policy if exists "publish own designs" on public.gallery_designs;
