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
// The first two are the grandfathered $9/$79 prices. This script finds them by lookup key and
// does not change their amounts. The rest are new prices for new checkouts.
const PLANS = [
  { plan: "pro", lookup: "hingelab_pro_monthly", amount: 900, interval: "month", env: "STRIPE_PRICE_PRO_MONTHLY" },
  { plan: "pro", lookup: "hingelab_pro_yearly", amount: 7900, interval: "year", env: "STRIPE_PRICE_PRO_YEARLY" },
  { plan: "pro", lookup: "hingelab_pro_monthly_v2", amount: 1200, interval: "month", env: "PRICE_PRO_MONTHLY" },
  { plan: "pro", lookup: "hingelab_pro_yearly_v2", amount: 9900, interval: "year", env: "PRICE_PRO_YEARLY" },
  { plan: "business", lookup: "hingelab_business_monthly", amount: 2900, interval: "month", env: "PRICE_BUSINESS_MONTHLY", name: "HingeLab Business" },
  { plan: "business", lookup: "hingelab_business_yearly", amount: 29000, interval: "year", env: "PRICE_BUSINESS_YEARLY", name: "HingeLab Business" },
  { plan: "lifetime", lookup: "hingelab_founder_lifetime", amount: 17900, interval: null, env: "PRICE_LIFETIME", name: "HingeLab Founder Lifetime" },
];

const stripe = new Stripe(key);

async function productFor(plan, name) {
  const found = await stripe.products.search({ query: `metadata['app']:'hingelab' AND metadata['plan']:'${plan}'` });
  return found.data[0] ?? await stripe.products.create({
    name,
    metadata: { app: "hingelab", plan },
  });
}

const products = {
  pro: await productFor("pro", "HingeLab Pro"),
  business: await productFor("business", "HingeLab Business"),
  lifetime: await productFor("lifetime", "HingeLab Founder Lifetime"),
};

const lines = [];
for (const p of PLANS) {
  const existing = await stripe.prices.list({ lookup_keys: [p.lookup], active: true, limit: 1 });
  const price = existing.data[0] ?? await stripe.prices.create({
    product: products[p.plan].id,
    currency: "usd",
    unit_amount: p.amount,
    ...(p.interval ? { recurring: { interval: p.interval } } : {}),
    lookup_key: p.lookup,
  });
  lines.push(`${p.env}=${price.id}`);
}

console.log(`Products (test mode): Pro ${products.pro.id}, Business ${products.business.id}, Lifetime ${products.lifetime.id}\n\nAdd these lines to .env.local:\n`);
console.log(lines.join("\n"));
