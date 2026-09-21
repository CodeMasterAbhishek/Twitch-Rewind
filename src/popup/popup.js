

document.addEventListener("DOMContentLoaded", async () => {
  const autoStart = document.getElementById('autoStart');
  const autoUnmute = document.getElementById('autoUnmute');

  const settings = await chrome.storage.sync.get(['autoStart', 'autoUnmute']);

  autoStart.checked = settings.autoStart !== false;
  autoUnmute.checked = settings.autoUnmute === true;

  autoStart.addEventListener('change', (e) => {
    chrome.storage.sync.set({ autoStart: e.target.checked });
  });

  autoUnmute.addEventListener('change', (e) => {
    chrome.storage.sync.set({ autoUnmute: e.target.checked });
  });
});


// Listen for live buffer stats
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'BUFFER_STATS_UPDATE') {
    const { mode, bufferedSeconds, channel, title } = message.payload;
    
    // Capitalize first letter of channel name
    const formattedChannel = channel ? channel.charAt(0).toUpperCase() + channel.slice(1) : 'Waiting...';
    // Remove ' - Twitch' suffix from title
    const formattedTitle = title ? title.replace(' - Twitch', '') : '';

    document.getElementById('channelName').textContent = formattedChannel;
    document.getElementById('streamTitle').textContent = formattedTitle;
    
    const statusEl = document.getElementById('rewindStatus');
    
    if (mode === 'vod') {
      let timeStr = '';
      if (bufferedSeconds < 60) timeStr = Math.floor(bufferedSeconds) + 's';
      else if (bufferedSeconds < 3600) timeStr = Math.floor(bufferedSeconds / 60) + 'm ' + Math.floor(bufferedSeconds % 60) + 's';
      else timeStr = (bufferedSeconds / 3600).toFixed(1) + 'h';
      
      statusEl.textContent = `Rewind Ready (${timeStr} available)`;
      statusEl.className = 'rewind-status ready';
    } else if (mode === 'disabled') {
      statusEl.textContent = 'VOD Disabled (Cannot rewind)';
      statusEl.className = 'rewind-status disabled';
    } else if (mode === 'off') {
      statusEl.textContent = 'Extension Disabled';
      statusEl.className = 'rewind-status waiting';
    } else {
      statusEl.textContent = mode ? `Mode: ${mode}` : 'Checking status...';
      statusEl.className = 'rewind-status waiting';
    }
  }
});


// Smart Rating System Logic
chrome.storage.sync.get(['ratingPromptStatus'], (data) => {
  // Re-enabled memory lock for production
  if (data.ratingPromptStatus !== 'clicked' && data.ratingPromptStatus !== 'dismissed') {
    document.getElementById('popupRatingSection').style.display = 'block';
  }

  const EXTENSION_REVIEW_URL = 'https://chromewebstore.google.com/detail/fnlecbndghcdfkjdgmpmhmfbiifckgne/reviews';
  const stars = document.querySelectorAll('.p-star');
  const container = document.getElementById('popupStars');

  stars.forEach(star => {
    star.addEventListener('mouseover', (e) => {
      const val = parseInt(e.target.dataset.val);
      stars.forEach(s => {
        s.style.color = parseInt(s.dataset.val) <= val ? '#eab308' : '#4f4f5a';
      });
    });

    star.addEventListener('click', (e) => {
      window.open(EXTENSION_REVIEW_URL, '_blank');
      chrome.storage.sync.set({ ratingPromptStatus: 'clicked' });
      document.getElementById('popupRatingSection').style.display = 'none';
    });
  });

  container.addEventListener('mouseout', () => {
    stars.forEach(s => s.style.color = '#4f4f5a');
  });
});
