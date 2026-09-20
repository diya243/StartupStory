// Startup Story API worker.
//
// Holds the real Alpha Vantage + Anthropic keys server-side so the public
// GitHub Pages frontend can offer a working demo with zero setup. Protects
// those keys' quotas/spend with: response caching (KV) and daily budgets,
// both global and per-visitor-IP. None of this is bulletproof (KV counters
// are eventually-consistent, IPs can be spoofed/shared) — it's abuse
// *friction*, not a security boundary, which is the right amount of effort
// for a portfolio demo sitting behind a free-tier key.

const AV_BASE = "https://www.alphavantage.co/query";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/resolve" && request.method === "GET") {
        return await handleResolve(url, env, request, cors);
      }
      if (url.pathname === "/api/financials" && request.method === "GET") {
        return await handleFinancials(url, env, request, cors);
      }
      if (url.pathname === "/api/story" && request.method === "POST") {
        return await handleStory(request, env, cors);
      }
      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      return json({ error: err.message || "Server error" }, 500, cors);
    }
  },
};

// ---------- routes ----------

async function handleResolve(url, env, request, cors) {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ error: "Missing q" }, 400, cors);

  const ip = clientIp(request);
  if (!(await allowIp(env, ip))) return quotaError(cors, "per-visitor");

  const cacheKey = `resolve:${q.toLowerCase()}`;
  const cached = await getCached(env, cacheKey);
  if (cached) return json(cached, 200, cors, true);

  if (!(await consumeAvBudget(env, 1))) return quotaError(cors, "shared-daily");

  const data = await avFetch(env, { function: "SYMBOL_SEARCH", keywords: q });
  await setCached(env, cacheKey, data, 60 * 60 * 24 * 7); // search results are stable
  return json(data, 200, cors);
}

async function handleFinancials(url, env, request, cors) {
  const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
  if (!symbol) return json({ error: "Missing symbol" }, 400, cors);

  const ip = clientIp(request);
  if (!(await allowIp(env, ip))) return quotaError(cors, "per-visitor");

  const cacheKey = `fin:${symbol}`;
  const cached = await getCached(env, cacheKey);
  if (cached) return json(cached, 200, cors, true);

  if (!(await consumeAvBudget(env, 3))) return quotaError(cors, "shared-daily");

  const [overview, income, prices] = await Promise.all([
    avFetch(env, { function: "OVERVIEW", symbol }),
    avFetch(env, { function: "INCOME_STATEMENT", symbol }),
    avFetch(env, { function: "TIME_SERIES_MONTHLY", symbol }).catch(() => null),
  ]);

  const payload = { overview, income, monthlyPrices: normalizeMonthly(prices) };
  await setCached(env, cacheKey, payload, 60 * 60 * 12);
  return json(payload, 200, cors);
}

async function handleStory(request, env, cors) {
  const ip = clientIp(request);
  if (!(await allowIp(env, ip))) return quotaError(cors, "per-visitor");

  const body = await request.json();
  const { companyName, ticker, sector, industry, asOfPeriod, metrics } = body || {};
  if (!companyName || !ticker) return json({ error: "Missing companyName/ticker" }, 400, cors);

  const cacheKey = `story:${ticker}:${asOfPeriod || "na"}`;
  const cached = await getCached(env, cacheKey);
  if (cached) return json(cached, 200, cors, true);

  if (!(await consumeStoryBudget(env))) return quotaError(cors, "shared-daily");

  const result = await callClaude(env, { companyName, ticker, sector, industry, asOfPeriod, metrics });
  await setCached(env, cacheKey, result, 60 * 60 * 24);
  return json(result, 200, cors);
}

// ---------- Alpha Vantage ----------

async function avFetch(env, params) {
  if (!env.ALPHA_VANTAGE_KEY) throw new Error("Server is missing ALPHA_VANTAGE_KEY.");
  const url = new URL(AV_BASE);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("apikey", env.ALPHA_VANTAGE_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Alpha Vantage request failed (HTTP ${res.status}).`);
  const data = await res.json();
  if (data["Error Message"]) throw new Error(data["Error Message"]);
  if (data["Note"]) throw new Error("Alpha Vantage rate limit hit upstream.");
  if (data["Information"]) throw new Error(data["Information"]);
  return data;
}

function normalizeMonthly(data) {
  const series = data && data["Monthly Time Series"];
  if (!series) return null;
  return Object.entries(series)
    .slice(0, 13)
    .map(([date, v]) => ({ date, close: parseFloat(v["4. close"]) }))
    .reverse();
}

// ---------- Anthropic ----------

function buildSystemPrompt() {
  return `You are a financial storyteller writing for readers with zero business or finance background.
You will be given a public company's name, ticker, industry, and a list of REAL financial figures that
were already fetched from a live data source — you must treat those numbers as ground truth and must NOT
invent, restate incorrectly, or add any additional numeric financial figures of your own.

Do three things:

1. STORY STAGES: Break the company's arc into exactly 4 stages: origin, struggle (a pivot or hard period,
if publicly known), inflection (the moment growth or perception clearly changed), and today (tying back
to the given numbers). For each stage give a short headline (under 12 words) and a 2-4 sentence detail —
this will be shown as a mind-map/timeline a reader clicks through, not a wall of prose, so keep each part
tight. No jargon without an immediate plain-English definition. Never give investment advice (no
buy/sell/hold language) — describe trends only.

2. MARKET LEADER: Use your web_search tool to identify the current leading public company in the same
industry/category. If the given company already IS the clear leader, instead identify the #2 player in
that category and say so.

3. REDDIT PULSE: Use your web_search tool to find recent, relevant discussion about the company (e.g.
r/stocks, r/investing, or an industry-specific subreddit). Surface 3-5 distinct, representative viewpoints
with a real spread (skeptical, bullish, neutral, insider/customer-experience). Paraphrase every viewpoint
in your own words in 1-2 sentences — never quote or closely reproduce original phrasing. This is a vibe
check, not verified fact, and your summary_note must say so plainly.

Respond with ONLY a single raw JSON object (no markdown code fences, no commentary before or after) in
exactly this shape:
{
  "narrative_stages": [
    { "key": "origin", "label": "Origin", "period": "string, e.g. a year or year range", "headline": "string", "detail": "string" },
    { "key": "struggle", "label": "Struggle", "period": "string", "headline": "string", "detail": "string" },
    { "key": "inflection", "label": "Inflection", "period": "string", "headline": "string", "detail": "string" },
    { "key": "today", "label": "Today", "period": "string", "headline": "string", "detail": "string" }
  ],
  "market_leader": { "name": "string", "ticker": "string or null if unlisted", "is_queried_company_leader": boolean },
  "reddit_pulse": {
    "summary_note": "string reminding the reader this is opinion, not fact",
    "thought_bubbles": [ { "sentiment": "bullish|skeptical|neutral|insider", "take": "string" } ]
  }
}`;
}

function buildUserPrompt({ companyName, ticker, sector, industry, asOfPeriod, metrics }) {
  return `Company: ${companyName} (${ticker})
Sector: ${sector || "unknown"} / Industry: ${industry || "unknown"}
Most recent reporting period available: ${asOfPeriod || "unknown"}

Real, already-verified financial figures (use these, do not alter or add numeric claims beyond them):
${JSON.stringify(metrics, null, 2)}

Now produce the JSON response described in your instructions.`;
}

function extractText(message) {
  return (message.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function parseStoryJson(raw) {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Claude's response didn't contain JSON.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callClaude(env, context) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("Server is missing ANTHROPIC_API_KEY.");

  const res = await fetch(ANTHROPIC_BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: buildUserPrompt(context) }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error?.message || "";
    } catch {
      // ignore
    }
    throw new Error(`Anthropic request failed (HTTP ${res.status}). ${detail}`);
  }

  const message = await res.json();
  return parseStoryJson(extractText(message));
}

// ---------- caching + quotas (Workers KV) ----------

async function getCached(env, key) {
  const raw = await env.CACHE.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function setCached(env, key, value, ttlSeconds) {
  await env.CACHE.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function consumeBudget(env, key, limit, ttlSeconds, amount) {
  const current = parseInt((await env.CACHE.get(key)) || "0", 10);
  if (current + amount > limit) return false;
  await env.CACHE.put(key, String(current + amount), { expirationTtl: ttlSeconds });
  return true;
}

function consumeAvBudget(env, amount) {
  const limit = parseInt(env.DAILY_AV_BUDGET || "20", 10);
  return consumeBudget(env, `budget:av:${today()}`, limit, 60 * 60 * 26, amount);
}

function consumeStoryBudget(env) {
  const limit = parseInt(env.DAILY_STORY_BUDGET || "80", 10);
  return consumeBudget(env, `budget:story:${today()}`, limit, 60 * 60 * 26, 1);
}

async function allowIp(env, ip) {
  const limit = parseInt(env.PER_IP_DAILY_LIMIT || "15", 10);
  return consumeBudget(env, `ip:${ip}:${today()}`, limit, 60 * 60 * 26, 1);
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

// ---------- HTTP helpers ----------

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status, cors, cacheHit = false) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "x-cache": cacheHit ? "HIT" : "MISS", ...cors },
  });
}

function quotaError(cors, kind) {
  const message =
    kind === "per-visitor"
      ? "You've hit today's shared demo limit for this browser/IP. Add your own free API keys in Settings to keep going without limits."
      : "The shared demo has hit its API quota for today. Add your own free API keys in Settings to keep exploring right now.";
  return json({ error: message, quota: kind }, 429, cors);
}
