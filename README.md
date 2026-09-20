# Startup Story

Type the name of any public company and get a plain-English breakdown of how it's actually doing — real revenue, growth, margins, and stock performance, translated out of finance jargon, plus a short narrative of its arc and a quick read on what people online are saying.

**Live demo:** _add your GitHub Pages URL here after deploying_

![Startup Story screenshot](docs/screenshot.png)

## What it does

1. You type a company name (formal or informal — "tesla", "the coffee company").
2. It resolves that to a real ticker and pulls live financials: revenue, YoY growth, net income, gross margin, market cap, and 12-month stock price trend.
3. Every metric is paired with a one-line plain-English explanation of what it actually means for the business.
4. It writes a short narrative of the company's arc (origin → struggle/pivot → inflection point → today), grounded in the real numbers above.
5. It identifies the category's market leader and builds a side-by-side comparison.
6. It does a live web-search-backed "vibe check" of online sentiment (paraphrased, never quoted) — clearly labeled as opinion, not fact.

No investment advice is ever given — the tool describes trends, it doesn't tell you to buy, sell, or hold anything.

## Architecture

This is a **fully static site** — plain HTML/CSS/JS, no build step, no backend/server. It's designed to deploy directly to GitHub Pages.

That's possible because of a **bring-your-own-key** pattern:

- **Financial numbers** come from [Alpha Vantage](https://www.alphavantage.co/) (free tier, CORS-enabled), called directly from the browser and computed deterministically in JavaScript. The LLM never touches these numbers — it only receives them as already-verified input.
- **The narrative, market-leader identification, and Reddit sentiment** come from a single call to the **Anthropic (Claude) API**, made directly from the browser using Claude's built-in `web_search` tool, so the sentiment/leader lookup is genuinely live-searched rather than memorized.
- Both API keys are entered once in the app's Settings panel and stored only in `localStorage` in the visitor's own browser. They are never sent anywhere except directly to their respective provider's API.

```
index.html          page structure
style.css           design system (dark theme, cards, charts)
js/config.js         localStorage key management
js/financeApi.js      Alpha Vantage calls + deterministic metric computation
js/claudeApi.js       Anthropic API call (narrative + leader + sentiment)
js/render.js           all DOM rendering
js/main.js              orchestration / event wiring
```

## Running it locally

No build tools needed — it's static files. From this folder:

```bash
python -m http.server 8765
```

Then open `http://localhost:8765` in a browser. (Opening `index.html` directly via `file://` won't work — the app's `fetch()` calls to Alpha Vantage/Anthropic need a real HTTP origin.)

## Getting API keys (both free to start)

- **Alpha Vantage**: [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key) — instant, free, no credit card. Free tier is rate-limited (a handful of requests per minute, ~25/day on the current free plan), which is enough for demo use.
- **Anthropic**: [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) — requires an Anthropic account with billing set up; the `web_search` tool and API usage are billed per Anthropic's pricing.

Open the app, click **Settings**, paste both keys in. They stay in your browser.

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
