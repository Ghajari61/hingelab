# Setup checklist for the owner

Everything below needs your accounts or your decision. The code already works locally with the
Supabase CLI stack and (once you add test keys) Stripe test mode. Variable names are listed in
`.env.example`.

## Run it locally

1. Start Docker Desktop.
2. `npx supabase start` (first run downloads the images). HingeLab uses ports 55421–55429 so it does not clash with your other local Supabase project.
3. `npx supabase status` shows the local URL and keys. Put `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` into `.env.local` (already done on this machine).
4. `npm run dev`, then open http://localhost:3000. Emails sent by the local stack (confirmations, password resets) appear in Mailpit at http://127.0.0.1:55424, never in a real inbox.
5. Photo to relief (Parametric → Source → Photo): `npm run fetch:depth-model` downloads Depth-Anything-V2-Small (27 MB, Apache-2.0) into `public/models/` (already done on this machine; the file is git-ignored). Without it, the browser loads the same file from Hugging Face.

## Depth model in production (optional)

1. The `.onnx` file is not committed, so a Vercel deployment loads it from Hugging Face on first use. To serve it yourself, upload `public/models/depth-anything-v2-small/model_quantized.onnx` to a public bucket (Supabase Storage or Vercel Blob) with CORS allowed for your domain.
2. Set `NEXT_PUBLIC_DEPTH_MODEL_URL` to that file's public URL in Vercel and redeploy.
3. Use only the **Small** model: Depth-Anything-V2 Base and Large are CC-BY-NC (non-commercial) and must not be used in a paid product. See `public/models/LICENSES.md`.

## Supabase (hosted)

1. Create a project at https://supabase.com (region close to your users).
2. Link and push the schema: `npx supabase link --project-ref <ref>` then `npx supabase db push`. This creates the tables, policies and triggers from `supabase/migrations/`, the private Storage bucket `models` (files behind Parametric cloud projects) with its policies, and the `user_presets` table behind "Save as my preset". Run `npx supabase db push` again whenever a new file appears in `supabase/migrations/` (`npx supabase migration list --linked` shows what is applied). `20261011000100_security_hardening.sql` adds the shared API rate limiter; without it the limits are counted per server instance only.
3. Storage → Settings: raise the global upload limit to at least **100 MB**, the size of the largest 3D file the Parametric editor accepts (the bucket itself is set to 100 MB, but the project-wide limit caps it; on the Free Supabase plan the cap is 50 MB, so larger models would stay on the device only).
4. Authentication → URL Configuration: Site URL = your production URL; add `https://<your-domain>/**` and `http://localhost:3000/**` to Redirect URLs.
5. Authentication → Providers → Email: keep "Confirm email" on.
6. Authentication → Providers → Google: create an OAuth client in Google Cloud Console (APIs & Services → Credentials → OAuth client ID → Web application). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the client id and secret into Supabase.
7. Optional, local Google sign-in: put the same id/secret in `.env.local` as `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, set `enabled = true` under `[auth.external.google]` in `supabase/config.toml`, add `http://127.0.0.1:55421/auth/v1/callback` to the Google client, and restart the stack.
8. Authentication → Emails → SMTP: connect a sending service (Resend, Postmark, …) before launch; the built-in sender is rate limited.
9. Authentication → Settings / Attack Protection (see `SECURITY_AUDIT.md`): turn on leaked-password protection, "Secure password change" and "Secure email change", and set a minimum password length of at least 8. Do not turn on CAPTCHA there yet: the sign-up and reset forms do not send a CAPTCHA token, so every sign-up would fail.

## Stripe (test mode)

1. Create a Stripe account at https://dashboard.stripe.com and stay in **Test mode** (toggle top right).
2. Developers → API keys: copy the **Secret key** (`sk_test_…`) into `.env.local` as `STRIPE_SECRET_KEY`.
3. Run `node scripts/stripe-setup.mjs`. It creates the "HingeLab Pro" product with a $9/month and a $79/year price (test mode only) and prints `STRIPE_PRICE_PRO_MONTHLY=…` and `STRIPE_PRICE_PRO_YEARLY=…`. Paste both lines into `.env.local`. Running it again reuses the same prices.
4. Local webhooks: install the Stripe CLI (`winget install Stripe.StripeCLI`), run `stripe login`, then `stripe listen --forward-to localhost:3000/api/stripe/webhook`. Copy the `whsec_…` it prints into `.env.local` as `STRIPE_WEBHOOK_SECRET`, and restart `npm run dev`.
5. Try it: sign in, Billing → Upgrade, pay with card `4242 4242 4242 4242`, any future date, any CVC. The plan turns Pro within seconds. Manage billing opens the customer portal.
6. Settings → Billing → Customer portal: turn on "Cancel subscriptions" (mode: **at end of billing period**, as the Terms promise), "Update payment methods" and "Switch plans" (add both Pro prices to the plan switcher), then save.
7. Production webhook (when you deploy): Developers → Webhooks → Add endpoint `https://<your-domain>/api/stripe/webhook` with these events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Copy its signing secret for Vercel (below).
8. Going live later: repeat steps 2, 3, 6 and 7 in Live mode, and set `STRIPE_ALLOW_LIVE=true` in Vercel. Until that variable is `true` the server refuses live keys.

## Vercel environment variables

Set these in Vercel → Project → Settings → Environment Variables (Production and Preview):

1. `NEXT_PUBLIC_SITE_URL` — e.g. `https://hingelab.vercel.app` or your domain. Used for Stripe return links.
2. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase → Settings → API.
3. `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Settings → API (secret; server only).
4. `STRIPE_SECRET_KEY` — `sk_test_…` until launch (secret).
5. `STRIPE_WEBHOOK_SECRET` — the signing secret of the webhook endpoint from Stripe step 7 (secret).
6. `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY` — from `scripts/stripe-setup.mjs`.
7. `STRIPE_ALLOW_LIVE` — leave unset or `false` until you switch to live keys.
8. `NEXT_PUBLIC_CONTACT_EMAIL` — the address shown on the Terms and Privacy pages.
9. `NEXT_PUBLIC_DEPTH_MODEL_URL` — optional, see "Depth model in production".

## Before launch

1. Read `/terms` and `/privacy` (app/terms/page.tsx, app/privacy/page.tsx). They are plain-language drafts written for this app, not legal advice; have them checked for your country and add your business name if required.
2. Custom domain: Vercel → Project → Settings → Domains → add your domain and follow the DNS instructions. Then set `NEXT_PUBLIC_SITE_URL` to it, add it to Supabase Redirect URLs, and update the Stripe webhook endpoint.
3. Check the social preview: after deploying, paste the URL into https://www.opengraph.xyz.
4. Parametric cut-time estimates use speed presets for a typical 40–60 W CO2 laser (`lib/parametric/cutTime.ts`). Cut one sculpture on your own machine and adjust the presets if the estimate is far off.
5. Free Parametric exports are built on the server with manifold (WebAssembly). After the first deploy, export a small Free sculpture once and check Vercel → Logs for the `/api/export` function (time and memory); raise the function memory in Vercel if it is close to the limit.

## Publish the work

1. The autopilot run committed every phase locally and **did not push**, because a push to `main` deploys to production on Vercel. Review the commits (`git log`), then `git push` when you are ready to go live.
