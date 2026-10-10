# Setup checklist for the owner

Everything below needs your accounts or your decision. The code already works locally with the
Supabase CLI stack and (once you add test keys) Stripe test mode. Variable names are listed in
`.env.example`.

## Run it locally

1. Start Docker Desktop.
2. `npx supabase start` (first run downloads the images). HingeLab uses ports 55421–55429 so it does not clash with your other local Supabase project.
3. `npx supabase status` shows the local URL and keys. Put `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` into `.env.local` (already done on this machine).
4. `npm run dev`, then open http://localhost:3000. Emails sent by the local stack (confirmations, password resets) appear in Mailpit at http://127.0.0.1:55424, never in a real inbox.

## Supabase (hosted)

1. Create a project at https://supabase.com (region close to your users).
2. Link and push the schema: `npx supabase link --project-ref <ref>` then `npx supabase db push`. This creates the tables, policies and triggers from `supabase/migrations/`.
3. Authentication → URL Configuration: Site URL = your production URL; add `https://<your-domain>/**` and `http://localhost:3000/**` to Redirect URLs.
4. Authentication → Providers → Email: keep "Confirm email" on.
5. Authentication → Providers → Google: create an OAuth client in Google Cloud Console (APIs & Services → Credentials → OAuth client ID → Web application). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the client id and secret into Supabase.
6. Optional, local Google sign-in: put the same id/secret in `.env.local` as `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, set `enabled = true` under `[auth.external.google]` in `supabase/config.toml`, add `http://127.0.0.1:55421/auth/v1/callback` to the Google client, and restart the stack.
7. Authentication → Emails → SMTP: connect a sending service (Resend, Postmark, …) before launch; the built-in sender is rate limited.

## Vercel environment variables

Set these in Vercel → Project → Settings → Environment Variables (Production and Preview):

1. `NEXT_PUBLIC_SITE_URL` — e.g. `https://hingelab.vercel.app` or your domain.
2. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase → Settings → API.
3. `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Settings → API (secret; server only).

## Publish the work

1. The autopilot run committed every phase locally and **did not push**, because a push to `main` deploys to production on Vercel. Review the commits (`git log`), then `git push` when you are ready to go live.
