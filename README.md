# Twitch Rewind: Live Stream DVR

Rewind live Twitch streams to any moment! This browser extension adds DVR capabilities to Twitch, allowing you to pause, rewind, and fast-forward live streams seamlessly.

## Features

- **Progress Slider:** Easily scrub through live streams.
- **Smart Catch-Up:** Quickly return to the live edge.
- **Keyboard Shortcuts:** Conveniently control playback.
- **Lightweight:** Runs seamlessly without impacting performance.

## Installation

### Manual Installation (Developer Mode)

1. Clone or download this repository to your local machine.
2. If downloaded as a ZIP file, extract it.
3. Open your browser and navigate to the Extensions page:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Brave: `brave://extensions/`
4. Enable **Developer mode** (usually a toggle in the top right corner).
5. Click **Load unpacked** and select the folder containing this repository (the folder with `manifest.json`).
6. The extension is now installed and ready to use on Twitch!

## File Structure

- `manifest.json`: The extension's configuration file.
- `src/`: Source code for the extension.
  - `service-worker.js`: Background script.
  - `bridge.js` & `injector.js`: Content scripts for interacting with the Twitch player.
  - `main-world.js`: Core logic injected into the page's main context.
  - `popup/`: HTML, CSS, and JS for the extension's popup interface.
- `icons/`: Extension icons in various sizes.
- `vendor/`: Third-party dependencies (like `hls.min.js`).

## Usage

1. Navigate to any live Twitch stream.
2. The extension will automatically initialize.
3. Use the progress bar at the bottom of the player to rewind and scrub through the video.
4. Click the extension popup to manage settings or catch back up to the current broadcast.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an issue if you encounter any bugs or have feature requests.

## License

MIT License
