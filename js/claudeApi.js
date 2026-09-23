// Handles the qualitative half of the story: narrative prose, identifying the
// category's market leader, and a live web-search read of online sentiment.
// Claude is deliberately never asked to invent or restate hard financial figures —
// those come only from FinanceApi. This call runs directly from the browser using
// the visitor's own Anthropic API key.
const ClaudeApi = (() => {
  const ENDPOINT = "https://api.anthropic.com/v1/messages";
  const MODEL = "claude-sonnet-5";

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

4. GROWTH PLAYBOOK: Teach the reader how to think about this company's growth strategy, not just what its
numbers are. Classify its growth stage (e.g. "Hypergrowth", "Mature Compounder", "Turnaround", "Category
Leader Defending Share") and explain in 1-2 sentences what that stage generally means for any company.
Identify its single primary growth lever (more customers, more spend per customer, new markets, or new
products) and explain concretely how this company pulls that lever. State its single biggest risk to that
growth story, and the one specific metric or signal a reader should watch going forward to know if the
story is still working.

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
  },
  "growth_playbook": {
    "stage": "string, short label",
    "stage_explainer": "string, 1-2 sentences, general + applied to this company",
    "lever_name": "string, short label for the primary growth lever",
    "lever_detail": "string, 1-2 sentences on how this company pulls that lever",
    "biggest_risk": "string, 1-2 sentences",
    "what_to_watch": "string, 1-2 sentences"
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

  function parseJson(raw) {
    let cleaned = raw.trim();
    // Strip accidental markdown fences even though the prompt asks against them.
    cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Claude's response didn't contain JSON.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  async function generateDirect(context) {
    const key = Config.getClaudeKey();
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
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
        const errBody = await res.json();
        detail = errBody?.error?.message || "";
      } catch {
        // ignore
      }
      if (res.status === 401) throw new Error("Anthropic API key was rejected. Check it in Settings.");
      if (res.status === 429) throw new Error("Anthropic rate limit hit. Wait a moment and try again.");
      throw new Error(`Anthropic request failed (HTTP ${res.status}). ${detail}`);
    }

    const message = await res.json();
    return parseJson(extractText(message));
  }

  async function generateViaWorker(context) {
    if (!Config.hasWorker()) {
      throw new Error("No API keys set and no shared demo backend configured. Open Settings and add your own free keys.");
    }
    const res = await fetch(Config.workerUrl("/api/story"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(context),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Demo backend request failed (HTTP ${res.status}).`);
    return data;
  }

  function generateStoryAndSentiment(context) {
    return Config.hasOwnKeys() ? generateDirect(context) : generateViaWorker(context);
  }

  return { generateStoryAndSentiment };
})();
