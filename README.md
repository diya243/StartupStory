# Startup Story

Type the name of any public company and get a plain-English breakdown of how it's actually doing — real revenue, growth, margins, and stock performance, translated out of finance jargon, plus a short narrative of its arc and a quick read on what people online are saying.

**Live demo:** _add your GitHub Pages URL here after deploying_

## Try it with zero setup

Click **Tesla**, **Apple**, or **Nvidia** under the search box for an instant demo — real financials, narrative, market comparison, and sentiment, all pre-loaded from `data/demo/*.json`. No keys, no backend, no network calls beyond the page itself. This is what to hand a recruiter or link on a resume: it always works, with no dependency on your API quota or backend uptime. Live search for any other company still needs either the shared backend or a visitor's own keys (see below).

## What it does

1. You type a company name (formal or informal — "tesla", "the coffee company").
2. It resolves that to a real ticker and pulls live financials: revenue, YoY growth, net income, gross margin, market cap, and 12-month stock price trend.
3. Every metric is paired with a one-line plain-English explanation of what it actually means for the business.
4. It writes a short narrative of the company's arc (origin → struggle/pivot → inflection point → today), grounded in the real numbers above.
5. It identifies the category's market leader and builds a side-by-side comparison.
6. It does a live web-search-backed "vibe check" of online sentiment (paraphrased, never quoted) — clearly labeled as opinion, not fact.

No investment advice is ever given — the tool describes trends, it doesn't tell you to buy, sell, or hold anything.

## Architecture

The **frontend** is a fully static site — plain HTML/CSS/JS, no build step — deployed to GitHub Pages.

There are two ways it can get live data, and it picks automatically:

1. **Shared demo backend (default, zero setup for visitors)** — a small [Cloudflare Worker](worker/) holds the owner's Alpha Vantage + Anthropic keys server-side, with caching and daily rate limits so a public link can't drain the free-tier key or run up the owner's Anthropic bill. See [`worker/README.md`](worker/README.md) to deploy it.
2. **Bring-your-own-key** — if a visitor adds their own Alpha Vantage + Anthropic keys in Settings, the app calls both APIs directly from their browser instead, unlimited by the shared demo's quota. Keys are stored only in that visitor's `localStorage` and never sent anywhere but the providers' own APIs.

Either way:

- **Financial numbers** (revenue, growth, margins, market cap, price history) are computed deterministically in plain JavaScript from [Alpha Vantage](https://www.alphavantage.co/) data. The LLM never touches these figures — it only ever receives them as already-verified input.
- **The narrative, market-leader identification, and Reddit sentiment** come from a single Anthropic (Claude) call using Claude's built-in `web_search` tool, so the sentiment/leader lookup is genuinely live-searched rather than memorized.

```
index.html              page structure
style.css               design system (dark theme, cards, charts)
js/config.js             API key storage + worker URL config
js/tickerAliases.js       local name -> ticker shortcuts (saves API calls)
js/financeApi.js          Alpha Vantage data + deterministic metric computation
js/claudeApi.js           Anthropic call (narrative + leader + sentiment)
js/render.js               all DOM rendering
js/main.js                  orchestration / event wiring
worker/                       optional shared backend (see worker/README.md)
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
