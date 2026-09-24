// The Explorer: a sidebar tree + content panel, replacing the earlier
// full-screen radial zoom UI. Consumes the exact same node tree TreeBuilder
// already produces (company -> category children -> leaf children); this
// file only owns presentation (sidebar rendering, expand/collapse, panel
// content, prev/next cycling, mobile drawer) -- no fetching, no data shaping.
const Explorer = (() => {
  const sidebarBody = document.getElementById("sidebarBody");
  const panelBody = document.getElementById("panelBody");
  const sidebar = document.getElementById("sidebar");
  const drawerScrim = document.getElementById("drawerScrim");
  const drawerToggle = document.getElementById("drawerToggle");

  let onSearch = null;
  let onSelectDemo = null; // (kind: 'demo'|'private', key) => void

  let company = null; // current full company tree, or null on the landing screen
  let demoList = []; // [{ kind, key, title, subtitle }]
  const expanded = new Set(); // expanded category ids
  let activeCategoryId = null;
  let activeLeafId = null;
  let panelMode = "landing"; // 'landing' | 'loading' | 'error' | 'overview' | 'category' | 'leaf'
  let panelMessage = "";

  function init(handlers) {
    onSearch = handlers.onSearch;
    onSelectDemo = handlers.onSelectDemo;

    drawerToggle.addEventListener("click", () => setDrawerOpen(true));
    drawerScrim.addEventListener("click", () => setDrawerOpen(false));

    sidebarBody.addEventListener("click", handleSidebarClick);
    panelBody.addEventListener("click", handlePanelClick);
    // The search box lives inside the landing hero (re-rendered each time),
    // so its submit listener is delegated rather than bound once.
    panelBody.addEventListener("submit", (e) => {
      if (e.target.id !== "landingSearchForm") return;
      e.preventDefault();
      const input = document.getElementById("landingSearchInput");
      const query = input.value.trim();
      if (query && typeof onSearch === "function") onSearch(query);
    });
  }

  function setDrawerOpen(open) {
    sidebar.classList.toggle("open", open);
    drawerScrim.classList.toggle("hidden", !open);
  }

  function showDemoList(list) {
    company = null;
    activeCategoryId = null;
    activeLeafId = null;
    demoList = list;
    panelMode = "landing";
    renderAll();
  }

  function showCompanyLoading(name) {
    panelMode = "loading";
    panelMessage = `Looking up ${name}…`;
    renderPanel();
  }

  function showCompanyError(message) {
    panelMode = "error";
    panelMessage = message;
    renderPanel();
  }

  function showCompany(node) {
    company = node;
    expanded.clear();
    activeCategoryId = null;
    activeLeafId = null;
    panelMode = "overview";
    renderAll();
    setDrawerOpen(false);
  }

  function renderAll() {
    renderSidebar();
    renderPanel();
  }

  // ---------------- sidebar ----------------

  function renderSidebar() {
    if (!company) {
      sidebarBody.innerHTML = renderDemoListHtml();
      return;
    }
    sidebarBody.innerHTML = renderCompanyTreeHtml();
  }

  function renderDemoListHtml() {
    const publicOnes = demoList.filter((d) => d.kind === "demo");
    const privateOnes = demoList.filter((d) => d.kind === "private");
    return `
      <div class="sidebar-section-label">Live-data demos</div>
      <ul class="sidebar-list">
        ${publicOnes.map((d) => `
          <li><button type="button" class="sidebar-list-btn" data-action="select-demo" data-kind="demo" data-key="${escapeAttr(d.key)}">
            <span>${escapeHtml(d.title)}</span>
          </button></li>`).join("")}
      </ul>
      <div class="sidebar-section-label">Private companies</div>
      <ul class="sidebar-list">
        ${privateOnes.map((d) => `
          <li><button type="button" class="sidebar-list-btn" data-action="select-demo" data-kind="private" data-key="${escapeAttr(d.key)}">
            <span>${escapeHtml(d.title)}</span>
          </button></li>`).join("")}
      </ul>`;
  }

  function renderCompanyTreeHtml() {
    const cats = company.children || [];
    const treeHtml = cats
      .map((cat) => {
        const isExpanded = expanded.has(cat.id);
        const isActiveCat = activeCategoryId === cat.id && !activeLeafId;
        const leaves = (cat.children || [])
          .map(
            (leaf) => `
          <li><button type="button" class="tree-leaf-btn ${activeLeafId === leaf.id ? "active" : ""}" data-action="select-leaf" data-cat="${escapeAttr(cat.id)}" data-leaf="${escapeAttr(leaf.id)}">
            ${escapeHtml(leaf.title)}
          </button></li>`
          )
          .join("");
        return `
        <li class="tree-item">
          <button type="button" class="tree-cat-btn ${isActiveCat ? "active" : ""}" data-action="select-category" data-cat="${escapeAttr(cat.id)}">
            <span class="chevron ${isExpanded ? "open" : ""}">&rsaquo;</span>
            <span>${escapeHtml(cat.title)}</span>
          </button>
          <ul class="tree-leaves" ${isExpanded ? "" : "hidden"}>${leaves}</ul>
        </li>`;
      })
      .join("");

    return `
      <button type="button" class="sidebar-back-link" data-action="show-landing">&larr; All companies</button>
      <button type="button" class="sidebar-company-header ${panelMode === "overview" ? "active" : ""}" data-action="show-overview">
        <div class="company-name">${escapeHtml(company.title)}</div>
        ${company.subtitle ? `<div class="company-sub">${escapeHtml(company.subtitle)}</div>` : ""}
      </button>
      <ul class="sidebar-tree">${treeHtml}</ul>`;
  }

  function handleSidebarClick(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "select-demo") {
      if (typeof onSelectDemo === "function") onSelectDemo(btn.dataset.kind, btn.dataset.key);
    } else if (action === "show-landing") {
      if (typeof onSelectDemo === "function") onSelectDemo("landing", null);
    } else if (action === "show-overview") {
      activeCategoryId = null;
      activeLeafId = null;
      panelMode = "overview";
      renderAll();
    } else if (action === "select-category") {
      const catId = btn.dataset.cat;
      const wasExpanded = expanded.has(catId);
      // Clicking a category both toggles its leaf list AND shows the
      // category overview -- one click gets you both wayfinding and content.
      if (wasExpanded && activeCategoryId === catId && !activeLeafId) {
        expanded.delete(catId);
      } else {
        expanded.add(catId);
      }
      activeCategoryId = catId;
      activeLeafId = null;
      panelMode = "category";
      renderAll();
    } else if (action === "select-leaf") {
      selectLeaf(btn.dataset.cat, btn.dataset.leaf);
    }
  }

  function selectLeaf(catId, leafId) {
    expanded.add(catId);
    activeCategoryId = catId;
    activeLeafId = leafId;
    panelMode = "leaf";
    renderAll();
    panelBody.scrollTop = 0;
  }

  function findCategory(catId) {
    return (company && company.children || []).find((c) => c.id === catId) || null;
  }

  function goToSibling(delta) {
    const cat = findCategory(activeCategoryId);
    if (!cat) return;
    const siblings = cat.children || [];
    const idx = siblings.findIndex((s) => s.id === activeLeafId);
    if (idx === -1 || siblings.length < 2) return;
    const newIdx = (idx + delta + siblings.length) % siblings.length;
    activeLeafId = siblings[newIdx].id;
    renderAll();
    panelBody.scrollTop = 0;
  }

  // ---------------- panel ----------------

  function renderPanel() {
    destroyCharts();
    if (panelMode === "landing") {
      panelBody.innerHTML = renderLandingHtml();
    } else if (panelMode === "loading") {
      panelBody.innerHTML = `<div class="panel-state"><div class="panel-spinner"></div><p>${escapeHtml(panelMessage)}</p></div>`;
    } else if (panelMode === "error") {
      panelBody.innerHTML = `<div class="panel-state"><p class="error-text">${escapeHtml(panelMessage)}</p></div>`;
    } else if (panelMode === "overview" && company) {
      panelBody.innerHTML = renderOverviewHtml();
      wireOverviewCharts();
    } else if (panelMode === "category" && activeCategoryId) {
      const cat = findCategory(activeCategoryId);
      panelBody.innerHTML = cat ? renderCategoryHtml(cat) : "";
    } else if (panelMode === "leaf" && activeCategoryId && activeLeafId) {
      const cat = findCategory(activeCategoryId);
      const leaf = cat && (cat.children || []).find((l) => l.id === activeLeafId);
      panelBody.innerHTML = leaf ? renderLeafHtml(leaf, cat) : "";
      if (leaf && leaf.leaf.chart) wireLeafChart(leaf.leaf.chart);
    }
  }

  function renderLandingHtml() {
    return `
      <div class="panel-landing">
        <div class="landing-kicker">Growth, decoded</div>
        <h1 class="brand-wordmark landing-title">Startup Story</h1>
        <p class="landing-sub">Learn growth strategy from the companies you already know.</p>
        <form id="landingSearchForm" class="landing-search-form" autocomplete="off">
          <input id="landingSearchInput" type="text" placeholder="Search any public company…" />
          <button type="submit">Explore &rarr;</button>
        </form>
        <p class="landing-hint">or pick a company from the sidebar</p>
        <p class="landing-body">Real financials translated into plain English, benchmarked against the category leader, and
        taught back to you as a growth playbook — what stage a company is in, what lever it's pulling, and what to watch next.</p>
        <p class="landing-body landing-body-muted">No investment advice anywhere — this describes trends, it never tells you to buy, sell, or hold.</p>
      </div>`;
  }

  function renderOverviewHtml() {
    const numbers = findCategory("numbers");
    const revenueLeaf = numbers && (numbers.children || []).find((l) => l.id === "chart-revenue");
    const priceLeaf = numbers && (numbers.children || []).find((l) => l.id === "chart-price");
    const catCards = (company.children || [])
      .map(
        (cat) => `
      <button type="button" class="overview-cat-card" data-action="select-category" data-cat="${escapeAttr(cat.id)}">
        <div class="card-title">${escapeHtml(cat.title)}</div>
        ${cat.subtitle ? `<div class="card-excerpt">${escapeHtml(cat.subtitle)}</div>` : ""}
      </button>`
      )
      .join("");

    return `
      <div class="panel-header">
        <h2>${escapeHtml(company.title)}</h2>
        ${company.subtitle ? `<div class="panel-sub">${escapeHtml(company.subtitle)}</div>` : ""}
      </div>
      ${(revenueLeaf || priceLeaf) ? `
      <div class="overview-charts">
        ${revenueLeaf ? `<div class="chart-card"><h3>Revenue Trend</h3><canvas id="ovChartRevenue"></canvas></div>` : ""}
        ${priceLeaf ? `<div class="chart-card"><h3>Stock Price (12 months)</h3><canvas id="ovChartPrice"></canvas></div>` : ""}
      </div>` : ""}
      <h3 class="panel-section-title">Explore</h3>
      <div class="overview-grid">${catCards}</div>`;
  }

  function wireOverviewCharts() {
    const numbers = findCategory("numbers");
    if (!numbers) return;
    const revenueLeaf = (numbers.children || []).find((l) => l.id === "chart-revenue");
    const priceLeaf = (numbers.children || []).find((l) => l.id === "chart-price");
    if (revenueLeaf) drawChart("ovChartRevenue", revenueLeaf.leaf.chart);
    if (priceLeaf) drawChart("ovChartPrice", priceLeaf.leaf.chart);
  }

  function renderCategoryHtml(cat) {
    const cards = (cat.children || [])
      .map((leaf) => {
        const excerpt = leaf.leaf.body ? truncate(leaf.leaf.body, 110) : "";
        return `
        <button type="button" class="overview-card" data-action="select-leaf" data-cat="${escapeAttr(cat.id)}" data-leaf="${escapeAttr(leaf.id)}">
          <div class="card-title">${escapeHtml(leaf.title)}</div>
          ${leaf.leaf.value ? `<div class="card-value">${escapeHtml(leaf.leaf.value)}</div>` : ""}
          ${excerpt ? `<div class="card-excerpt">${escapeHtml(excerpt)}</div>` : ""}
        </button>`;
      })
      .join("");

    return `
      <div class="panel-header">
        <h2>${escapeHtml(cat.title)}</h2>
        ${cat.subtitle ? `<div class="panel-sub">${escapeHtml(cat.subtitle)}</div>` : ""}
      </div>
      <div class="overview-grid">${cards}</div>`;
  }

  function renderLeafHtml(leaf, cat) {
    const siblings = cat.children || [];
    const idx = siblings.findIndex((s) => s.id === leaf.id);
    const hasNav = siblings.length > 1 && idx !== -1;

    let html = `
      <button type="button" class="panel-breadcrumb" data-action="select-category" data-cat="${escapeAttr(cat.id)}">&larr; ${escapeHtml(cat.title)}</button>
      <div class="reading-card">
        <div class="reading-title">${escapeHtml(leaf.title)}</div>`;
    if (leaf.leaf.value) html += `<div class="reading-value">${escapeHtml(leaf.leaf.value)}</div>`;
    if (leaf.leaf.period) html += `<div class="reading-period">${escapeHtml(leaf.leaf.period)}</div>`;
    if (leaf.leaf.body) html += `<p class="reading-body">${escapeHtml(leaf.leaf.body)}</p>`;
    if (leaf.leaf.chart) html += `<div class="reading-chart"><canvas id="leafChartCanvas"></canvas></div>`;
    if (leaf.leaf.lens) html += `<div class="reading-lens"><span class="lens-tag">Growth lens</span>${escapeHtml(leaf.leaf.lens)}</div>`;
    if (leaf.leaf.source) {
      html += `<div class="reading-source">${
        leaf.leaf.sourceUrl
          ? `<a href="${escapeAttr(leaf.leaf.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(leaf.leaf.source)}</a>`
          : escapeHtml(leaf.leaf.source)
      }</div>`;
    }
    if (hasNav) {
      html += `
        <div class="reading-nav">
          <button type="button" class="reading-nav-btn" data-action="prev-sibling" aria-label="Previous">&larr;</button>
          <span class="reading-nav-count">${idx + 1} / ${siblings.length}</span>
          <button type="button" class="reading-nav-btn" data-action="next-sibling" aria-label="Next">&rarr;</button>
        </div>`;
    }
    html += `</div>`;
    return html;
  }

  function handlePanelClick(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "select-category") {
      const catId = btn.dataset.cat;
      expanded.add(catId);
      activeCategoryId = catId;
      activeLeafId = null;
      panelMode = "category";
      renderAll();
    } else if (action === "select-leaf") {
      selectLeaf(btn.dataset.cat, btn.dataset.leaf);
    } else if (action === "prev-sibling") {
      goToSibling(-1);
    } else if (action === "next-sibling") {
      goToSibling(1);
    }
  }

  // ---------------- charts ----------------

  const chartInstances = {};
  function drawChart(canvasId, chart) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart || !chart) return;
    if (chartInstances[canvasId]) chartInstances[canvasId].destroy();
    const isBar = chart.type === "bar";
    chartInstances[canvasId] = new Chart(canvas, {
      type: chart.type,
      data: {
        labels: chart.labels,
        datasets: [
          {
            label: chart.label,
            data: chart.data,
            backgroundColor: isBar ? "#7dd3c0" : "rgba(242,184,128,0.15)",
            borderColor: isBar ? "#7dd3c0" : "#f2b880",
            fill: !isBar,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#a6acbb", maxRotation: 45 }, grid: { display: false } },
          y: { ticks: { color: "#a6acbb" }, grid: { color: "#262b38" } },
        },
      },
    });
  }
  function wireLeafChart(chart) {
    requestAnimationFrame(() => drawChart("leafChartCanvas", chart));
  }
  function destroyCharts() {
    Object.keys(chartInstances).forEach((id) => {
      chartInstances[id].destroy();
      delete chartInstances[id];
    });
  }

  // ---------------- helpers ----------------

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n).trim() + "…" : str;
  }
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }
  function escapeAttr(str) {
    return String(str ?? "").replace(/"/g, "&quot;");
  }

  return { init, showDemoList, showCompanyLoading, showCompanyError, showCompany };
})();
