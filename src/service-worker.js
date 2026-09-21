// Default settings
const DEFAULTS = {
  autoStart: true,
  autoUnmute: false,
  installTime: Date.now(), // Track when extension was installed
  ratingPromptStatus: 'pending' // 'pending', 'clicked', 'dismissed'
};

// Initialize defaults on install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Fresh install: set all defaults including installTime
    const existing = await chrome.storage.sync.get(null);
    const merged = { ...DEFAULTS, ...existing };
    if (!merged.installTime) merged.installTime = Date.now();
    merged.ratingPromptStatus = 'pending';
    await chrome.storage.sync.set(merged);
  } else if (details.reason === 'update') {
    // Update: preserve existing installTime and ratingPromptStatus
    const existing = await chrome.storage.sync.get(null);
    const merged = { autoStart: DEFAULTS.autoStart, autoUnmute: DEFAULTS.autoUnmute, ...existing };
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


