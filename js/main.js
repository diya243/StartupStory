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

  // ---------------- Root brand node ----------------
  const DEMO_COMPANIES = [
    { key: "tsla", title: "Tesla" },
    { key: "aapl", title: "Apple" },
    { key: "nvda", title: "Nvidia" },
  ];
  const PRIVATE_COMPANIES = [
    { key: "fampay", title: "FamPay" },
    { key: "snabbit", title: "Snabbit" },
  ];

  function buildRootNode() {
    const children = [
      ...DEMO_COMPANIES.map((c) => ({ id: `demo-${c.key}`, title: c.title, subtitle: "Live-data demo", kind: "company", children: null, leaf: null, _lazy: { type: "demo", key: c.key } })),
      ...PRIVATE_COMPANIES.map((c) => ({ id: `private-${c.key}`, title: c.title, subtitle: "Private company", kind: "company", children: null, leaf: null, _lazy: { type: "private", key: c.key } })),
    ];
    return {
      id: "root",
      title: "Startup Story",
      subtitle: "Learn growth from the companies you already know",
      kind: "brand",
      children,
      leaf: null,
    };
  }

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

  // ---------------- Orbit wiring ----------------

  function wireSearchForm() {
    const form = document.getElementById("orbitSearchForm");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("orbitSearchInput");
      const query = input.value.trim();
      if (query) runLiveSearch(query);
    });
  }

  async function runLiveSearch(query) {
    const stub = { id: "live-loading", title: query, subtitle: "Looking up…", kind: "company", loading: true, children: null, leaf: null };
    Orbit.push(stub);
    try {
      const node = await loadLiveCompanyNode(query);
      Orbit.replaceFocus(node);
      setStatus("");
    } catch (err) {
      Orbit.replaceFocus({ ...stub, loading: false, error: err.message });
    }
  }

  Orbit.init(buildRootNode(), {
    afterRender: wireSearchForm,
    onSelect: async (node, proceed) => {
      if (!node._lazy) {
        proceed();
        return;
      }
      const stub = { id: node.id, title: node.title, subtitle: "Loading…", kind: "company", loading: true, children: null, leaf: null };
      Orbit.push(stub);
      try {
        const full =
          node._lazy.type === "demo" ? await loadDemoCompanyNode(node._lazy.key) : await loadPrivateCompanyNode(node._lazy.key);
        Orbit.replaceFocus(full);
      } catch (err) {
        Orbit.replaceFocus({ ...stub, loading: false, error: err.message });
      }
    },
  });
})();
