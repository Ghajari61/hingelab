// Creates the HingeLab Pro product and its monthly/yearly prices in Stripe TEST mode and prints
// the env lines to paste into .env.local. Safe to run again: prices are found by lookup key.
//
//   node scripts/stripe-setup.mjs
//
// Reads STRIPE_SECRET_KEY from the environment or .env.local. Refuses live keys.
import { readFileSync } from "node:fs";
import Stripe from "stripe";

function envLocal() {
  try {
    return Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .map((l) => /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(l))
        .filter(Boolean)
        .map((m) => [m[1], m[2]]),
    );
  } catch {
    return {};
  }
}

const key = process.env.STRIPE_SECRET_KEY || envLocal().STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set. Paste your test key (sk_test_…) into .env.local first.");
  process.exit(1);
}
if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
  console.error("This script only runs with a Stripe TEST key (sk_test_…). Nothing was created.");
  process.exit(1);
}

// Keep in sync with PRICES in lib/plans.ts.
const PLANS = [
  { lookup: "hingelab_pro_monthly", amount: 900, interval: "month", env: "STRIPE_PRICE_PRO_MONTHLY" },
  { lookup: "hingelab_pro_yearly", amount: 7900, interval: "year", env: "STRIPE_PRICE_PRO_YEARLY" },
];

const stripe = new Stripe(key);

const found = await stripe.products.search({ query: "metadata['app']:'hingelab' AND metadata['plan']:'pro'" });
const product = found.data[0] ?? await stripe.products.create({
  name: "HingeLab Pro",
  description: "Clean SVG export, unlimited cloud projects, every shape, pattern and tool.",
  metadata: { app: "hingelab", plan: "pro" },
});

const lines = [];
for (const p of PLANS) {
  const existing = await stripe.prices.list({ lookup_keys: [p.lookup], active: true, limit: 1 });
  const price = existing.data[0] ?? await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: p.amount,
    recurring: { interval: p.interval },
    lookup_key: p.lookup,
  });
  lines.push(`${p.env}=${price.id}`);
}

console.log(`Product: ${product.id} (test mode)\n\nAdd these lines to .env.local:\n`);
console.log(lines.join("\n"));
