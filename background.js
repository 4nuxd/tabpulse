"use strict";

try {
  importScripts("extension-api.js");
} catch (e) {
  // ignore: fallback to global browser/chrome lookup below
}

const ext = globalThis.extensionApi || globalThis.browser || globalThis.chrome;
if (!ext) {
  throw new Error("TabPulse could not find a compatible extension API.");
}


const ALARM_NAME = "tabpulseRefreshAlarm";
const HEALTH_ALARM_NAME = "tabpulseHealthCheck";
const HEALTH_CHECK_PERIOD_MINUTES = 5; // periodically verify the main alarm is still correctly scheduled
const MIN_INTERVAL = 1;
const MAX_INTERVAL = 1440; // 24h cap - defensive bound on untrusted stored input
const RELOAD_RETRY_DELAY_MS = 1500;

let isRefreshing = false; // in-memory guard against overlapping refresh runs

function clampInterval(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 15;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(n)));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getStoredIntervalMinutes() {
  try {
    const stored = await ext.storage.local.get("intervalMinutes");
    return clampInterval(stored.intervalMinutes);
  } catch (e) {
    return 15;
  }
}

/**
 * Creates (or re-creates) the refresh alarm, then reads it back from Chrome
 * to confirm it actually took - alarms can silently fail to register in some
 * edge cases (e.g. right after a browser/extension update), so we verify
 * rather than assume.
 */
async function scheduleAlarm() {
  const intervalMinutes = await getStoredIntervalMinutes();

  try {
    await ext.alarms.clear(ALARM_NAME);
    await ext.alarms.create(ALARM_NAME, { periodInMinutes: intervalMinutes });

    const created = await ext.alarms.get(ALARM_NAME);
    const ok = created && Math.round(created.periodInMinutes) === intervalMinutes;
    if (!ok) {
      // Retry once - covers rare transient failures right after install/update
      await ext.alarms.create(ALARM_NAME, { periodInMinutes: intervalMinutes });
    }
    return true;
  } catch (e) {
    // Log an error to aid debugging when alarms fail to schedule in a
    // particular browser/runtime (e.g. Firefox MV3 differences).
    try {
      console.error("TabPulse: scheduleAlarm failed", { intervalMinutes, error: e });
    } catch (logErr) {
      // swallow logging errors in extremely constrained runtimes
    }
    return false;
  }
}

/**
 * Lightweight watchdog: makes sure the main refresh alarm still exists with
 * the interval the user actually saved. Chrome can occasionally drop alarms
 * across browser restarts/updates - this self-heals without needing the
 * popup to be open.
 */
async function verifyAlarmHealth() {
  try {
    const [alarm, intervalMinutes] = await Promise.all([
      ext.alarms.get(ALARM_NAME),
      getStoredIntervalMinutes(),
    ]);

    const stored = await ext.storage.local.get("watchedTabIds");
    const watchedTabIds = Array.isArray(stored.watchedTabIds) ? stored.watchedTabIds : [];
    if (watchedTabIds.length === 0) return; // nothing to watch, nothing to heal

    const misconfigured = !alarm || Math.round(alarm.periodInMinutes) !== intervalMinutes;
    if (misconfigured) {
      await scheduleAlarm();
    }
  } catch (e) {
    // Best-effort watchdog - never let this throw into the alarm listener
    try {
      console.error("TabPulse: verifyAlarmHealth error", e);
    } catch (logErr) {
      // ignore
    }
  }
}

async function ensureHealthCheckAlarm() {
  try {
    const existing = await ext.alarms.get(HEALTH_ALARM_NAME);
    if (!existing) {
      await ext.alarms.create(HEALTH_ALARM_NAME, { periodInMinutes: HEALTH_CHECK_PERIOD_MINUTES });
    }
  } catch (e) {
    // Non-fatal - health checks are a bonus, not a requirement
    try {
      console.error("TabPulse: ensureHealthCheckAlarm error", e);
    } catch (logErr) {
      // ignore
    }
  }
}

/**
 * Reloads a single watched tab, with one short retry on transient failure
 * (e.g. the tab briefly reports mid-navigation). Returns false only when the
 * tab genuinely no longer exists, so the caller can prune it.
 */
async function reloadTabWithRetry(tabId) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const tab = await ext.tabs.get(tabId);
      if (!tab || typeof tab.id !== "number") return false;
      await ext.tabs.reload(tabId);
      return true;
    } catch (e) {
      if (attempt === 0) {
        await wait(RELOAD_RETRY_DELAY_MS);
        continue;
      }
      // final failure: log once to aid debugging which tab failed
      try {
        console.warn("TabPulse: reloadTabWithRetry final failure", { tabId, error: e });
      } catch (logErr) {
        // ignore logging errors
      }
      return false; // tab is genuinely gone (or permanently inaccessible)
    }
  }
  return false;
}

async function refreshWatchedTabs() {
  if (isRefreshing) return; // avoid overlapping runs if a cycle is still finishing
  isRefreshing = true;

  try {
    let watchedTabIds = [];
    try {
      const stored = await ext.storage.local.get("watchedTabIds");
      watchedTabIds = Array.isArray(stored.watchedTabIds) ? stored.watchedTabIds : [];
    } catch (e) {
      return;
    }

    // Only ever act on integer tab ids we actually saved - never trust anything else
    const validIds = watchedTabIds.filter((id) => Number.isInteger(id));
    if (validIds.length === 0) return;

    // Reload all watched tabs concurrently instead of one-by-one, so a single
    // slow/unresponsive tab can't delay refreshing the rest.
    const results = await Promise.allSettled(validIds.map((id) => reloadTabWithRetry(id)));

    const staleIds = validIds.filter((id, i) => {
      const r = results[i];
      return r.status === "rejected" || r.value === false;
    });

    // Prune closed/inaccessible tabs from storage so the watch list doesn't grow stale
    if (staleIds.length > 0) {
      try {
        const stillWatched = validIds.filter((id) => !staleIds.includes(id));
        await ext.storage.local.set({ watchedTabIds: stillWatched });
      } catch (e) {
        // Non-fatal; next refresh cycle will just re-attempt the stale ids
      }
    }
  } finally {
    isRefreshing = false;
  }
}

if (ext.alarms && ext.alarms.onAlarm && ext.alarms.onAlarm.addListener) {
  ext.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      refreshWatchedTabs();
    } else if (alarm.name === HEALTH_ALARM_NAME) {
      verifyAlarmHealth();
    }
  });
}

// Instantly drop a tab from the watch list the moment it's closed, rather
// than waiting for the next scheduled refresh to discover it's gone.
if (ext.tabs && ext.tabs.onRemoved && ext.tabs.onRemoved.addListener) {
  ext.tabs.onRemoved.addListener((tabId) => {
    ext.storage.local.get("watchedTabIds").then(({ watchedTabIds }) => {
      if (!Array.isArray(watchedTabIds) || !watchedTabIds.includes(tabId)) return;
      const next = watchedTabIds.filter((id) => id !== tabId);
      ext.storage.local.set({ watchedTabIds: next }).catch(() => {});
    }).catch(() => {});
  });
}

// React automatically to any change in settings - whether it came from this
// popup, a different window's popup, or a synced/external write to storage -
// instead of relying solely on the RESCHEDULE message from the popup.
if (ext.storage && ext.storage.onChanged && ext.storage.onChanged.addListener) {
  ext.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.intervalMinutes) {
      scheduleAlarm();
    }
  });
}

if (ext.runtime && ext.runtime.onInstalled && ext.runtime.onInstalled.addListener) {
  ext.runtime.onInstalled.addListener(() => {
    scheduleAlarm();
    ensureHealthCheckAlarm();
  });
}

if (ext.runtime && ext.runtime.onStartup && ext.runtime.onStartup.addListener) {
  ext.runtime.onStartup.addListener(() => {
    scheduleAlarm();
    ensureHealthCheckAlarm();
  });
}

// Only react to our own extension's runtime messages with the exact expected shape.
// Responds with { ok: true/false } so the popup can confirm the alarm was
// actually (re)scheduled rather than assuming success.
if (ext.runtime && ext.runtime.onMessage && ext.runtime.onMessage.addListener) {
  ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const fromThisExtension = !sender || !sender.id || (ext.runtime && sender.id === ext.runtime.id);
    if (
      fromThisExtension &&
      message &&
      typeof message === "object" &&
      message.type === "RESCHEDULE"
    ) {
      scheduleAlarm()
        .then((ok) => sendResponse({ ok }))
        .catch(() => sendResponse({ ok: false }));
      return true; // keep the message channel open for the async response
    }
    return false;
  });
}


// Re-hydrate alarms when the service worker starts up in any browser.
void scheduleAlarm();
void ensureHealthCheckAlarm();
