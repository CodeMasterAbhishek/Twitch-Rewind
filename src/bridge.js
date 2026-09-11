(function() {
  'use strict';

  const MAIN_SOURCE = 'TWITCH_REWIND_MAIN';
  const ISOLATED_SOURCE = 'TWITCH_REWIND_ISOLATED';

  // On load, push current settings to MAIN world
  chrome.storage.sync.get(null, (settings) => {
    window.postMessage({
      source: ISOLATED_SOURCE,
      action: 'SETTINGS_LOADED',
      payload: settings
    }, '*');
  });

  // Listen for settings changes from popup/other tabs
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const updated = {};
    for (const [key, { newValue }] of Object.entries(changes)) {
      updated[key] = newValue;
    }
    window.postMessage({
      source: ISOLATED_SOURCE,
      action: 'SETTINGS_UPDATED',
      payload: updated
    }, '*');
  });

  // Handle requests from MAIN world
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.source !== MAIN_SOURCE) return;
    const { id, action, payload } = event.data;

    try {
      let result;

      switch (action) {
        case 'GET_SETTINGS':
          result = await chrome.storage.sync.get(payload?.keys || null);
          break;

        case 'SET_SETTINGS':
          await chrome.storage.sync.set(payload);
          result = true;
          break;

        case 'BUFFER_STATS_UPDATE':
          chrome.runtime.sendMessage({ action: 'BUFFER_STATS_UPDATE', payload }).catch(() => {});
          return;

        default:
          return;
      }

      window.postMessage({
        source: ISOLATED_SOURCE,
        responseTo: id,
        result
      }, '*');

    } catch (error) {
      window.postMessage({
        source: ISOLATED_SOURCE,
        responseTo: id,
        error: error.message
      }, '*');
    }
  });
})();
