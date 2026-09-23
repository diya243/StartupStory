// The Orbit engine: a generic, recursive zoomable radial mind-map.
//
// A "node" looks like:
//   {
//     id, title, subtitle, meta,           // shown when this node is the focus
//     kind: 'brand' | 'company' | 'category' | 'leaf',
//     loading: bool,                       // show a spinner instead of children
//     leaf: { value, body, lens, source, sourceUrl, chart } | null,
//     children: [ node, ... ] | null,
//   }
//
// Only pure presentation lives here — no fetching, no domain data shaping.
const Orbit = (() => {
  const stage = document.getElementById("stage");
  const crumbBar = document.getElementById("crumbs");

  let path = [];
  let onSelect = null; // (node, proceed) => void, called when a child bubble is clicked
  let afterRender = null; // (focusNode) => void, called after every render

  function init(rootNode, handlers) {
    onSelect = handlers.onSelect;
    afterRender = handlers.afterRender || null;
    path = [rootNode];
    render(true);
  }

  function push(node) {
    path.push(node);
    render(true);
  }

  function replaceFocus(node) {
    path[path.length - 1] = node;
    render(false);
  }

  function goTo(index) {
    if (index >= path.length - 1) return;
    path = path.slice(0, index + 1);
    render(true);
  }

  function current() {
    return path[path.length - 1];
  }

  function renderCrumbs() {
    crumbBar.innerHTML = path
      .map((n, i) => {
        const isLast = i === path.length - 1;
        const cls = isLast ? "crumb crumb-current" : "crumb";
        const label = i === 0 ? `<span class="crumb-brand">${escapeHtml(n.title)}</span>` : escapeHtml(n.title);
        return `<button type="button" class="${cls}" data-idx="${i}" ${isLast ? "disabled" : ""}>${label}</button>`;
      })
      .join('<span class="crumb-sep">›</span>');

    crumbBar.querySelectorAll(".crumb").forEach((el) => {
      el.addEventListener("click", () => goTo(parseInt(el.dataset.idx, 10)));
    });
  }

  function polarPosition(index, count, radius, cx, cy) {
    const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  }

  function bubbleSizeFor(kind) {
    const scale = window.innerWidth < 480 ? 0.7 : 1;
    let base = 86;
    if (kind === "company") base = 108;
    else if (kind === "category") base = 96;
    return Math.round(base * scale);
  }

  function render(animateZoom) {
    renderCrumbs();
    stage.innerHTML = "";
    const focus = path[path.length - 1];
    const depth = path.length - 1;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = vw / 2;
    const cy = vh / 2;

    // ---- Center focus element ----
    const center = document.createElement("div");
    center.className = `orbit-center orbit-center-${focus.kind}`;
    center.style.left = `${cx}px`;
    center.style.top = `${cy}px`;

    if (focus.leaf) {
      center.appendChild(buildReadingCard(focus));
      center.classList.add("orbit-center-reading");
    } else if (focus.loading || focus.error) {
      center.innerHTML = `
        <div class="center-bubble">
          ${focus.error ? "" : '<div class="center-spinner"></div>'}
          <div class="center-title">${escapeHtml(focus.title)}</div>
          <div class="center-subtitle ${focus.error ? "error-text" : ""}">${escapeHtml(focus.error || focus.subtitle || "Loading…")}</div>
        </div>`;
    } else {
      const isRoot = depth === 0;
      center.innerHTML = `
        <div class="center-bubble ${isRoot ? "center-bubble-brand" : ""}">
          <div class="center-title ${isRoot ? "brand-wordmark" : ""}">${escapeHtml(focus.title)}</div>
          ${focus.subtitle ? `<div class="center-subtitle">${escapeHtml(focus.subtitle)}</div>` : ""}
          ${focus.meta ? `<div class="center-meta">${focus.meta}</div>` : ""}
          ${isRoot ? buildSearchBox() : ""}
        </div>`;
    }

    if (depth > 0 && !focus.leaf) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "back-btn";
      back.setAttribute("aria-label", "Go back");
      back.innerHTML = "&larr;";
      back.addEventListener("click", () => goTo(depth - 1));
      center.appendChild(back);
    }
    if (focus.leaf) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "back-btn back-btn-reading";
      back.setAttribute("aria-label", "Go back");
      back.innerHTML = "&larr;";
      back.addEventListener("click", () => goTo(depth - 1));
      stage.appendChild(back);
    }

    stage.appendChild(center);

    // ---- Orbiting children ----
    const kids = focus.children || [];
    if (kids.length && !focus.leaf) {
      // Measure the actual rendered center bubble (its CSS size varies by
      // kind and viewport via media queries) so the orbit always clears it,
      // then clamp to the viewport so bubbles never run off-screen.
      const centerEl = center.querySelector(".center-bubble") || center;
      const centerRadius = centerEl.getBoundingClientRect().width / 2;
      const maxBubble = Math.max(...kids.map((c) => bubbleSizeFor(c.kind)));
      const desired = centerRadius + maxBubble / 2 + 22;
      const safeMargin = maxBubble / 2 + 10;
      const radius = Math.min(desired, cx - safeMargin, cy - safeMargin);
      kids.forEach((child, i) => {
        const { x, y } = polarPosition(i, kids.length, radius, cx, cy);
        const size = bubbleSizeFor(child.kind);
        const el = document.createElement("button");
        el.type = "button";
        el.className = `orbit-bubble orbit-bubble-${child.kind}`;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.animationDelay = `${i * 0.05}s`;
        el.innerHTML = `<span>${escapeHtml(child.title)}</span>`;
        el.addEventListener("click", () => handleSelect(child));
        stage.appendChild(el);
      });
    }

    if (animateZoom) {
      center.classList.add("zoom-in");
    }

    if (typeof afterRender === "function") afterRender(focus);
  }

  function buildSearchBox() {
    return `
      <form id="orbitSearchForm" class="orbit-search-form" autocomplete="off">
        <input id="orbitSearchInput" type="text" placeholder="Search a company…" />
        <button type="submit" aria-label="Go">&rarr;</button>
      </form>`;
  }

  function buildReadingCard(node) {
    const wrap = document.createElement("div");
    wrap.className = "reading-card";
    let html = `<div class="reading-title">${escapeHtml(node.title)}</div>`;
    if (node.leaf.value) html += `<div class="reading-value">${escapeHtml(node.leaf.value)}</div>`;
    if (node.leaf.period) html += `<div class="reading-period">${escapeHtml(node.leaf.period)}</div>`;
    if (node.leaf.body) html += `<p class="reading-body">${escapeHtml(node.leaf.body)}</p>`;
    if (node.leaf.chart) html += `<div class="reading-chart"><canvas id="readingChartCanvas"></canvas></div>`;
    if (node.leaf.lens) {
      html += `<div class="reading-lens"><span class="lens-tag">Growth lens</span>${escapeHtml(node.leaf.lens)}</div>`;
    }
    if (node.leaf.source) {
      html += `<div class="reading-source">${
        node.leaf.sourceUrl
          ? `<a href="${escapeAttr(node.leaf.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(node.leaf.source)}</a>`
          : escapeHtml(node.leaf.source)
      }</div>`;
    }
    wrap.innerHTML = html;

    if (node.leaf.chart) {
      requestAnimationFrame(() => {
        const canvas = wrap.querySelector("#readingChartCanvas");
        if (canvas && window.Chart) drawLeafChart(canvas, node.leaf.chart);
      });
    }
    return wrap;
  }

  let leafChartInstance = null;
  function drawLeafChart(canvas, chart) {
    if (leafChartInstance) leafChartInstance.destroy();
    const isBar = chart.type === "bar";
    leafChartInstance = new Chart(canvas, {
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

  function handleSelect(child) {
    if (typeof onSelect === "function") onSelect(child, () => push(child));
    else push(child);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }
  function escapeAttr(str) {
    return String(str ?? "").replace(/"/g, "&quot;");
  }

  window.addEventListener("resize", () => {
    if (path.length) render(false);
  });

  return { init, push, replaceFocus, goTo, current, render: () => render(false) };
})();
