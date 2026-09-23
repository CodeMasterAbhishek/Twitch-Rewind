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

  // --- Review System Logic ---
  function initReviewPrompt() {
    try {
      chrome.storage.sync.get(['installTime', 'ratingPromptStatus'], (data) => {
        // If it's already clicked or dismissed, do not show again.
        if (data.ratingPromptStatus === 'clicked' || data.ratingPromptStatus === 'dismissed') return;
        
        const installTime = data.installTime || Date.now(); // fallback to now if missing

        // Calculate days installed. Prompt after 3 days.
        const daysInstalled = (Date.now() - installTime) / (1000 * 60 * 60 * 24);
        if (daysInstalled >= 3) { 
          showReviewToast();
        }
      });
    } catch (err) {
      // Catch "Extension context invalidated" if the extension was reloaded but tab wasn't refreshed
      console.log("Twitch Rewind: Please refresh the page to load the newest extension update.");
    }
  }

  function showReviewToast() {
    if (document.getElementById('twitch-rewind-review-toast')) return;

    const toast = document.createElement('div');
    toast.id = 'twitch-rewind-review-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 30px;
      right: 30px;
      background: #18181b;
      border: 1px solid #9146ff;
      box-shadow: 0 4px 20px rgba(145, 70, 255, 0.3);
      border-radius: 8px;
      padding: 20px;
      z-index: 999999;
      color: white;
      font-family: Inter, "Helvetica Neue", Helvetica, Arial, sans-serif;
      width: 320px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-sizing: border-box;
    `;

    const EXTENSION_REVIEW_URL = 'https://chromewebstore.google.com/detail/twitch-rewind-live-stream/fnlecbndghcdfkjdgmpmhmfbiifckgne/reviews';

    function renderInitialUI() {
      toast.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #bf94ff;">Enjoying Twitch Rewind?</h3>
          <button id="tr-toast-close" style="background: none; border: none; color: #adadb8; cursor: pointer; padding: 0; font-size: 20px; line-height: 1;">&times;</button>
        </div>
        <p style="margin: 0; font-size: 14px; color: #efeff1; line-height: 1.4;">How would you rate your experience so far?</p>
        <div id="tr-star-container" style="display: flex; gap: 8px; justify-content: center; margin: 10px 0;">
           <span class="tr-star" data-val="1" style="font-size: 32px; cursor: pointer; color: #4f4f5a; transition: color 0.2s;">★</span>
           <span class="tr-star" data-val="2" style="font-size: 32px; cursor: pointer; color: #4f4f5a; transition: color 0.2s;">★</span>
           <span class="tr-star" data-val="3" style="font-size: 32px; cursor: pointer; color: #4f4f5a; transition: color 0.2s;">★</span>
           <span class="tr-star" data-val="4" style="font-size: 32px; cursor: pointer; color: #4f4f5a; transition: color 0.2s;">★</span>
           <span class="tr-star" data-val="5" style="font-size: 32px; cursor: pointer; color: #4f4f5a; transition: color 0.2s;">★</span>
        </div>
      `;

      toast.querySelector('#tr-toast-close').addEventListener('click', () => {
        chrome.storage.sync.set({ ratingPromptStatus: 'dismissed' });
        toast.remove();
      });

      const stars = toast.querySelectorAll('.tr-star');
      const container = toast.querySelector('#tr-star-container');

      stars.forEach(star => {
        star.addEventListener('mouseover', (e) => {
          const val = parseInt(e.target.dataset.val);
          stars.forEach(s => {
            s.style.color = parseInt(s.dataset.val) <= val ? '#eab308' : '#4f4f5a';
          });
        });
        
        star.addEventListener('click', (e) => {
          // Always send to Chrome Web Store regardless of star rating
          window.open(EXTENSION_REVIEW_URL, '_blank');
          chrome.storage.sync.set({ ratingPromptStatus: 'clicked' });
          toast.remove();
        });
      });

      container.addEventListener('mouseout', () => {
        stars.forEach(s => s.style.color = '#4f4f5a');
      });
    }

    renderInitialUI();
    document.body.appendChild(toast);
  }

  // Run prompt logic after a slight 5-second delay so it doesn't interrupt page load
  setTimeout(initReviewPrompt, 5000);

})();
