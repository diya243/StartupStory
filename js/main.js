(function () {
  const form = document.getElementById("searchForm");
  const input = document.getElementById("companyInput");
  const searchBtn = document.getElementById("searchBtn");

  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const avKeyInput = document.getElementById("avKeyInput");
  const claudeKeyInput = document.getElementById("claudeKeyInput");
  const saveKeysBtn = document.getElementById("saveKeysBtn");
  const closeModalBtn = document.getElementById("closeModalBtn");

  function openSettings() {
    avKeyInput.value = Config.getAlphaVantageKey();
    claudeKeyInput.value = Config.getClaudeKey();
    settingsModal.classList.remove("hidden");
  }
  function closeSettings() {
    settingsModal.classList.add("hidden");
  }

  settingsBtn.addEventListener("click", openSettings);
  closeModalBtn.addEventListener("click", closeSettings);
  saveKeysBtn.addEventListener("click", () => {
    Config.setAlphaVantageKey(avKeyInput.value.trim());
    Config.setClaudeKey(claudeKeyInput.value.trim());
    closeSettings();
    Render.setStatus("Keys saved.");
  });

  function buildComparisonRows(companyName, leaderName, ov, leaderOv) {
    const rows = [];

    function addRow(label, thisRaw, otherRaw, formatter, takeaway) {
      const thisVal = FinanceApi.num(thisRaw);
      const otherVal = FinanceApi.num(otherRaw);
      if (thisVal === null || otherVal === null) return;
      rows.push({
        metric: label,
        this_company: formatter(thisVal),
        comparison_company: formatter(otherVal),
        takeaway: takeaway(thisVal, otherVal),
      });
    }

    addRow(
      "Market capitalization",
      ov.MarketCapitalization,
      leaderOv.MarketCapitalization,
      FinanceApi.fmtMoney,
      (a, b) => {
        const ratio = b / a;
        return a >= b
          ? `${companyName} is worth more of the market's confidence right now, valued ${(a / b).toFixed(1)}x higher than ${leaderName}.`
          : `${leaderName} is valued ${ratio.toFixed(1)}x higher than ${companyName} — the market currently sees it as the much bigger business.`;
      }
    );

    addRow(
      "Revenue (trailing 12 months)",
      ov.RevenueTTM,
      leaderOv.RevenueTTM,
      FinanceApi.fmtMoney,
      (a, b) => {
        const ratio = a >= b ? a / b : b / a;
        return a >= b
          ? `${companyName} brings in ${ratio.toFixed(1)}x more revenue than ${leaderName}.`
          : `${leaderName} brings in ${ratio.toFixed(1)}x more revenue than ${companyName} — still the bigger seller by volume.`;
      }
    );

    addRow(
      "Profit margin",
      ov.ProfitMargin,
      leaderOv.ProfitMargin,
      FinanceApi.fmtPct,
      (a, b) =>
        a >= b
          ? `${companyName} keeps more of every sales dollar as profit than ${leaderName} does.`
          : `${leaderName} keeps more of every sales dollar as profit than ${companyName} does — it runs a leaner or higher-priced operation.`
    );

    addRow(
      "Revenue growth (year-over-year)",
      ov.QuarterlyRevenueGrowthYOY,
      leaderOv.QuarterlyRevenueGrowthYOY,
      FinanceApi.fmtPct,
      (a, b) =>
        a >= b
          ? `${companyName} is growing revenue faster than ${leaderName}, even if it's smaller overall.`
          : `${leaderName} is growing revenue faster than ${companyName} right now.`
    );

    return rows;
  }

  async function runNarrativeAndComparison(context) {
    Render.narrativeLoading();
    Render.redditLoading();
    Render.comparisonLoading();

    let story;
    try {
      story = await ClaudeApi.generateStoryAndSentiment(context);
    } catch (err) {
      Render.narrativeError(err.message);
      Render.redditError(err.message);
      Render.comparisonError(err.message);
      return;
    }

    Render.narrative(story.narrative || "No narrative was returned.");

    if (story.reddit_pulse && Array.isArray(story.reddit_pulse.thought_bubbles) && story.reddit_pulse.thought_bubbles.length) {
      Render.redditPulse(story.reddit_pulse);
    } else {
      Render.redditError("No sentiment data was returned.");
    }

    const leader = story.market_leader;
    if (!leader || !leader.ticker) {
      Render.comparisonError("Claude couldn't identify a comparable market leader with a ticker symbol.");
      return;
    }

    try {
      const leaderOv = await FinanceApi.getOverview(leader.ticker);
      const rows = buildComparisonRows(context.companyName, leader.name, context.overview, leaderOv);
      if (rows.length === 0) {
        Render.comparisonError("Not enough shared metrics were disclosed by both companies to compare.");
        return;
      }
      Render.comparison({
        isLeader: !!leader.is_queried_company_leader,
        leaderName: leader.name,
        companyName: context.companyName,
        rows,
      });
    } catch (err) {
      Render.comparisonError(err.message);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) return;

    if (!Config.canRun()) {
      Render.setStatus("Add your Alpha Vantage and Anthropic API keys in Settings first.", true);
      openSettings();
      return;
    }

    searchBtn.disabled = true;
    document.getElementById("results").classList.add("hidden");
    Render.demoBanner(null);
    Render.setStatus(`Looking up "${query}"…`);

    try {
      const resolved = await FinanceApi.resolveSymbol(query);
      Render.setStatus(`Found ${resolved.name} (${resolved.symbol}). Fetching financials…`);

      const { overview, income, monthlyPrices } = await FinanceApi.getFinancials(resolved.symbol);

      const { metrics, gaps } = FinanceApi.buildMetrics(resolved.symbol, overview, income, monthlyPrices);
      const latestQ = (income.quarterlyReports || [])[0];
      const asOfPeriod = latestQ ? latestQ.fiscalDateEnding : "unknown";

      const queryLower = query.toLowerCase();
      const nameLower = (overview.Name || resolved.name).toLowerCase();
      const isAmbiguous = !nameLower.includes(queryLower) && !queryLower.includes(nameLower.split(" ")[0]);

      Render.companyHeader({
        name: overview.Name || resolved.name,
        ticker: `${resolved.symbol} · ${overview.Exchange || resolved.region}`,
        period: asOfPeriod,
        assumptionNote: isAmbiguous ? `You searched "${query}" — showing results for ${overview.Name || resolved.name} (${resolved.symbol}).` : null,
      });

      Render.metrics(metrics);
      Render.dataGaps(gaps);
      if (income.quarterlyReports?.length) Render.revenueTrend(income.quarterlyReports);
      Render.priceTrend(monthlyPrices);
      Render.showResults();
      Render.setStatus("");

      runNarrativeAndComparison({
        companyName: overview.Name || resolved.name,
        ticker: resolved.symbol,
        sector: overview.Sector,
        industry: overview.Industry,
        asOfPeriod,
        metrics,
        overview,
      });
    } catch (err) {
      Render.setStatus(err.message, true);
    } finally {
      searchBtn.disabled = false;
    }
  });

  // Demo mode: fully static, pre-fetched real data for a few companies.
  // Zero network calls beyond loading the JSON file itself — no keys, no
  // worker, no rate limits, guaranteed to work for anyone who opens the link.
  document.querySelectorAll(".demo-chip").forEach((btn) => {
    btn.addEventListener("click", () => runDemo(btn.dataset.demo));
  });

  async function runDemo(key) {
    document.getElementById("results").classList.add("hidden");
    Render.setStatus(`Loading demo data for ${key.toUpperCase()}…`);

    try {
      const res = await fetch(`data/demo/${key}.json`);
      if (!res.ok) throw new Error("Couldn't load demo data.");
      const data = await res.json();

      const { metrics: rawMetrics, gaps } = FinanceApi.buildMetrics(data.resolved.symbol, data.overview, data.income, data.monthlyPrices);
      // This demo dataset was hand-researched from public sources, not fetched from
      // Alpha Vantage — correct the citation so it doesn't misattribute the source.
      const metrics = rawMetrics.map((m) => ({
        ...m,
        source: "Demo dataset (researched from public filings/market data)",
        source_url: `https://stockanalysis.com/stocks/${data.resolved.symbol}/`,
      }));
      const latestQ = (data.income.quarterlyReports || [])[0];
      const asOfPeriod = latestQ ? latestQ.fiscalDateEnding : "unknown";

      Render.demoBanner(`Demo · real data captured ${data.capturedOn}, not live. Search any other company above for the real-time version.`);
      Render.companyHeader({
        name: data.overview.Name,
        ticker: `${data.resolved.symbol} · ${data.overview.Exchange}`,
        period: asOfPeriod,
        assumptionNote: null,
      });

      Render.metrics(metrics);
      Render.dataGaps(gaps);
      if (data.income.quarterlyReports?.length) Render.revenueTrend(data.income.quarterlyReports);
      Render.priceTrend(data.monthlyPrices);
      Render.showResults();
      Render.setStatus("");

      Render.narrative(data.narrative);
      Render.redditPulse(data.reddit_pulse);

      const rows = buildComparisonRows(data.overview.Name, data.leader.name, data.overview, data.leaderOverview);
      Render.comparison({
        isLeader: !!data.leader.is_queried_company_leader,
        leaderName: data.leader.name,
        companyName: data.overview.Name,
        rows,
      });

      window.scrollTo({ top: document.getElementById("results").offsetTop - 20, behavior: "smooth" });
    } catch (err) {
      Render.setStatus(err.message, true);
    }
  }
})();
