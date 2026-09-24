(function () {
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const avKeyInput = document.getElementById("avKeyInput");
  const claudeKeyInput = document.getElementById("claudeKeyInput");
  const saveKeysBtn = document.getElementById("saveKeysBtn");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const toast = document.getElementById("statusToast");

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
    setStatus("Keys saved.");
  });

  function setStatus(msg, isError) {
    if (!msg) {
      toast.classList.add("hidden");
      return;
    }
    toast.textContent = msg;
    toast.classList.toggle("error", !!isError);
    toast.classList.remove("hidden");
    if (!isError) setTimeout(() => toast.classList.add("hidden"), 3500);
  }

  function buildComparisonRows(companyName, leaderName, ov, leaderOv) {
    const rows = [];
    function addRow(label, thisRaw, otherRaw, formatter, takeaway) {
      const thisVal = FinanceApi.num(thisRaw);
      const otherVal = FinanceApi.num(otherRaw);
      if (thisVal === null || otherVal === null) return;
      rows.push({ metric: label, this_company: formatter(thisVal), comparison_company: formatter(otherVal), takeaway: takeaway(thisVal, otherVal) });
    }
    addRow("Market capitalization", ov.MarketCapitalization, leaderOv.MarketCapitalization, FinanceApi.fmtMoney, (a, b) =>
      a >= b
        ? `${companyName} is worth more of the market's confidence right now, valued ${(a / b).toFixed(1)}x higher than ${leaderName}.`
        : `${leaderName} is valued ${(b / a).toFixed(1)}x higher than ${companyName} — the market currently sees it as the much bigger business.`
    );
    addRow("Revenue (trailing 12 months)", ov.RevenueTTM, leaderOv.RevenueTTM, FinanceApi.fmtMoney, (a, b) =>
      a >= b
        ? `${companyName} brings in ${(a / b).toFixed(1)}x more revenue than ${leaderName}.`
        : `${leaderName} brings in ${(b / a).toFixed(1)}x more revenue than ${companyName} — still the bigger seller by volume.`
    );
    addRow("Profit margin", ov.ProfitMargin, leaderOv.ProfitMargin, FinanceApi.fmtPct, (a, b) =>
      a >= b
        ? `${companyName} keeps more of every sales dollar as profit than ${leaderName} does.`
        : `${leaderName} keeps more of every sales dollar as profit than ${companyName} does — it runs a leaner or higher-priced operation.`
    );
    addRow("Revenue growth (year-over-year)", ov.QuarterlyRevenueGrowthYOY, leaderOv.QuarterlyRevenueGrowthYOY, FinanceApi.fmtPct, (a, b) =>
      a >= b
        ? `${companyName} is growing revenue faster than ${leaderName}, even if it's smaller overall.`
        : `${leaderName} is growing revenue faster than ${companyName} right now.`
    );
    return rows;
  }

  // ---------------- Demo company list (landing screen) ----------------
  const DEMO_LIST = [
    { kind: "demo", key: "tsla", title: "Tesla" },
    { kind: "demo", key: "aapl", title: "Apple" },
    { kind: "demo", key: "nvda", title: "Nvidia" },
    { kind: "private", key: "fampay", title: "FamPay" },
    { kind: "private", key: "snabbit", title: "Snabbit" },
  ];

  // ---------------- Data loaders -> full company node ----------------

  async function loadDemoCompanyNode(key) {
    const res = await fetch(`data/demo/${key}.json`);
    if (!res.ok) throw new Error("Couldn't load demo data.");
    const data = await res.json();

    const { metrics: rawMetrics, gaps } = FinanceApi.buildMetrics(data.resolved.symbol, data.overview, data.income, data.monthlyPrices);
    const metrics = rawMetrics.map((m) => ({
      ...m,
      source: "Demo dataset (researched from public filings/market data)",
      source_url: `https://stockanalysis.com/stocks/${data.resolved.symbol}/`,
    }));
    const rows = buildComparisonRows(data.overview.Name, data.leader.name, data.overview, data.leaderOverview);

    return TreeBuilder.buildCompanyNode({
      id: `demo-${key}`,
      title: data.overview.Name,
      subtitle: `${data.resolved.symbol} · Demo, captured ${data.capturedOn}`,
      meta: null,
      metrics,
      quarterlyReports: data.income.quarterlyReports,
      monthlyPrices: data.monthlyPrices,
      narrativeStages: data.narrative_stages,
      playbook: data.growth_playbook,
      comparison: { isLeader: !!data.leader.is_queried_company_leader, leaderName: data.leader.name, companyName: data.overview.Name, rows },
      redditPulse: data.reddit_pulse,
      dataGaps: gaps,
    });
  }

  async function loadPrivateCompanyNode(key) {
    const res = await fetch(`data/demo/private/${key}.json`);
    if (!res.ok) throw new Error("Couldn't load demo data.");
    const data = await res.json();

    return TreeBuilder.buildCompanyNode({
      id: `private-${key}`,
      title: data.name,
      subtitle: `Private · ${data.category} · not exchange-listed`,
      meta: null,
      metrics: data.metrics,
      quarterlyReports: null,
      monthlyPrices: null,
      narrativeStages: data.narrative_stages,
      playbook: data.growth_playbook,
      comparison: null,
      redditPulse: data.reddit_pulse,
      dataGaps: data.dataGaps,
    });
  }

  async function loadLiveCompanyNode(query) {
    if (!Config.canRun()) {
      openSettings();
      throw new Error("Add your Alpha Vantage and Anthropic API keys in Settings first.");
    }
    const resolved = await FinanceApi.resolveSymbol(query);
    const { overview, income, monthlyPrices } = await FinanceApi.getFinancials(resolved.symbol);
    const { metrics, gaps } = FinanceApi.buildMetrics(resolved.symbol, overview, income, monthlyPrices);
    const latestQ = (income.quarterlyReports || [])[0];
    const asOfPeriod = latestQ ? latestQ.fiscalDateEnding : "unknown";

    let story;
    try {
      story = await ClaudeApi.generateStoryAndSentiment({
        companyName: overview.Name || resolved.name,
        ticker: resolved.symbol,
        sector: overview.Sector,
        industry: overview.Industry,
        asOfPeriod,
        metrics,
      });
    } catch (err) {
      story = { narrative_stages: [], market_leader: null, reddit_pulse: null, growth_playbook: null };
    }

    let comparison = null;
    if (story.market_leader && story.market_leader.ticker) {
      try {
        const leaderOv = await FinanceApi.getOverview(story.market_leader.ticker);
        const rows = buildComparisonRows(overview.Name || resolved.name, story.market_leader.name, overview, leaderOv);
        if (rows.length) {
          comparison = { isLeader: !!story.market_leader.is_queried_company_leader, leaderName: story.market_leader.name, companyName: overview.Name || resolved.name, rows };
        }
      } catch {
        // comparison just won't be available for this company
      }
    }

    return TreeBuilder.buildCompanyNode({
      id: `live-${resolved.symbol}`,
      title: overview.Name || resolved.name,
      subtitle: `${resolved.symbol} · ${overview.Exchange || resolved.region} · As of ${asOfPeriod}`,
      meta: null,
      metrics,
      quarterlyReports: income.quarterlyReports,
      monthlyPrices,
      narrativeStages: story.narrative_stages,
      playbook: story.growth_playbook,
      comparison,
      redditPulse: story.reddit_pulse,
      dataGaps: gaps,
    });
  }

  // ---------------- Explorer wiring ----------------

  async function runLiveSearch(query) {
    Explorer.showCompanyLoading(query);
    try {
      const node = await loadLiveCompanyNode(query);
      Explorer.showCompany(node);
      setStatus("");
    } catch (err) {
      Explorer.showCompanyError(err.message);
    }
  }

  async function selectDemo(kind, key) {
    if (kind === "landing") {
      Explorer.showDemoList(DEMO_LIST);
      return;
    }
    const title = (DEMO_LIST.find((d) => d.kind === kind && d.key === key) || {}).title || key;
    Explorer.showCompanyLoading(title);
    try {
      const node = kind === "demo" ? await loadDemoCompanyNode(key) : await loadPrivateCompanyNode(key);
      Explorer.showCompany(node);
    } catch (err) {
      Explorer.showCompanyError(err.message);
    }
  }

  Explorer.init({ onSearch: runLiveSearch, onSelectDemo: selectDemo });
  Explorer.showDemoList(DEMO_LIST);
})();
