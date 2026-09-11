const MEMORY_PER_MIN = { "1080p60": 60, "720p60": 35, "720p30": 23, "480p30": 12, "360p30": 6.6 };

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await chrome.storage.sync.get(null);

  const select = document.getElementById("bufferDuration");
  const customWrapper = document.getElementById("customDurationWrapper");
  const customInput = document.getElementById("customDuration");

  const savedVal = settings.maxBufferMinutes;
  
  if (savedVal === -1) {
    select.value = "infinite";
  } else if ([0.5, 60, 120, 180].includes(savedVal) || !savedVal) {
    select.value = savedVal || 60;
  } else {
    select.value = "custom";
    customWrapper.style.display = "block";
    customInput.value = savedVal;
  }

  document.getElementById("autoStart").checked = settings.autoStart !== false;
  document.getElementById("preferVOD").checked = settings.preferVOD !== false;
  
  updateMemoryHint(savedVal || 60);

  function saveDuration() {
    const val = select.value;
    let finalMinutes = 60;
    
    if (val === "infinite") {
      finalMinutes = -1;
      customWrapper.style.display = "none";
    } else if (val === "custom") {
      customWrapper.style.display = "block";
      finalMinutes = parseFloat(customInput.value) || 60;
    } else {
      customWrapper.style.display = "none";
      finalMinutes = parseFloat(val);
    }
    
    chrome.storage.sync.set({ maxBufferMinutes: finalMinutes });
    updateMemoryHint(finalMinutes);
  }

  select.addEventListener("change", saveDuration);
  customInput.addEventListener("input", saveDuration);

  document.getElementById("autoStart").addEventListener("change", (e) => {
    chrome.storage.sync.set({ autoStart: e.target.checked });
  });

  document.getElementById("preferVOD").addEventListener("change", (e) => {
    chrome.storage.sync.set({ preferVOD: e.target.checked });
  });
});

function updateMemoryHint(minutes) {
  const hint = document.getElementById("memoryHint");
  if (minutes === -1) {
    hint.textContent = "Stored locally on disk. Uncapped size!";
    return;
  }
  const mb = Math.round(minutes * MEMORY_PER_MIN["1080p60"]);
  if (mb >= 1024) {
    hint.textContent = `Stored locally. Uses ~${(mb/1024).toFixed(1)} GB disk space at 1080p60`;
  } else {
    hint.textContent = `Stored locally. Uses ~${mb} MB disk space at 1080p60`;
  }
}


// Listen for live buffer stats
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'BUFFER_STATS_UPDATE') {
    const { mode, bufferedSeconds, bytes } = message.payload;
    
    document.getElementById('currentMode').textContent = mode === 'vod' ? 'VOD Mode (Zero Memory)' : 'Buffer Mode (Disk)';
    
    let timeStr = '';
    if (bufferedSeconds < 60) timeStr = Math.floor(bufferedSeconds) + 's';
    else if (bufferedSeconds < 3600) timeStr = Math.floor(bufferedSeconds / 60) + 'm ' + Math.floor(bufferedSeconds % 60) + 's';
    else timeStr = (bufferedSeconds / 3600).toFixed(1) + 'h';
    
    let spaceStr = '';
    if (bytes < 1024 * 1024) spaceStr = (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) spaceStr = (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    else spaceStr = (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';

    document.getElementById('bufferFill').textContent = timeStr + ' (' + spaceStr + ')';

    if (message.payload.debug) {
      const d = message.payload.debug;
      const diagRow = document.getElementById('diagRow');
      const diagInfo = document.getElementById('diagInfo');
      if (diagRow && diagInfo) {
        diagRow.style.display = 'flex';
        diagInfo.textContent = `appends:${d.appendCalls} | chunks:${d.chunksAdded} | workers:${d.workerCalls} | fetch:${d.fetchCalls}`;
      }
    }
  }
});

