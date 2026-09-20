const Render = (() => {
  let revenueChart = null;
  let priceChart = null;

  function setStatus(text, isError = false) {
    const el = document.getElementById("statusLine");
    el.textContent = text;
    el.classList.toggle("error", isError);
  }

  function showResults() {
    document.getElementById("results").classList.remove("hidden");
  }

  function demoBanner(text) {
    const el = document.getElementById("demoBanner");
    if (!text) {
      el.classList.add("hidden");
      return;
    }
    el.textContent = text;
    el.classList.remove("hidden");
  }

  function privateBanner(text) {
    const el = document.getElementById("privateBanner");
    if (!text) {
      el.classList.add("hidden");
      return;
    }
    el.textContent = text;
    el.classList.remove("hidden");
  }

  function companyHeader({ name, ticker, period, assumptionNote }) {
    document.getElementById("companyName").textContent = name;
    document.getElementById("companyTicker").textContent = ticker;
    document.getElementById("companyPeriod").textContent = period ? `As of ${period}` : "";
    const noteEl = document.getElementById("assumptionNote");
    if (assumptionNote) {
      noteEl.textContent = `Assumption: ${assumptionNote}`;
      noteEl.classList.remove("hidden");
    } else {
      noteEl.classList.add("hidden");
    }
  }

  function metrics(list) {
    const grid = document.getElementById("numbersGrid");
    grid.innerHTML = list
      .map(
        (m, i) => `
      <div class="metric-card" style="animation-delay: ${i * 0.05}s">
        <div class="metric-name">${escapeHtml(m.metric)}</div>
        <div class="metric-value">${m.value !== null && m.value !== undefined ? escapeHtml(String(m.value)) : "—"}</div>
        <div class="metric-period">${escapeHtml(m.period || "")}</div>
        <div class="metric-plain">${escapeHtml(m.plain_english)}</div>
        <div class="metric-source">
          ${m.source_url ? `<a href="${escapeAttr(m.source_url)}" target="_blank" rel="noopener">${escapeHtml(m.source)}</a>` : escapeHtml(m.source || "")}
        </div>
      </div>`
      )
      .join("");
  }

  function revenueTrend(quarterlyReports) {
    const ctx = document.getElementById("revenueChart");
    const reports = [...quarterlyReports].slice(0, 8).reverse();
    const labels = reports.map((r) => r.fiscalDateEnding);
    const values = reports.map((r) => parseFloat(r.totalRevenue) / 1e9);

    if (revenueChart) revenueChart.destroy();
    revenueChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "Revenue ($B)", data: values, backgroundColor: "#7dd3c0" }],
      },
      options: chartOptions("$B"),
    });
  }

  function priceTrend(points) {
    const ctx = document.getElementById("priceChart");
    if (priceChart) priceChart.destroy();
    if (!points || points.length === 0) return;
    priceChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: points.map((p) => p.date),
        datasets: [
          {
            label: "Close price ($)",
            data: points.map((p) => p.close),
            borderColor: "#f2b880",
            backgroundColor: "rgba(242,184,128,0.15)",
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: chartOptions("$"),
    });
  }

  function chartOptions(unitLabel) {
    return {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#a6acbb" }, grid: { color: "#262b38" } },
        y: {
          ticks: { color: "#a6acbb", callback: (v) => `${unitLabel === "$" ? "$" : ""}${v}${unitLabel === "$B" ? "B" : ""}` },
          grid: { color: "#262b38" },
        },
      },
    };
  }

  // Renders the company's arc as a clickable vertical mind-map / timeline
  // instead of a wall of prose — one node per stage (origin, struggle,
  // inflection, today), collapsed to a headline until clicked.
  function storyMap(stages) {
    const el = document.getElementById("storyMap");
    el.innerHTML = stages
      .map(
        (s, i) => `
      <div class="story-node" data-index="${i}">
        <div class="node-rail">
          <div class="node-dot">${i + 1}</div>
          <div class="node-line"></div>
        </div>
        <div class="node-body">
          <div class="node-period">${escapeHtml(s.period || "")}</div>
          <div class="node-headline">${escapeHtml(s.headline)}</div>
          <div class="node-toggle">${escapeHtml(s.label || "")} — click to expand</div>
          <div class="node-detail">${escapeHtml(s.detail)}</div>
        </div>
      </div>`
      )
      .join("");

    el.querySelectorAll(".story-node").forEach((node) => {
      node.addEventListener("click", () => node.classList.toggle("open"));
    });

    // Open the first node by default so the section doesn't look empty/inert.
    const first = el.querySelector(".story-node");
    if (first) first.classList.add("open");
  }

  function storyMapLoading() {
    document.getElementById("storyMap").innerHTML = `<div class="skeleton" style="height:200px"></div>`;
  }

  function storyMapError(msg) {
    document.getElementById("storyMap").innerHTML = `<p style="color:var(--bad)">Couldn't generate the story: ${escapeHtml(msg)}</p>`;
  }

  function setChartsVisible(visible) {
    document.getElementById("chartsGrid").classList.toggle("hidden", !visible);
  }

  function comparisonUnavailable(text) {
    document.getElementById("comparison").innerHTML = `<p style="color:var(--text-dim)">${escapeHtml(text)}</p>`;
  }

  function setNavPillEnabled(target, enabled) {
    const pill = document.querySelector(`.nav-pill[data-target="${target}"]`);
    if (pill) pill.classList.toggle("disabled", !enabled);
  }

  function comparisonLoading() {
    document.getElementById("comparison").innerHTML = `<div class="skeleton" style="height:160px"></div>`;
  }

  function comparisonError(msg) {
    document.getElementById("comparison").innerHTML = `<p style="color:var(--bad)">Couldn't build the comparison: ${escapeHtml(msg)}</p>`;
  }

  function comparison({ isLeader, leaderName, companyName, rows }) {
    const el = document.getElementById("comparison");
    const leaderNote = isLeader
      ? `<div class="leader-note">There's no real rival at this scale right now for ${escapeHtml(companyName)} — here's the gap to the #2 player.</div>`
      : `<div class="leader-note">Compared against the category leader.</div>`;

    const rowsHtml = rows
      .map(
        (r, i) => `
      <tr style="animation: cardIn 0.35s ease backwards; animation-delay: ${i * 0.06}s">
        <td>${escapeHtml(r.metric)}</td>
        <td>${escapeHtml(r.this_company)}</td>
        <td>${escapeHtml(r.comparison_company)}</td>
      </tr>
      <tr class="takeaway-row"><td></td><td colspan="2">${escapeHtml(r.takeaway)}</td></tr>`
      )
      .join("");

    el.innerHTML = `
      <div class="vs-header">
        <span class="vs-badge">${escapeHtml(companyName)}</span>
        <span class="vs-divider">VS</span>
        <span class="vs-badge">${escapeHtml(leaderName)}</span>
      </div>
      ${leaderNote}
      <table>
        <thead><tr><th>Metric</th><th>${escapeHtml(companyName)}</th><th>${escapeHtml(leaderName)}</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;
  }

  function redditLoading() {
    document.getElementById("redditPulse").innerHTML = `<div class="skeleton" style="height:100px"></div><div class="skeleton" style="height:100px"></div>`;
  }

  function redditError(msg) {
    document.getElementById("redditPulse").innerHTML = `<p style="color:var(--bad)">Couldn't load sentiment: ${escapeHtml(msg)}</p>`;
  }

  function redditPulse({ thought_bubbles }) {
    const el = document.getElementById("redditPulse");
    el.innerHTML = thought_bubbles
      .map(
        (b, i) => `
      <div class="bubble bubble-${escapeAttr(b.sentiment)}" style="animation-delay: ${i * 0.08}s">
        <span class="bubble-tag">${escapeHtml(b.sentiment)}</span>
        <div>${escapeHtml(b.take)}</div>
      </div>`
      )
      .join("");
  }

  function dataGaps(list) {
    const el = document.getElementById("dataGaps");
    if (!list || list.length === 0) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    el.innerHTML = `<h4>Data we couldn't find</h4><ul>${list.map((g) => `<li>${escapeHtml(g)}</li>`).join("")}</ul>`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return String(str ?? "").replace(/"/g, "&quot;");
  }

  return {
    setStatus,
    showResults,
    demoBanner,
    privateBanner,
    companyHeader,
    metrics,
    revenueTrend,
    priceTrend,
    storyMap,
    storyMapLoading,
    storyMapError,
    comparisonLoading,
    comparisonError,
    comparisonUnavailable,
    comparison,
    setChartsVisible,
    setNavPillEnabled,
    redditLoading,
    redditError,
    redditPulse,
    dataGaps,
  };
})();
