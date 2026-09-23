// Converts the app's existing data shapes (metrics, narrative stages,
// comparison rows, reddit bubbles, growth playbook) into the generic node
// tree the Orbit engine renders. Also carries the "growth lens" teaching
// copy -- generic, reusable explanations of *why* each kind of number/stage/
// take matters for growth strategy, independent of which company it's about.
const TreeBuilder = (() => {
  const METRIC_LENS = {
    "Revenue (most recent quarter)":
      "Revenue is the scoreboard, but growth investors care less about its size than its trajectory (see Revenue Growth) and how efficiently it turns into profit (see Gross Margin).",
    "Revenue growth (year-over-year)":
      "This is the single most-watched number in growth investing. Steady double-digit growth signals a company still winning new demand; deceleration is often the first sign a growth story is maturing, even before profits fall.",
    "Net income (most recent quarter)":
      "Growth-stage companies often accept thin or negative profit on purpose, trading it for market share. Whether that trade is paying off shows up in whether revenue growth and margins are improving over time, not in this number alone.",
    "Gross margin":
      "Gross margin measures pricing power and unit economics. Margins that rise as a company scales suggest a real moat; margins that fall under growth pressure often mean the company is buying growth with discounts.",
    "Market capitalization":
      "Market cap prices in the market's bet on FUTURE growth, not just current results — it's why unprofitable, fast-growing companies can be worth more than profitable, slow ones.",
    "Stock price change (past ~12 months)":
      "Short-term price moves react to expectations, not just fundamentals — a genuinely good quarter can still tank a stock if growth merely met, rather than beat, what investors had already priced in.",
    "Dividend yield":
      "Paying a dividend is a signal a company has shifted from 'growth' to 'compounding' mode — it no longer sees a better use for its cash than handing it back to shareholders.",
  };

  const STAGE_LENS = {
    origin:
      "Every growth story starts with a founder's bet on an unmet need. The ORIGINAL problem a company set out to solve usually still shapes what it optimizes for, years later.",
    struggle:
      "Almost every enduring growth company has a near-death chapter. How it behaved under real pressure — cut costs, or double down — tends to reveal its actual priorities better than any mission statement.",
    inflection:
      "Inflection points are usually where the market re-prices a company: investors stop valuing it on today's numbers and start valuing it on tomorrow's story.",
    today:
      "Today's numbers are the market's report card on whether the original bet is still paying off — and a clue to whether the next inflection point is still ahead, or already behind it.",
  };

  const SENTIMENT_LENS = {
    skeptical:
      "Skeptical takes are a growth story's immune system. Ignore them entirely and you risk buying pure hype; they're often the first place real cracks show up before the numbers confirm it.",
    bullish:
      "Bullish takes usually reveal what the market thinks the NEXT growth chapter is — often a bet on something not yet visible in the current financials at all.",
    neutral:
      "Neutral, structural takes (regulation, competition, market size) rarely move a stock in a day, but they're usually what actually decides a multi-year growth story.",
    insider:
      "Insider and customer-experience takes are the earliest, noisiest signal of whether a growth story is real on the ground — well before it shows up cleanly in quarterly numbers.",
  };

  const COMPARISON_LENS = {
    "Market capitalization":
      "A market-cap gap this size is the market pricing in two different futures, not just two different presents — it's a bet on growth potential, not a scoreboard of who's bigger today.",
    "Revenue (trailing 12 months)":
      "Being smaller on revenue while growing faster is the classic growth-company setup: today's underdog on size, tomorrow's leader on trajectory, if the growth rate holds.",
    "Profit margin":
      "Margin gaps usually explain themselves once you know the strategy: one company may be pricing for growth (lower margin, more volume), the other for profitability (higher margin, more selective).",
    "Revenue growth (year-over-year)":
      "Growth-rate gaps like this are exactly what a growth investor is hunting for — a smaller, faster-growing challenger versus a bigger, slower incumbent.",
  };

  function leaf(id, title, opts) {
    return { id, title, kind: "leaf", leaf: { ...opts }, children: null };
  }

  function category(id, title, subtitle, children) {
    return { id, title, kind: "category", subtitle, children, leaf: null };
  }

  // ---------------- Numbers ----------------
  function buildNumbersCategory(metrics, quarterlyReports, monthlyPrices) {
    const kids = metrics.map((m, i) =>
      leaf(`metric-${i}`, m.metric, {
        value: m.value,
        period: m.period,
        body: m.plain_english,
        lens: METRIC_LENS[m.metric] || null,
        source: m.source,
        sourceUrl: m.source_url,
      })
    );

    if (quarterlyReports && quarterlyReports.length) {
      const rev = [...quarterlyReports].slice(0, 8).reverse();
      kids.push(
        leaf("chart-revenue", "Revenue Trend", {
          body: "Watch the shape, not just the level: a steadily climbing bar chart signals durable demand growth; a flattening or zig-zagging one often means growth is slowing or getting lumpier.",
          lens: "A company can hit an all-time-high revenue number while its GROWTH RATE is quietly decelerating — that deceleration, visible here as a flattening slope, is usually what growth investors react to first.",
          chart: {
            type: "bar",
            label: "Revenue",
            labels: rev.map((r) => r.fiscalDateEnding),
            data: rev.map((r) => parseFloat(r.totalRevenue) / 1e9),
          },
        })
      );
    }
    if (monthlyPrices && monthlyPrices.length) {
      kids.push(
        leaf("chart-price", "Stock Price (12 months)", {
          body: "The stock price is the market's real-time vote on the growth story — it can swing hard on a single earnings call, well before the underlying business actually changes.",
          lens: "Price volatility like this usually means investors disagree about which stage of the growth story the company is in — early innings, peak, or past it.",
          chart: {
            type: "line",
            label: "Close price ($)",
            labels: monthlyPrices.map((p) => p.date),
            data: monthlyPrices.map((p) => p.close),
          },
        })
      );
    }
    return category("numbers", "The Numbers", "Real, sourced financials", kids);
  }

  // ---------------- Story ----------------
  function buildStoryCategory(stages) {
    const kids = (stages || []).map((s) =>
      leaf(s.key, s.headline, {
        value: s.period,
        body: s.detail,
        lens: STAGE_LENS[s.key] || null,
      })
    );
    return category("story", "The Story", "Origin to today", kids);
  }

  // ---------------- Growth Playbook ----------------
  function buildPlaybookCategory(playbook) {
    if (!playbook) return null;
    const kids = [
      leaf("stage", "Growth Stage", {
        value: playbook.stage,
        body: playbook.stage_explainer,
        lens: "Naming the stage matters because the right growth strategy is completely different depending on it — a hypergrowth company should reinvest everything; a mature compounder should return cash to shareholders.",
      }),
      leaf("lever", "Primary Growth Lever", {
        value: playbook.lever_name,
        body: playbook.lever_detail,
        lens: "Every growth strategy ultimately pulls some mix of four levers: more customers, more spend per customer, new markets, or new products. Knowing which one a company leans on tells you what to watch to know if it's still working.",
      }),
      leaf("risk", "Biggest Risk", {
        body: playbook.biggest_risk,
        lens: "The biggest risk to a growth story is rarely the thing already showing up in the numbers — by the time it's in the numbers, the market has usually already repriced the stock.",
      }),
      leaf("watch", "What To Watch", {
        body: playbook.what_to_watch,
        lens: "Every growth story has one metric that will move first if the story is breaking. Tracking that one number is worth more than tracking everything else combined.",
      }),
    ];
    return category("playbook", "Growth Playbook", "How to think about this company", kids);
  }

  // ---------------- Comparison ----------------
  function buildComparisonCategory(comparisonData) {
    if (!comparisonData) return null;
    const { isLeader, leaderName, companyName, rows } = comparisonData;
    if (!rows || !rows.length) return null;
    const kids = rows.map((r, i) =>
      leaf(`cmp-${i}`, r.metric, {
        value: `${r.this_company} vs ${r.comparison_company}`,
        body: r.takeaway,
        lens: COMPARISON_LENS[r.metric] || null,
      })
    );
    const subtitle = isLeader ? `No real rival at this scale — closest peer: ${leaderName}` : `Benchmarked vs. category leader: ${leaderName}`;
    return category("comparison", "vs. The Competition", subtitle, kids);
  }

  // ---------------- Reddit ----------------
  function buildRedditCategory(redditPulse) {
    if (!redditPulse || !redditPulse.thought_bubbles) return null;
    const kids = redditPulse.thought_bubbles.map((b, i) =>
      leaf(`reddit-${i}`, b.sentiment.charAt(0).toUpperCase() + b.sentiment.slice(1), {
        body: b.take,
        lens: SENTIMENT_LENS[b.sentiment] || null,
      })
    );
    return category("reddit", "What Reddit Says", redditPulse.summary_note, kids);
  }

  // ---------------- Full company node ----------------
  function buildCompanyNode({ id, title, subtitle, meta, metrics, quarterlyReports, monthlyPrices, narrativeStages, playbook, comparison, redditPulse, dataGaps }) {
    const children = [];
    children.push(buildNumbersCategory(metrics, quarterlyReports, monthlyPrices));
    const cmp = buildComparisonCategory(comparison);
    if (cmp) children.push(cmp);
    children.push(buildStoryCategory(narrativeStages));
    const pb = buildPlaybookCategory(playbook);
    if (pb) children.push(pb);
    const rd = buildRedditCategory(redditPulse);
    if (rd) children.push(rd);

    if (dataGaps && dataGaps.length) {
      children.push(
        leaf("gaps", "What We Couldn't Find", {
          body: dataGaps.join(" "),
          lens: null,
        })
      );
    }

    return { id, title, subtitle, meta, kind: "company", children, leaf: null };
  }

  return { buildCompanyNode, leaf, category };
})();
