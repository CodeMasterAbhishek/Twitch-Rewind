(function() {
  'use strict';

  const scriptsToInject = [
    'vendor/hls.min.js',
    'src/main-world.js'
  ];

  for (const path of scriptsToInject) {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(path);
    script.async = false; // Important: preserve execution order
    
    // Use document.documentElement as document.head might not exist at document_start
    const parent = document.head || document.documentElement;
    parent.appendChild(script);
    
    // Remove the script tag after execution to keep the DOM clean
    script.onload = () => {
      script.remove();
    };
  }
})();
