# Startup Story API worker

A small Cloudflare Worker that lets visitors use the deployed site **with zero setup** — it holds your own Alpha Vantage + Anthropic keys server-side, caches responses, and rate-limits so a public link can't blow through your free-tier quota or run up your Anthropic bill.

If you skip deploying this, the site still works — visitors just have to add their own free API keys in Settings first.

## What it does

- `GET /api/resolve?q=` — proxies Alpha Vantage's company search, cached 7 days per query.
- `GET /api/financials?symbol=` — proxies Alpha Vantage overview + income statement + price history in one call, cached 12 hours per symbol.
- `POST /api/story` — proxies the Anthropic call (narrative, market-leader lookup, Reddit sentiment via web search), cached 24 hours per ticker.
- Every route also checks a per-visitor-IP daily cap and a global daily budget (both configurable in `wrangler.toml`) before spending your quota, and returns a friendly 429 telling the visitor to add their own key if the shared demo is tapped out for the day.

None of this is a hard security boundary (IP-based limits and KV counters can be gamed) — it's just enough friction to keep a resume-project demo from silently draining a free-tier key or a paid bill.

## Deploying (one-time, ~10 minutes)

You'll need a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

```bash
npm install -g wrangler
cd worker
wrangler login
```

Create the KV namespace used for caching and rate limiting:

```bash
wrangler kv namespace create CACHE
```

That prints an `id`. Paste it into `wrangler.toml` in place of `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

Set your real API keys as encrypted secrets (never committed to the repo):

```bash
wrangler secret put ALPHA_VANTAGE_KEY
wrangler secret put ANTHROPIC_API_KEY
```

(Optional) In `wrangler.toml`, set `ALLOWED_ORIGIN` to your GitHub Pages URL (e.g. `https://diya243.github.io`) instead of `*`, and adjust the daily budgets if you want.

Deploy:

```bash
wrangler deploy
```

This prints your worker's URL, something like `https://startupstory-api.<your-subdomain>.workers.dev`.

## Wiring it up to the frontend

Open [`../js/config.js`](../js/config.js) and set:

```js
const WORKER_BASE_URL = "https://startupstory-api.<your-subdomain>.workers.dev";
```

Commit and push — GitHub Pages will pick it up automatically. Anyone visiting your deployed site can now search with no setup, up to the daily budgets you configured.

## Local development

```bash
cd worker
wrangler dev
```

Then point `WORKER_BASE_URL` in `js/config.js` at `http://localhost:8787` temporarily while testing.
