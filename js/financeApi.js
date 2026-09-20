// All financial numbers come from Alpha Vantage (https://www.alphavantage.co/).
// Every value here is fetched live and computed deterministically — never guessed.
const FinanceApi = (() => {
  const BASE = "https://www.alphavantage.co/query";

  async function avFetch(params) {
    const key = Config.getAlphaVantageKey();
    if (!key) throw new Error("Missing Alpha Vantage API key. Open Settings and add one (it's free).");

    const url = new URL(BASE);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    url.searchParams.set("apikey", key);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Alpha Vantage request failed (HTTP ${res.status}).`);
    const data = await res.json();

    if (data["Error Message"]) throw new Error(data["Error Message"]);
    if (data["Note"]) throw new Error("Alpha Vantage rate limit hit — free keys allow a limited number of requests per day/minute. Wait a bit and try again.");
    if (data["Information"]) throw new Error(data["Information"]);
    return data;
  }

  async function resolveSymbol(query) {
    const data = await avFetch({ function: "SYMBOL_SEARCH", keywords: query });
    const matches = data.bestMatches || [];
    const equities = matches.filter((m) => m["3. type"] === "Equity");
    const best = equities[0] || matches[0];
    if (!best) throw new Error(`No publicly traded company found matching "${query}". If this is a private company or startup, it likely isn't public yet.`);
    return { symbol: best["1. symbol"], name: best["2. name"], region: best["4. region"] };
  }

  async function getOverview(symbol) {
    const data = await avFetch({ function: "OVERVIEW", symbol });
    if (!data || !data.Symbol) throw new Error(`Alpha Vantage has no company overview for "${symbol}".`);
    return data;
  }

  async function getIncomeStatement(symbol) {
    const data = await avFetch({ function: "INCOME_STATEMENT", symbol });
    if (!data || (!data.quarterlyReports && !data.annualReports)) {
      throw new Error(`No income statement disclosed for "${symbol}".`);
    }
    return data;
  }

  async function getMonthlyPrices(symbol) {
    const data = await avFetch({ function: "TIME_SERIES_MONTHLY", symbol });
    const series = data["Monthly Time Series"];
    if (!series) return null;
    const points = Object.entries(series)
      .slice(0, 13)
      .map(([date, v]) => ({ date, close: parseFloat(v["4. close"]) }))
      .reverse();
    return points;
  }

  function num(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  function fmtMoney(n) {
    if (n === null) return null;
    const abs = Math.abs(n);
    if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    return `$${n.toLocaleString()}`;
  }

  function fmtPct(n) {
    if (n === null) return null;
    return `${(n * 100).toFixed(1)}%`;
  }

  // Builds the "numbers" array (metric, value, period, plain_english, source) purely from
  // live data — the LLM never touches these figures.
  function buildMetrics(symbol, overview, income, monthlyPrices) {
    const metrics = [];
    const gaps = [];
    const sourceUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}`;

    const qReports = income.quarterlyReports || [];
    const latestQ = qReports[0];
    const prevYearQ = qReports[4]; // same quarter, prior year -> YoY

    // Revenue + YoY growth
    if (latestQ) {
      const rev = num(latestQ.totalRevenue);
      metrics.push({
        metric: "Revenue (most recent quarter)",
        value: fmtMoney(rev),
        period: latestQ.fiscalDateEnding,
        plain_english: `This is the total amount of money the company brought in from sales in this quarter alone, before any costs are subtracted.`,
        source: "Alpha Vantage (from company income statement)",
        source_url: sourceUrl,
      });

      if (prevYearQ) {
        const prevRev = num(prevYearQ.totalRevenue);
        if (rev !== null && prevRev) {
          const growth = (rev - prevRev) / prevRev;
          const growing = growth >= 0;
          metrics.push({
            metric: "Revenue growth (year-over-year)",
            value: fmtPct(growth),
            period: `${latestQ.fiscalDateEnding} vs ${prevYearQ.fiscalDateEnding}`,
            plain_english: growing
              ? `The company is selling ${fmtPct(Math.abs(growth))} more than it did in the same quarter last year — a sign real demand is growing, not just staying flat.`
              : `The company sold ${fmtPct(Math.abs(growth))} less than it did in the same quarter last year — worth watching to see if it's a temporary dip or a longer slowdown.`,
            source: "Alpha Vantage (computed from company income statements)",
            source_url: sourceUrl,
          });
        }
      } else {
        gaps.push("Year-over-year revenue growth couldn't be computed — not enough historical quarters were disclosed.");
      }
    } else {
      gaps.push("Quarterly revenue hasn't been disclosed by this source.");
    }

    // Net income
    if (latestQ && latestQ.netIncome !== undefined) {
      const ni = num(latestQ.netIncome);
      if (ni !== null) {
        metrics.push({
          metric: "Net income (most recent quarter)",
          value: fmtMoney(ni),
          period: latestQ.fiscalDateEnding,
          plain_english: ni >= 0
            ? `The company earned more than it spent this quarter — it's currently profitable.`
            : `The company spent more than it earned this quarter (a net loss) — common for companies investing heavily in growth, but worth watching if it continues for years.`,
          source: "Alpha Vantage (from company income statement)",
          source_url: sourceUrl,
        });
      }
    }

    // Gross margin
    if (latestQ && latestQ.grossProfit && latestQ.totalRevenue) {
      const gp = num(latestQ.grossProfit);
      const rev = num(latestQ.totalRevenue);
      if (gp !== null && rev) {
        const margin = gp / rev;
        metrics.push({
          metric: "Gross margin",
          value: fmtPct(margin),
          period: latestQ.fiscalDateEnding,
          plain_english: `For every dollar of sales, about ${(margin * 100).toFixed(0)} cents is left after covering the direct cost of making the product or delivering the service — the rest goes toward everything else the business needs (salaries, marketing, R&D, rent).`,
          source: "Alpha Vantage (computed from company income statement)",
          source_url: sourceUrl,
        });
      }
    } else {
      gaps.push("Gross margin couldn't be computed — gross profit wasn't disclosed for the latest quarter.");
    }

    // Market cap
    const marketCap = num(overview.MarketCapitalization);
    if (marketCap) {
      metrics.push({
        metric: "Market capitalization",
        value: fmtMoney(marketCap),
        period: "current",
        plain_english: `This is what the stock market currently thinks the entire company is worth — all its shares added up. It moves with investor sentiment, not just financial performance.`,
        source: "Alpha Vantage (company overview)",
        source_url: sourceUrl,
      });
    } else {
      gaps.push("Market capitalization wasn't available.");
    }

    // Price performance over ~12 months
    if (monthlyPrices && monthlyPrices.length >= 2) {
      const first = monthlyPrices[0].close;
      const last = monthlyPrices[monthlyPrices.length - 1].close;
      const change = (last - first) / first;
      metrics.push({
        metric: "Stock price change (past ~12 months)",
        value: fmtPct(change),
        period: `${monthlyPrices[0].date} to ${monthlyPrices[monthlyPrices.length - 1].date}`,
        plain_english: change >= 0
          ? `The stock is worth ${fmtPct(Math.abs(change))} more than it was a year ago — investors have grown more optimistic (or at least less pessimistic) about the company's future.`
          : `The stock is worth ${fmtPct(Math.abs(change))} less than it was a year ago — investors have grown more cautious, which can reflect the business, the industry, or the broader market.`,
        source: "Alpha Vantage (monthly closing prices)",
        source_url: `https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY&symbol=${symbol}`,
      });
    } else {
      gaps.push("12-month stock price history wasn't available.");
    }

    // Dividend / cash notes
    if (overview.DividendYield && num(overview.DividendYield) > 0) {
      metrics.push({
        metric: "Dividend yield",
        value: fmtPct(num(overview.DividendYield)),
        period: "current",
        plain_english: `The company pays shareholders a small cash reward just for holding the stock — typically a sign of a mature, cash-generating business rather than one plowing every dollar back into growth.`,
        source: "Alpha Vantage (company overview)",
        source_url: sourceUrl,
      });
    }

    return { metrics, gaps };
  }

  return { resolveSymbol, getOverview, getIncomeStatement, getMonthlyPrices, buildMetrics, fmtMoney, fmtPct, num };
})();
