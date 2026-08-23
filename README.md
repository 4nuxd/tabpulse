<div align="center">

<img src="media/icons/icon128.png" width="72" alt="TabPulse logo">

# TabPulse

### Keep Your Tabs Alive. Never Get Logged Out Again.

A minimal, glassmorphic browser extension that auto-refreshes the tabs you choose, on the schedule you set.

</div>

<p align="center">
  <img src="https://img.shields.io/badge/MANIFEST-V3-000000?style=for-the-badge&labelColor=1a1a1a" alt="Manifest V3">
  <img src="https://img.shields.io/badge/CHROME%20%2F%20EDGE-MV3%20Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome and Edge Extension">
  <img src="https://img.shields.io/badge/FIREFOX-MV3%20Variant-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white" alt="Firefox Variant">
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
- ⚙️ **Self-healing alarm scheduler**: a background watchdog checks every 5 minutes that the refresh timer is still correctly set, and repairs it automatically if a browser drops it.
- 🧹 **Self-cleaning watch list**: closed tabs are pruned instantly, not just on the next scheduled cycle.
- ⚡ **Concurrent, retrying refresh**: all watched tabs reload in parallel, each with a retry, so one slow tab never blocks the rest.
- 🔒 **Privacy-first**: no network requests, no analytics, no remote code. Everything stays in local browser storage.
- 📦 **Zero dependencies**: plain HTML, CSS, and JavaScript. No build step, no bundler, no npm install.

---

## 🌐 Browser Support Matrix

| Browser | Status | Notes |
|---|---|---|
| Chrome (Chromium) | ✅ Supported | Uses `manifest.json` |
| Edge (Chromium) | ✅ Supported | Uses `manifest.json` |
| Firefox | ✅ Supported | Uses `manifest.firefox.json` (`browser_specific_settings.gecko.id`) |
| Brave / Arc / Vivaldi / Opera | ✅ Usually supported | Chromium-based; use Chrome build |
| DuckDuckGo Browser and browsers with restricted extension APIs | ⚠️ Limited / not guaranteed | Some platforms do not expose full MV3 APIs (`alarms`, background worker lifecycle) needed by TabPulse |

## 📥 Install

No store listing yet, so load it as an unpacked extension:

#### Chrome / Edge / Chromium browsers
1. Download and unzip the extension folder somewhere permanent.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the project folder, or `dist/chrome` / `dist/edge` after running the build script.

#### Firefox
1. Build the Firefox variant (commands below).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...** and select `dist/firefox/manifest.json`.

Then click the TabPulse icon, select tabs, set interval, and hit **Save & Start**.

---

## 🧠 How It Works

TabPulse uses the extension [`alarms`](https://developer.chrome.com/docs/extensions/reference/api/alarms) API to schedule a periodic wake up in the background service worker. On each tick, it reloads only the tab IDs you saved via extension local storage. Runtime code uses a tiny `browser`/`chrome` compatibility wrapper (`extension-api.js`) so the same logic works across Chromium browsers and Firefox.

```
Popup (pick tabs + interval)
        │
        ▼
storage.local         ───►  background.js (service worker)
                                    │
                                    ▼
                                 alarms (every N min)
                                    │
                                    ▼
                           tabs.reload(watchedTabId)
                                    │
                                    ▼
                     tabpulseHealthCheck (self-heal, every 5 min)
```

The **"Inactive"** label you'll see next to the service worker in Chromium extension pages (like `chrome://extensions` or `edge://extensions`) is completely normal. Browsers suspend the worker's JS process after idle time to save memory, but the alarms scheduler wakes the worker back up exactly when your refresh is due.

---

## 🛠 Tech Stack

| Layer | Tech |
|---|---|
| Extension platform | Browser Extension **Manifest V3** (`manifest.json` + Firefox variant) |
| UI | Vanilla HTML + CSS (glassmorphism via `backdrop-filter`, layered gradients, custom controls) |
| Logic | Vanilla JavaScript, no frameworks, no bundler |
| Persistence | `storage.local` (via cross-browser wrapper) |
| Scheduling | `alarms` with a self-healing watchdog alarm |
| Icons | Generated with Python and Pillow |

No npm dependencies and no bundler. Packaging is done with lightweight shell scripts in `scripts/`.

---

## 📁 Project Structure

```
tabpulse/
├── manifest.json               Chromium/Chrome/Edge extension config
├── manifest.firefox.json       Firefox variant with gecko settings
├── extension-api.js            `browser`/`chrome` compatibility wrapper
├── background.js               Service worker: alarm scheduling + tab refresh logic
├── popup.html                  Popup UI (glassmorphic, custom controls)
├── popup.js                    Popup logic: tab listing, selection, validation
├── scripts/
│   ├── build-extension.sh      Build target folder (chrome|edge|firefox)
│   └── package-extension.sh    Build + zip distributable target
├── media/
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── LICENSE
└── README.md
```


---

## 📦 Build & Package Targets

```bash
# Build unpacked folders
./scripts/build-extension.sh chrome
./scripts/build-extension.sh edge
./scripts/build-extension.sh firefox

# Build and zip distributables
./scripts/package-extension.sh chrome
./scripts/package-extension.sh edge
./scripts/package-extension.sh firefox
```

Generated output:
- `dist/chrome/`, `dist/edge/`, `dist/firefox/`
- `dist/tabpulse-chrome.zip`, `dist/tabpulse-edge.zip`, `dist/tabpulse-firefox.zip`

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
