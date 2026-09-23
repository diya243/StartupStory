# Startup Story

A branded, zoomable mind-map for learning growth strategy from companies you already know. Search any public company (or click a demo) and the page zooms into a hub of real financials, its growth narrative, a market-leader comparison, live sentiment, and a "Growth Playbook" that teaches how to actually think about its strategy — each category orbiting the last, drilling deeper on every click, with a persistent breadcrumb trail so you never lose your place.

**Live demo:** _add your GitHub Pages URL here after deploying_

## Try it with zero setup

Click **Tesla**, **Apple**, **Nvidia**, **FamPay**, or **Snabbit** in the opening orbit for an instant demo — real financials, story, comparison, growth playbook, and sentiment, all pre-loaded from `data/demo/*.json`. No keys, no backend, no network calls beyond the page itself. This is what to hand a recruiter or link on a resume: it always works, with no dependency on your API quota or backend uptime. Live search for any other company still needs either the shared backend or a visitor's own keys (see below).

## What it does

The whole experience is one continuous zoom, not a scrolling page:

1. **Startup Story** (the brand hub) orbits a handful of companies plus a search box. Type a company name (formal or informal — "tesla", "the coffee company") or click a demo bubble.
2. That zooms into the **company hub** — real financials resolved and fetched live: revenue, YoY growth, net income, gross margin, market cap, and 12-month stock price trend.
3. Orbiting the company are five categories, each its own zoom: **The Numbers**, **vs. The Competition** (benchmarked against the category's market leader), **The Story** (origin → struggle → inflection → today), **Growth Playbook** (the company's growth stage, its primary growth lever, biggest risk, and what to watch), and **What Reddit Says** (a live web-search-backed sentiment vibe-check, paraphrased, never quoted, clearly labeled as opinion).
4. Clicking any of those zooms once more into individual bubbles — one metric, one story stage, one comparison point, one takeaway — and finally into a full reading card with the number/detail plus a **Growth Lens**: a short, general lesson on *why that kind of number or moment matters for growth strategy*, not just what it says about this one company.
5. A persistent breadcrumb trail (top-left) always shows exactly where you are and lets you jump back to any earlier level in one click — so drilling four levels deep never means losing your way.

No investment advice is ever given — the tool describes trends, it doesn't tell you to buy, sell, or hold anything.

## Architecture

The **frontend** is a fully static site — plain HTML/CSS/JS, no build step — deployed to GitHub Pages. There's no traditional page layout: a single full-viewport `Orbit` engine (`js/orbit.js`) renders a recursive, zoomable radial tree, and `js/treeBuilder.js` shapes the app's existing data (metrics, story, comparison, sentiment, growth playbook) into that generic node format, injecting the reusable "Growth Lens" teaching copy along the way.

There are two ways it can get live data, and it picks automatically:

1. **Shared demo backend (default, zero setup for visitors)** — a small [Cloudflare Worker](worker/) holds the owner's Alpha Vantage + Anthropic keys server-side, with caching and daily rate limits so a public link can't drain the free-tier key or run up the owner's Anthropic bill. See [`worker/README.md`](worker/README.md) to deploy it.
2. **Bring-your-own-key** — if a visitor adds their own Alpha Vantage + Anthropic keys in Settings, the app calls both APIs directly from their browser instead, unlimited by the shared demo's quota. Keys are stored only in that visitor's `localStorage` and never sent anywhere but the providers' own APIs.

Either way:

- **Financial numbers** (revenue, growth, margins, market cap, price history) are computed deterministically in plain JavaScript from [Alpha Vantage](https://www.alphavantage.co/) data. The LLM never touches these figures — it only ever receives them as already-verified input.
- **The narrative, market-leader identification, and Reddit sentiment** come from a single Anthropic (Claude) call using Claude's built-in `web_search` tool, so the sentiment/leader lookup is genuinely live-searched rather than memorized.

```
index.html              minimal shell: a full-viewport stage + breadcrumb bar
style.css               design system (dark theme, orbit bubbles, reading cards, brand font)
js/config.js             API key storage + worker URL config
js/tickerAliases.js       local name -> ticker shortcuts (saves API calls)
js/financeApi.js          Alpha Vantage data + deterministic metric computation
js/claudeApi.js           Anthropic call (story stages + leader + sentiment + growth playbook)
js/treeBuilder.js          shapes app data into the generic orbit node tree + Growth Lens copy
js/orbit.js                 the zoomable radial mind-map engine (rendering + animation + breadcrumbs)
js/main.js                    orchestration: root brand node, lazy company loading, live search
worker/                          optional shared backend (see worker/README.md)
```

## Running it locally

No build tools needed — it's static files. From this folder:

```bash
python -m http.server 8765
```

Then open `http://localhost:8765` in a browser. (Opening `index.html` directly via `file://` won't work — the app's `fetch()` calls to Alpha Vantage/Anthropic need a real HTTP origin.)

## Getting your own API keys (optional)

Only needed if you want to deploy the shared backend (see [`worker/README.md`](worker/README.md)) or bypass its daily quota as a visitor.

- **Alpha Vantage**: [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key) — instant, free, no credit card. Free tier is rate-limited (a handful of requests per minute, ~25/day on the current free plan).
- **Anthropic**: [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) — requires an Anthropic account with billing set up; the `web_search` tool and API usage are billed per Anthropic's pricing.

To use your own keys as a visitor: open the app, click **Settings**, paste both keys in. They stay in your browser.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to "Deploy from a branch", branch `main`, folder `/ (root)`.
4. Save — GitHub will publish it at `https://<username>.github.io/<repo-name>/`.

No CI/build step is required since there's nothing to compile.

## Known limitations

- Alpha Vantage's free tier has real rate limits; heavy use of the demo will hit them.
- Company name → ticker resolution is a best-effort search match; very obscure or newly-listed names may not resolve.
- The Reddit/sentiment section depends on Claude's web search finding relevant, recent discussion — for very obscure companies it may come back thin.
- This is a demo/portfolio project, not a financial research tool. Numbers are as disclosed by Alpha Vantage's data feed and may lag real-time by minutes to hours.
