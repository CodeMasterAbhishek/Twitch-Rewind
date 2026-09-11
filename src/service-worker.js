// Default settings
const DEFAULTS = {
  maxBufferMinutes: 10,
  autoStart: true,
  preferVOD: true,
  presets: [30, 60, 600, 1800, 3600], // seconds
  keyboardShortcut: 'R'
};

// Initialize defaults on install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const existing = await chrome.storage.sync.get(null);
    const merged = { ...DEFAULTS, ...existing };
    await chrome.storage.sync.set(merged);
  }
});

// Handle messages from bridge (currently just forwarding storage ops)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GET_SETTINGS') {
    chrome.storage.sync.get(null).then(sendResponse);
    return true; // async
  }
  if (message.action === 'UPDATE_BADGE') {
    chrome.action.setBadgeText({
      text: message.text || '',
      tabId: sender.tab?.id
    });
    chrome.action.setBadgeBackgroundColor({
      color: message.color || '#9146ff',
      tabId: sender.tab?.id
    });
  }
});


// Failsafe: Cleanup orphaned IndexedDB databases on startup
chrome.runtime.onStartup.addListener(async () => {
  try {
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name && db.name.startsWith("TwitchRewindDB_")) {
          indexedDB.deleteDatabase(db.name);
          console.log("Cleaned up orphaned database:", db.name);
        }
      }
    }
  } catch (e) {
    console.error("Failed to clean up databases on startup", e);
  }
});
