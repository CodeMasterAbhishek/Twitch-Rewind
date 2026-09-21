// Default settings
const DEFAULTS = {
  autoStart: true,
  autoUnmute: false
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


