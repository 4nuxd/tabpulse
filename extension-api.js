"use strict";

(function setupExtensionApi(global) {
  const api = global.browser || global.chrome;
  if (!api) {
    throw new Error("TabPulse requires a browser extension runtime API.");
  }

  global.extensionApi = api;
})(globalThis);
