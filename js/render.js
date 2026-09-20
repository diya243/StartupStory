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
        (m) => `
      <div class="metric-card">
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

  function narrative(text) {
    const el = document.getElementById("narrative");
    const paragraphs = text
      .split(/\n\s*\n/)
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
      .join("");
    el.innerHTML = paragraphs || `<p>${escapeHtml(text)}</p>`;
  }

  function narrativeLoading() {
    document.getElementById("narrative").innerHTML = `<div class="skeleton" style="height:120px"></div>`;
  }

  function narrativeError(msg) {
    document.getElementById("narrative").innerHTML = `<p style="color:var(--bad)">Couldn't generate the narrative: ${escapeHtml(msg)}</p>`;
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
      ? `<div class="leader-note">There's no real rival at this scale right now for ${escapeHtml(companyName)} — here's the gap to the #2 player, ${escapeHtml(leaderName)}.</div>`
      : `<div class="leader-note">Compared against the category leader: ${escapeHtml(leaderName)}.</div>`;

    const rowsHtml = rows
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(r.metric)}</td>
        <td>${escapeHtml(r.this_company)}</td>
        <td>${escapeHtml(r.comparison_company)}</td>
      </tr>
      <tr class="takeaway-row"><td></td><td colspan="2">${escapeHtml(r.takeaway)}</td></tr>`
      )
      .join("");

    el.innerHTML = `
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
        (b) => `
      <div class="bubble bubble-${escapeAttr(b.sentiment)}">
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
    companyHeader,
    metrics,
    revenueTrend,
    priceTrend,
    narrative,
    narrativeLoading,
    narrativeError,
    comparisonLoading,
    comparisonError,
    comparison,
    redditLoading,
    redditError,
    redditPulse,
    dataGaps,
  };
})();
