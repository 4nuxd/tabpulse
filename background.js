"use strict";

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
    const stored = await chrome.storage.local.get("intervalMinutes");
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
    await chrome.alarms.clear(ALARM_NAME);
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: intervalMinutes });

    const created = await chrome.alarms.get(ALARM_NAME);
    const ok = created && Math.round(created.periodInMinutes) === intervalMinutes;
    if (!ok) {
      // Retry once - covers rare transient failures right after install/update
      await chrome.alarms.create(ALARM_NAME, { periodInMinutes: intervalMinutes });
    }
    return true;
  } catch (e) {
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
      chrome.alarms.get(ALARM_NAME),
      getStoredIntervalMinutes(),
    ]);

    const stored = await chrome.storage.local.get("watchedTabIds");
    const watchedTabIds = Array.isArray(stored.watchedTabIds) ? stored.watchedTabIds : [];
    if (watchedTabIds.length === 0) return; // nothing to watch, nothing to heal

    const misconfigured = !alarm || Math.round(alarm.periodInMinutes) !== intervalMinutes;
    if (misconfigured) {
      await scheduleAlarm();
    }
  } catch (e) {
    // Best-effort watchdog - never let this throw into the alarm listener
  }
}

async function ensureHealthCheckAlarm() {
  try {
    const existing = await chrome.alarms.get(HEALTH_ALARM_NAME);
    if (!existing) {
      await chrome.alarms.create(HEALTH_ALARM_NAME, { periodInMinutes: HEALTH_CHECK_PERIOD_MINUTES });
    }
  } catch (e) {
    // Non-fatal - health checks are a bonus, not a requirement
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
      const tab = await chrome.tabs.get(tabId);
      if (!tab || typeof tab.id !== "number") return false;
      await chrome.tabs.reload(tabId);
      return true;
    } catch (e) {
      if (attempt === 0) {
        await wait(RELOAD_RETRY_DELAY_MS);
        continue;
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
      const stored = await chrome.storage.local.get("watchedTabIds");
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
        await chrome.storage.local.set({ watchedTabIds: stillWatched });
      } catch (e) {
        // Non-fatal; next refresh cycle will just re-attempt the stale ids
      }
    }
  } finally {
    isRefreshing = false;
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    refreshWatchedTabs();
  } else if (alarm.name === HEALTH_ALARM_NAME) {
    verifyAlarmHealth();
  }
});

// Instantly drop a tab from the watch list the moment it's closed, rather
// than waiting for the next scheduled refresh to discover it's gone.
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get("watchedTabIds").then(({ watchedTabIds }) => {
    if (!Array.isArray(watchedTabIds) || !watchedTabIds.includes(tabId)) return;
    const next = watchedTabIds.filter((id) => id !== tabId);
    chrome.storage.local.set({ watchedTabIds: next }).catch(() => {});
  }).catch(() => {});
});

// React automatically to any change in settings - whether it came from this
// popup, a different window's popup, or a synced/external write to storage -
// instead of relying solely on the RESCHEDULE message from the popup.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.intervalMinutes) {
    scheduleAlarm();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  scheduleAlarm();
  ensureHealthCheckAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarm();
  ensureHealthCheckAlarm();
});

// Only react to our own extension's runtime messages with the exact expected shape.
// Responds with { ok: true/false } so the popup can confirm the alarm was
// actually (re)scheduled rather than assuming success.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    sender.id === chrome.runtime.id &&
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
