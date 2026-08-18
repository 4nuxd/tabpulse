<div align="center">

<img src="media/icons/icon128.png" width="72" alt="TabPulse logo">

# TabPulse

### Keep Your Tabs Alive. Never Get Logged Out Again.

A minimal, glassmorphic Chrome extension that auto-refreshes the tabs you choose, on the schedule you set.

</div>

<p align="center">
  <img src="https://img.shields.io/badge/MANIFEST-V3-000000?style=for-the-badge&labelColor=1a1a1a" alt="Manifest V3">
  <img src="https://img.shields.io/badge/CHROME-EXTENSION-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/VANILLA-JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="Vanilla JS">
  <img src="https://img.shields.io/badge/DEPENDENCIES-NONE-2ea44f?style=for-the-badge" alt="No dependencies">
  <img src="https://img.shields.io/badge/LICENSE-MIT-black?style=for-the-badge" alt="MIT License">
</p>

---

### 💡 Why

Long-lived dashboards, monitoring tools, admin panels, and internal tools often log you out after a short idle window. TabPulse quietly reloads only the tabs you pick, at whatever interval you want, so your session stays alive while you're not looking.

---

## 🚀 Key Features

- 🎯 **Pick exactly which tabs**: nothing runs on tabs you didn't select. Full control, no surprises.
- ⏱ **Custom refresh interval**: any window from 1 minute up to 24 hours, adjustable with a live stepper.
- 🖤 **Black / white / grey glassmorphic UI**: fully custom checkboxes, stepper, and button, no default browser form styling anywhere.
- 🔔 **Self-dismissing toast**: a floating glass confirmation appears on save and fades out after 5 seconds on its own.
- ⚙️ **Self-healing alarm scheduler**: a background watchdog checks every 5 minutes that the refresh timer is still correctly set, and repairs it automatically if Chrome ever drops it.
- 🧹 **Self-cleaning watch list**: closed tabs are pruned instantly, not just on the next scheduled cycle.
- ⚡ **Concurrent, retrying refresh**: all watched tabs reload in parallel, each with a retry, so one slow tab never blocks the rest.
- 🔒 **Privacy-first**: no network requests, no analytics, no remote code. Everything stays in local browser storage.
- 📦 **Zero dependencies**: plain HTML, CSS, and JavaScript. No build step, no bundler, no npm install.

---

## 📥 Install

No Chrome Web Store listing yet, so load it as an unpacked extension:

1. Download and unzip the extension folder somewhere permanent (Chrome loads it live from this folder, so don't delete it after installing).
2. Open `chrome://extensions` in your browser.
3. Turn on **Developer mode** (top right toggle).
4. Click **Load unpacked** and select the extension folder.
5. Click the TabPulse icon in your toolbar, select the tabs you want to keep alive, set your interval, and hit **Save & Start**.

Works in any Chromium based browser: Chrome, Edge, Brave, Arc, Vivaldi.

---

## 🧠 How It Works

TabPulse uses Chrome's [`alarms`](https://developer.chrome.com/docs/extensions/reference/api/alarms) API to schedule a periodic wake up in the background service worker. On each tick, it reloads only the tab IDs you saved via [`chrome.storage.local`](https://developer.chrome.com/docs/extensions/reference/api/storage). Nothing else on your machine or browser is touched.

```
Popup (pick tabs + interval)
        │
        ▼
chrome.storage.local  ───►  background.js (service worker)
                                    │
                                    ▼
                          chrome.alarms (every N min)
                                    │
                                    ▼
                        chrome.tabs.reload(watchedTabId)
                                    │
                                    ▼
                     tabpulseHealthCheck (self-heal, every 5 min)
```

The **"Inactive"** label you'll see next to the service worker in `chrome://extensions` is completely normal. Chrome suspends the worker's JS process after idle time to save memory, but `chrome.alarms` runs at the browser level and wakes the worker back up exactly when your refresh is due.

---

## 🛠 Tech Stack

| Layer | Tech |
|---|---|
| Extension platform | Chrome Extension **Manifest V3** |
| UI | Vanilla HTML + CSS (glassmorphism via `backdrop-filter`, layered gradients, custom controls) |
| Logic | Vanilla JavaScript, no frameworks, no bundler |
| Persistence | `chrome.storage.local` |
| Scheduling | `chrome.alarms` with a self-healing watchdog alarm |
| Icons | Generated with Python and Pillow |

No npm, no build pipeline, no external libraries. The entire extension is hand-written and inspectable in plain text.

---

## 📁 Project Structure

```
tabpulse/
├── manifest.json          Extension config (MV3, permissions, CSP)
├── background.js          Service worker: alarm scheduling + tab refresh logic
├── popup.html              Popup UI (glassmorphic, custom controls)
├── popup.js                Popup logic: tab listing, selection, validation
├── media/
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── LICENSE
└── README.md
```

---

## 🔐 Security

TabPulse requests the minimum permissions needed and follows extension security best practices:

- **Manifest V3**, explicit `script-src 'self'` CSP. No inline scripts, no `eval`, no remote code.
- All DOM content built via safe APIs (`createElement` / `textContent`), never `innerHTML`, so tab titles can't inject markup.
- Favicon URLs are allowlisted to `http:`, `https:`, and `data:image/*` before use.
- All stored tab IDs and intervals are re-validated (type and bounds) before every use.
- Background script only accepts messages from itself (`sender.id` check), not from web pages or other extensions.
- No `host_permissions`, no content scripts, no access to page contents, cookies, or browsing history.
- Zero network requests. The extension never phones home.

---

## 🔑 Permissions Used

| Permission | Why |
|---|---|
| `tabs` | List your open tabs, reload the ones you select, and detect when a watched tab closes |
| `storage` | Remember your selected tabs and refresh interval |
| `alarms` | Schedule the periodic refresh and the self-healing watchdog check |

---

## 🗺 Roadmap Ideas

- [ ] Per-tab custom intervals
- [ ] Pause/resume toggle without losing selection
- [ ] Refresh-on-domain-match (auto-watch new tabs from a saved site)
- [ ] Dark/light theme toggle

Contributions and suggestions welcome.

---

## 📄 License

MIT, see [LICENSE](./LICENSE).

---

## 🤍 Credits

Made by **[@4nuxd](https://github.com/4nuxd)** with love

<div align="center">
<sub>If TabPulse saved you from a logout, consider starring the repo ⭐</sub>
</div>
