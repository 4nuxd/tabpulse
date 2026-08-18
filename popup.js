"use strict";

const tabListEl = document.getElementById("tabList");
const intervalEl = document.getElementById("interval");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
const selectedCountEl = document.getElementById("selectedCount");
const decBtn = document.getElementById("decBtn");
const incBtn = document.getElementById("incBtn");
const statusPillEl = document.getElementById("statusPill");
const statusPillTextEl = document.getElementById("statusPillText");

const MIN_INTERVAL = 1;
const MAX_INTERVAL = 1440; // 24h cap, prevents absurd/DoS-style alarm values
const SVG_NS = "http://www.w3.org/2000/svg";

let allTabs = [];
let toastTimer = null;

/**
 * Show a floating glass toast message that auto-dismisses after 5s.
 */
function showToast(message) {
  statusEl.textContent = message;
  statusEl.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    statusEl.classList.remove("show");
  }, 5000);
}

/**
 * Build the checkmark icon via safe DOM APIs (createElementNS/setAttribute)
 * instead of innerHTML, so no string is ever parsed as markup.
 */
function buildCheckIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M4 12.5L9.5 18L20 6");
  path.setAttribute("stroke", "#0a0a0a");
  path.setAttribute("stroke-width", "3");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");

  svg.appendChild(path);
  return svg;
}

/**
 * Only allow http(s)/data-image favicon URLs. Browser-supplied favIconUrl
 * values are generally safe, but we defensively reject any other scheme
 * (e.g. javascript:, file:, chrome:) before ever assigning to img.src.
 */
function sanitizeFaviconUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const parsed = new URL(rawUrl);
    const allowedProtocols = ["http:", "https:", "data:"];
    if (!allowedProtocols.includes(parsed.protocol)) return null;
    if (parsed.protocol === "data:" && !rawUrl.startsWith("data:image/")) {
      return null;
    }
    return rawUrl;
  } catch (e) {
    return null;
  }
}

function clampInterval(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return 15;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, n));
}

async function init() {
  let stored;
  try {
    stored = await chrome.storage.local.get(["watchedTabIds", "intervalMinutes"]);
  } catch (e) {
    stored = {};
  }

  const watchedTabIds = Array.isArray(stored.watchedTabIds) ? stored.watchedTabIds : [];
  const intervalMinutes = clampInterval(stored.intervalMinutes ?? 15);

  intervalEl.value = intervalMinutes;

  try {
    allTabs = await chrome.tabs.query({});
  } catch (e) {
    allTabs = [];
  }

  renderTabs(watchedTabIds);
  updateSelectedCount();
  setStatusPill(watchedTabIds.length);
}

function renderTabs(watchedTabIds) {
  // Clear safely (no innerHTML = "")
  while (tabListEl.firstChild) {
    tabListEl.removeChild(tabListEl.firstChild);
  }

  if (allTabs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No open tabs found.";
    tabListEl.appendChild(empty);
    return;
  }

  const watchedSet = new Set(watchedTabIds);

  allTabs.forEach((tab) => {
    // Only render tabs with a valid numeric id we can actually target later
    if (typeof tab.id !== "number") return;

    const row = document.createElement("label");
    row.className = "tab-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = String(tab.id);
    checkbox.checked = watchedSet.has(tab.id);
    checkbox.addEventListener("change", updateSelectedCount);

    const box = document.createElement("span");
    box.className = "checkbox-box";
    box.appendChild(buildCheckIcon());

    const favicon = document.createElement("img");
    favicon.className = "favicon";
    const safeFavicon = sanitizeFaviconUrl(tab.favIconUrl);
    if (safeFavicon) {
      favicon.src = safeFavicon;
    } else {
      favicon.style.visibility = "hidden";
    }
    favicon.addEventListener("error", () => {
      favicon.style.visibility = "hidden";
    });
    favicon.alt = "";

    const title = document.createElement("span");
    title.className = "tab-title";
    // textContent only - never innerHTML - so tab titles can't inject markup
    title.textContent = tab.title || tab.url || "Untitled tab";
    if (typeof tab.url === "string") {
      title.title = tab.url;
    }

    row.appendChild(checkbox);
    row.appendChild(box);
    row.appendChild(favicon);
    row.appendChild(title);
    tabListEl.appendChild(row);
  });
}

function updateSelectedCount() {
  const checkboxes = tabListEl.querySelectorAll('input[type="checkbox"]');
  const count = Array.from(checkboxes).filter((cb) => cb.checked).length;
  selectedCountEl.textContent =
    count === 0 ? "No tabs selected yet" : `${count} tab${count > 1 ? "s" : ""} selected`;
}

function setStatusPill(watchedCount) {
  if (watchedCount > 0) {
    statusPillEl.classList.add("active");
    statusPillTextEl.textContent = `Watching ${watchedCount}`;
  } else {
    statusPillEl.classList.remove("active");
    statusPillTextEl.textContent = "Idle";
  }
}

decBtn.addEventListener("click", () => {
  intervalEl.value = clampInterval((parseInt(intervalEl.value, 10) || 15) - 1);
});

incBtn.addEventListener("click", () => {
  intervalEl.value = clampInterval((parseInt(intervalEl.value, 10) || 15) + 1);
});

intervalEl.addEventListener("change", () => {
  intervalEl.value = clampInterval(intervalEl.value);
});

saveBtn.addEventListener("click", async () => {
  const checkboxes = tabListEl.querySelectorAll('input[type="checkbox"]');

  // Re-validate every id: must be a finite integer matching a tab we actually listed.
  const validTabIds = new Set(allTabs.filter((t) => typeof t.id === "number").map((t) => t.id));
  const selectedIds = Array.from(checkboxes)
    .filter((cb) => cb.checked)
    .map((cb) => parseInt(cb.value, 10))
    .filter((id) => Number.isInteger(id) && validTabIds.has(id));

  const minutes = clampInterval(intervalEl.value);

  try {
    await chrome.storage.local.set({
      watchedTabIds: selectedIds,
      intervalMinutes: minutes,
    });

    let confirmed = false;
    try {
      const response = await chrome.runtime.sendMessage({ type: "RESCHEDULE" });
      confirmed = !!(response && response.ok);
    } catch (e) {
      // Background may still be waking up - settings are already saved in
      // storage regardless, and the alarm will self-heal via the health
      // check alarm even if this particular message round-trip failed.
      confirmed = false;
    }

    if (confirmed) {
      showToast(`Watching ${selectedIds.length} tab(s), refreshing every ${minutes} min.`);
    } else {
      showToast(`Saved. Refreshing ${selectedIds.length} tab(s) every ${minutes} min.`);
    }
    setStatusPill(selectedIds.length);
  } catch (e) {
    showToast("Couldn't save settings. Please try again.");
  }
});

init();
