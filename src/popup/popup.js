const MEMORY_PER_MIN = {  // MB per minute at each quality
  '1080p60': 60, '720p60': 35, '720p30': 23,
  '480p30': 12, '360p30': 6.6
};

document.addEventListener('DOMContentLoaded', async () => {
  const settings = await chrome.storage.sync.get(null);

  // Populate UI
  document.getElementById('bufferDuration').value = settings.maxBufferMinutes || 10;
  document.getElementById('autoStart').checked = settings.autoStart !== false;
  document.getElementById('preferVOD').checked = settings.preferVOD !== false;
  updateMemoryHint(settings.maxBufferMinutes || 10);

  // Save on change
  document.getElementById('bufferDuration').addEventListener('change', (e) => {
    const minutes = parseFloat(e.target.value);
    chrome.storage.sync.set({ maxBufferMinutes: minutes });
    updateMemoryHint(minutes);
  });

  document.getElementById('autoStart').addEventListener('change', (e) => {
    chrome.storage.sync.set({ autoStart: e.target.checked });
  });

  document.getElementById('preferVOD').addEventListener('change', (e) => {
    chrome.storage.sync.set({ preferVOD: e.target.checked });
  });
});

function updateMemoryHint(minutes) {
  const mb = Math.round(minutes * MEMORY_PER_MIN['1080p60']);
  const hint = document.getElementById('memoryHint');
  if (mb >= 1024) {
    hint.textContent = `~${(mb/1024).toFixed(1)} GB at 1080p60 (buffer mode only)`;
  } else {
    hint.textContent = `~${mb} MB at 1080p60 (buffer mode only)`;
  }
}
