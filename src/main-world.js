(function() {
  'use strict';

  const NAMESPACE = '__TWITCH_REWIND__';
  if (window[NAMESPACE]) return;
  window[NAMESPACE] = { version: '3.0.0' };

  const LOG_PREFIX = '[TwitchRewind]';


  class VODResolver {
    constructor() {
      this._clientId = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
      this._gqlEndpoint = 'https://gql.twitch.tv/gql';
    }
    async resolve(channelLogin) {
      try {
        const info = await this._getActiveVOD(channelLogin);
        if (!info || !info.isLive) return { isLive: false };
        if (!info.vodId) return { isLive: true, vodData: null };
        const token = await this._getPlaybackToken(info.vodId);
        if (!token) return { isLive: true, vodData: null };
        const playlistUrl = this._buildPlaylistUrl(info.vodId, token);
        return { isLive: true, vodData: { vodId: info.vodId, playlistUrl, streamStartedAt: info.createdAt } };
      } catch (e) { return { isLive: false }; }
    }
    async _getActiveVOD(channelLogin) {
      const res = await fetch(this._gqlEndpoint, { method: 'POST', headers: { 'Client-ID': this._clientId, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: `query { user(login: "${channelLogin}") { stream { createdAt archiveVideo { id status } } }}` }) });
      const stream = (await res.json())?.data?.user?.stream;
      if (stream) {
          return { isLive: true, vodId: stream.archiveVideo?.id, createdAt: stream.createdAt };
      }
      return { isLive: false };
    }
    async _getPlaybackToken(vodId) {
      const res = await fetch(this._gqlEndpoint, { method: 'POST', headers: { 'Client-ID': this._clientId, 'Content-Type': 'application/json' }, body: JSON.stringify({ operationName: 'PlaybackAccessToken', variables: { vodID: vodId, params: { platform: 'web', playerBackend: 'mediaplayer', playerType: 'site' } }, query: `query PlaybackAccessToken($vodID: ID!, $params: PlaybackAccessTokenParams!) { videoPlaybackAccessToken(id: $vodID, params: $params) { value signature } }` }) });
      return (await res.json())?.data?.videoPlaybackAccessToken || null;
    }
    _buildPlaylistUrl(vodId, token) {
      return `https://usher.ttvnw.net/vod/${vodId}.m3u8?` + new URLSearchParams({ nauth: token.value, nauthsig: token.signature, allow_source: 'true', allow_audio_only: 'true', player_backend: 'mediaplayer', platform: 'web' }).toString();
    }
  }

  class RewindPlayer {
    constructor() {
      this._overlayVideo = null;
      this._hlsInstance = null;
      this._isActive = false;
      this._isPreloaded = false;
      this._twitchVideo = null;
      this._mode = null;
      this._targetSecondsBehind = 0;
      this._vodDuration = 0;
      this._bufferingCb = null;
    }

    onBuffering(cb) { this._bufferingCb = cb; }
    _setBuffering(state) { if (this._bufferingCb && this._isActive) this._bufferingCb(state); }

    preloadVOD(playlistUrl) {
      if (this._isPreloaded) return;
      this._mode = 'vod';
      
      if (typeof Hls === 'undefined' || !Hls.isSupported()) {
        console.error(LOG_PREFIX, 'HLS is not supported');
        return;
      }

      this._setupOverlay();
      this._overlayVideo.style.opacity = '0';

      this._hlsInstance = new Hls({ liveDurationInfinity: false, enableWorker: true });
      this._hlsInstance.loadSource(playlistUrl);
      this._hlsInstance.attachMedia(this._overlayVideo);

      this._hlsInstance.on(Hls.Events.LEVEL_LOADED, (event, data) => {
        this._vodDuration = data.details.totalduration;
      });

      this._hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        if (!data.fatal) return;
        const timeDisplay = document.querySelector('#twitch-rewind-root')?.shadowRoot?.getElementById('timeDisplay');
        if (timeDisplay) timeDisplay.textContent = 'ERR: ' + data.details;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) this._hlsInstance.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) this._hlsInstance.recoverMediaError();
        else this.returnToLive();
      });

      this._isPreloaded = true;
    }

    seekVOD(secondsBehindLive) {
      this._targetSecondsBehind = secondsBehindLive;
      if (!this._isActive) {
        if (this._twitchVideo) {
          if (this._posterCanvas) {
              try {
                  this._posterCanvas.width = this._twitchVideo.videoWidth || 1920;
                  this._posterCanvas.height = this._twitchVideo.videoHeight || 1080;
                  const ctx = this._posterCanvas.getContext('2d');
                  ctx.drawImage(this._twitchVideo, 0, 0, this._posterCanvas.width, this._posterCanvas.height);
                  this._posterCanvas.style.opacity = '1';
              } catch (e) {}
          }
          const currentMuted = this._twitchVideo.muted;
          const currentVolume = this._twitchVideo.volume;
          this._isActive = true;
          this._twitchVideo.muted = currentMuted; // Triggers hijacked setter
          this._twitchVideo.volume = currentVolume; // Triggers hijacked setter
          this._twitchVideo.style.opacity = '0';
        } else {
          this._isActive = true;
        }
        this._overlayVideo.style.opacity = '1';
      }

      if (this._vodDuration) {
        this._overlayVideo.currentTime = Math.max(0, this._vodDuration - secondsBehindLive);
      }
      if (this._twitchVideo && !this._twitchVideo.paused) {
          this._overlayVideo.play().catch(()=>{});
      }
    }

    _setupOverlay() {
      if (this._overlayVideo && this._twitchVideo && document.contains(this._twitchVideo)) return;
      
      this._twitchVideo = document.querySelector('video[src], video[data-a-target="video-player"]') || document.querySelector('.video-player__container video');
      if (!this._twitchVideo) return;

      if (!this._overlayVideo) {
        this._overlayVideo = document.createElement('video');
        this._overlayVideo.style.cssText = `position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; background: #000; pointer-events: none;`;
        this._overlayVideo.playsInline = true;
        
        this._overlayVideo.addEventListener('waiting', () => this._setBuffering(true));
        this._overlayVideo.addEventListener('playing', () => this._setBuffering(false));
        this._overlayVideo.addEventListener('canplay', () => this._setBuffering(false));
        this._overlayVideo.addEventListener('seeking', () => this._setBuffering(true));
        this._overlayVideo.addEventListener('seeked', () => this._setBuffering(false));
      }

      if (!this._posterCanvas && this._twitchVideo) {
          this._posterCanvas = document.createElement('canvas');
          this._posterCanvas.style.cssText = `position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; opacity: 0; transition: opacity 0.2s ease; z-index: 2; background: #000;`;
          this._twitchVideo.insertAdjacentElement('afterend', this._posterCanvas);
          
          const hidePoster = () => { if (this._posterCanvas) this._posterCanvas.style.opacity = '0'; };
          this._overlayVideo.addEventListener('playing', hidePoster);
          this._overlayVideo.addEventListener('canplay', hidePoster);
      }

      if (!this._twitchVideo._twRewindHijacked) {
          this._twitchVideo._twRewindHijacked = true;
          
          const origVol = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
          const origMuted = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
          const self = this;

          Object.defineProperty(this._twitchVideo, 'volume', {
              get() { return self._isActive ? self._overlayVideo.volume : origVol.get.call(this); },
              set(v) {
                  if (self._isActive) {
                      self._overlayVideo.volume = v;
                      
                      if (v > 0 && self._overlayVideo.muted) {
                          self._overlayVideo.muted = false;
                          origMuted.set.call(this, false); 
                      }
                      
                      origVol.set.call(this, 0); // Force native silent
                  } else {
                      origVol.set.call(this, v);
                  }
              }
          });

          Object.defineProperty(this._twitchVideo, 'muted', {
              get() { return self._isActive ? self._overlayVideo.muted : origMuted.get.call(this); },
              set(m) {
                  if (self._isActive) {
                      const wasMuted = self._overlayVideo.muted;
                      self._overlayVideo.muted = m;
                      
                      if (wasMuted && !m) {
                          if (self._overlayVideo.volume === 0) self._overlayVideo.volume = 0.5;
                          if (!self._overlayVideo.paused) {
                              self._overlayVideo.pause();
                              self._overlayVideo.play().catch(()=>{});
                          }
                      }
                      
                      origMuted.set.call(this, m); // Allow native to mirror user intent for UI accuracy
                  } else {
                      origMuted.set.call(this, m);
                  }
              }
          });

          this._twitchVideo.addEventListener('pause', () => { if (this._isActive) this._overlayVideo.pause(); });
          this._twitchVideo.addEventListener('play', () => { if (this._isActive) this._overlayVideo.play().catch(()=>{}); });
      }

      // Ensure it sits UNDER Twitch's control overlays
      if (this._twitchVideo.parentElement) {
          this._twitchVideo.insertAdjacentElement('afterend', this._overlayVideo);
      }
    }

    getSecondsBehindLive() {
      if (!this._overlayVideo || !this._isActive) return 0;
      if (this._overlayVideo.readyState === 0 || this._overlayVideo.seeking) return this._targetSecondsBehind;
      return Math.max(0, this._vodDuration - this._overlayVideo.currentTime);
    }

    returnToLive() {
      if (!this._isActive) return;
      this._setBuffering(false);
      
      if (this._posterCanvas) this._posterCanvas.style.opacity = '0';

      const lastMuted = this._overlayVideo ? this._overlayVideo.muted : false;
      const lastVolume = this._overlayVideo ? this._overlayVideo.volume : 1;
      
      this._isActive = false; // Deactivate first, so setters route to native
      
      if (this._twitchVideo) {
        this._twitchVideo.muted = lastMuted;
        this._twitchVideo.volume = lastVolume;
        this._twitchVideo.style.opacity = '';
      }
      if (this._overlayVideo) {
        this._overlayVideo.pause();
        this._overlayVideo.style.opacity = '0';
      }
    }

    isActive() { return this._isActive; }

    destroy() {
      this.returnToLive();
      this._setBuffering(false);
      if (this._posterCanvas) { this._posterCanvas.remove(); this._posterCanvas = null; }
      if (this._hlsInstance) { this._hlsInstance.destroy(); this._hlsInstance = null; }
      if (this._overlayVideo) { this._overlayVideo.pause(); this._overlayVideo.removeAttribute('src'); this._overlayVideo.load(); this._overlayVideo.remove(); this._overlayVideo = null; }
      if (this._twitchVideo && this._twitchVideo._twRewindHijacked) {
          delete this._twitchVideo.volume;
          delete this._twitchVideo.muted;
          this._twitchVideo._twRewindHijacked = false;
      }
      this._isActive = false; this._isPreloaded = false; this._mode = null;
      this._twitchVideo = null;
    }
  }

  class UIController {
    constructor() {
      this._host = null;
      this._shadow = null;
      this._mounted = false;
      this._isScrubbing = false;
      this._rewindCallbacks = [];
      this._liveCallbacks = [];
      this._isCurrentlyLive = true;
      this._liveBtnEl = null;
      this._liveDotEl = null;
      this._checkLiveBtnInterval = null;
    }

    mount() {
      if (this._mounted) return;
      const target = document.querySelector('.video-player__container') || document.querySelector('.persistent-player');
      if (!target) return;
      
      // Inject global styles to collapse Twitch's volume slider like YouTube
      if (!document.getElementById('tw-rewind-global-style')) {
          const style = document.createElement('style');
          style.id = 'tw-rewind-global-style';
          style.textContent = `
              .tw-rewind-vol-slider {
                  width: 0px !important;
                  min-width: 0px !important;
                  max-width: 0px !important;
                  flex-basis: 0px !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  overflow: hidden !important;
                  opacity: 0 !important;
                  transition: width 0.2s ease, min-width 0.2s ease, max-width 0.2s ease, flex-basis 0.2s ease, opacity 0.2s ease, margin 0.2s ease !important;
              }
              .tw-rewind-vol-wrapper:hover .tw-rewind-vol-slider,
              .tw-rewind-vol-wrapper:focus-within .tw-rewind-vol-slider,
              .tw-rewind-vol-slider:hover,
              .tw-rewind-vol-slider:focus-within {
                  width: 85px !important;
                  min-width: 85px !important;
                  max-width: 85px !important;
                  flex-basis: 85px !important;
                  opacity: 1 !important;
                  margin-left: 5px !important;
              }
          `;
          document.head.appendChild(style);
      }

      this._host = document.createElement('div');
      this._host.id = 'twitch-rewind-root';
      this._shadow = this._host.attachShadow({ mode: 'open' });
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(this._getStyles());
      this._shadow.adoptedStyleSheets = [sheet];
      this._shadow.innerHTML = this._getHTML();
      this._bindEvents(target);
      target.appendChild(this._host);
      this._mounted = true;

      this._checkLiveBtnInterval = setInterval(() => this._ensureLiveButton(), 1000);
    }

    unmount() {
      if (this._checkLiveBtnInterval) clearInterval(this._checkLiveBtnInterval);
      if (this._liveBtnEl) this._liveBtnEl.remove();
      if (this._host) { this._host.remove(); this._host = null; }
      this._shadow = null; this._mounted = false;
    }

    showNotification(text) {
      if (!this._shadow) return;
      const notif = this._shadow.getElementById('ytNotification');
      if (notif) {
          notif.textContent = text;
          notif.style.opacity = '1';
          if (this._notifTimeout) clearTimeout(this._notifTimeout);
          this._notifTimeout = setTimeout(() => {
              notif.style.opacity = '0';
          }, 2000);
      }
    }

    flashControls() {
      if (!this._shadow) return;
      const dvr = this._shadow.getElementById('dvrContainer');
      if (dvr) {
          dvr.classList.add('visible');
          if (this._flashTimeout) clearTimeout(this._flashTimeout);
          this._flashTimeout = setTimeout(() => {
              if (!this._isScrubbing) dvr.classList.remove('visible');
          }, 3000);
      }
    }

    _ensureLiveButton() {
      const leftGroup = document.querySelector('.player-controls__left-control-group');
      if (!leftGroup) return;

      // Find lowest common ancestor of mute button and slider to perfectly isolate the slider
      const muteBtn = document.querySelector('[data-a-target="player-mute-unmute-button"]');
      const sliderInput = document.querySelector('[data-a-target="player-volume-slider"]');

      if (muteBtn && sliderInput) {
          let common = sliderInput.parentElement;
          while (common && !common.contains(muteBtn)) {
              common = common.parentElement;
          }

          if (common) {
              if (!common.classList.contains('tw-rewind-vol-wrapper')) {
                  common.classList.add('tw-rewind-vol-wrapper');
              }

              let child = sliderInput;
              while (child.parentElement && child.parentElement !== common) {
                  child = child.parentElement;
              }

              if (child && !child.classList.contains('tw-rewind-vol-slider')) {
                  // Absolute safeguard: never hide the container that holds the mute button!
                  if (!child.contains(muteBtn)) {
                      child.classList.add('tw-rewind-vol-slider');
                  }
              }
          }
      }

      let btn = document.getElementById('twRewindLiveBtn');
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'twRewindLiveBtn';
        btn.style.cssText = 'background:transparent; border:none; color:#adadb8; cursor:pointer; font-weight:600; font-size:13px; display:flex; align-items:center; gap:6px; padding:0 10px; font-family:inherit; transition: color 0.2s;';
        btn.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#adadb8; transition:all 0.2s;" id="twRewindLiveDot"></span> LIVE`;
        
        btn.addEventListener('click', () => {
          for (const cb of this._liveCallbacks) cb();
        });
        
        btn.addEventListener('mouseover', () => btn.style.color = '#fff');
        btn.addEventListener('mouseout', () => {
          if (!this._isCurrentlyLive) btn.style.color = '#adadb8';
        });

        // Insert at the end of the left control group (right after volume)
        leftGroup.appendChild(btn);
      }
      this._liveBtnEl = btn;
      this._liveDotEl = document.getElementById('twRewindLiveDot');
      this._updateLiveButtonUI();

      let helpBtn = document.getElementById('twRewindHelpBtn');
      if (!helpBtn) {
        helpBtn = document.createElement('button');
        helpBtn.id = 'twRewindHelpBtn';
        helpBtn.style.cssText = 'background:transparent; border:none; color:#efeff1; cursor:pointer; font-weight:700; font-size:14px; display:inline-flex; align-items:center; justify-content:center; width: 30px; height: 30px; border-radius: 4px; transition: background 0.2s, color 0.2s; margin-right: 4px; font-family: inherit;';
        helpBtn.textContent = '?';
        helpBtn.title = 'Twitch Rewind Shortcuts (H or ?)';
        
        helpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleShortcutOverlay();
        });
        helpBtn.addEventListener('mouseover', () => {
            helpBtn.style.background = 'rgba(255, 255, 255, 0.15)';
        });
        helpBtn.addEventListener('mouseout', () => {
            helpBtn.style.background = 'transparent';
        });
        
        const rightGroup = document.querySelector('.player-controls__right-control-group');
        const settingsBtn = document.querySelector('[data-a-target="player-settings-button"]');
        
        if (rightGroup) {
            let insertBeforeNode = settingsBtn;
            if (settingsBtn && rightGroup.contains(settingsBtn)) {
                while (insertBeforeNode && insertBeforeNode.parentElement !== rightGroup) {
                    insertBeforeNode = insertBeforeNode.parentElement;
                }
            }
            if (insertBeforeNode) {
                rightGroup.insertBefore(helpBtn, insertBeforeNode);
            } else {
                rightGroup.prepend(helpBtn);
            }
        }
      }
    }

    _updateLiveButtonUI() {
      if (!this._liveBtnEl || !this._liveDotEl) return;
      if (this._isCurrentlyLive) {
        this._liveBtnEl.style.color = '#fff';
        this._liveDotEl.style.background = '#eb0400'; // Twitch native live red
        this._liveDotEl.style.boxShadow = '0 0 6px #eb0400';
      } else {
        this._liveBtnEl.style.color = '#adadb8';
        this._liveDotEl.style.background = '#adadb8';
        this._liveDotEl.style.boxShadow = 'none';
      }
    }

    _getHTML() {
      return `
        <div id="disabledNotice" style="position:absolute; top: 10%; left: 50%; transform: translateX(-50%); background: rgba(235, 4, 0, 0.9); color: #fff; padding: 10px 16px; border-radius: 4px; font-size: 14px; font-weight: bold; display: none; pointer-events: auto; z-index: 100; align-items: center; gap: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
          <span>Cannot rewind: VOD is disabled for this stream</span>
          <span id="closeNoticeBtn" style="cursor:pointer; font-size:16px; font-weight:normal; opacity:0.8; transition:opacity 0.2s; line-height:1;">✖</span>
        </div>
        <div id="ytNotification" style="position:absolute; top: 10%; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.6); color: #fff; padding: 10px 20px; border-radius: 4px; font-size: 14px; font-weight: bold; opacity: 0; transition: opacity 0.2s; pointer-events: none; z-index: 100;"></div>
        <div class="spinner" id="loadingOverlay"></div>
        <div class="dvr-container" id="dvrContainer">
          <input type="range" class="seek-slider" id="seekBar" min="-600" max="0" value="0" title="Scrub to rewind">
          <span class="time-display" id="timeDisplay">LIVE</span>
        </div>
        <div class="catchup-badge" id="catchupBadge">CATCH-UP</div>
        <div class="shortcut-overlay" id="shortcutOverlay">
          <div class="shortcut-title">
            <span>Keyboard Shortcuts</span>
            <span id="closeShortcuts" class="shortcut-close">✖</span>
          </div>
          <div class="shortcut-list">
            <div class="shortcut-item"><div class="shortcut-keys"><kbd>←</kbd><kbd>J</kbd></div><span>Rewind 10s</span></div>
            <div class="shortcut-item"><div class="shortcut-keys"><kbd>→</kbd><kbd>L</kbd></div><span>Forward 10s</span></div>
            <div class="shortcut-item"><div class="shortcut-keys"><kbd>K</kbd><kbd>Space</kbd></div><span>Play / Pause</span></div>
            <div class="shortcut-item"><div class="shortcut-keys"><kbd>↑</kbd></div><span>Volume up</span></div>
            <div class="shortcut-item"><div class="shortcut-keys"><kbd>↓</kbd></div><span>Volume down</span></div>
            <div class="shortcut-item"><div class="shortcut-keys"><kbd>M</kbd></div><span>Mute / Unmute</span></div>
            <div class="shortcut-item"><div class="shortcut-keys"><kbd>F</kbd></div><span>Fullscreen</span></div>
            <div class="shortcut-item"><div class="shortcut-keys"><kbd>&lt;</kbd></div><span>Speed down</span></div>
            <div class="shortcut-item"><div class="shortcut-keys"><kbd>&gt;</kbd></div><span>Speed up</span></div>
            <div class="shortcut-item"><div class="shortcut-keys"><kbd>C</kbd></div><span>Toggle catch-up</span></div>
            <div class="shortcut-item"><div class="shortcut-keys"><kbd>0</kbd>–<kbd>9</kbd></div><span>Seek to 0–90%</span></div>
            <div class="shortcut-item"><div class="shortcut-keys"><kbd>H</kbd><kbd>?</kbd></div><span>Shortcuts Help</span></div>
          </div>
        </div>
      `;
    }

    _getStyles() {
      return `
        :host {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            pointer-events: none;
            font-family: Inter, sans-serif;
            z-index: 10;
        }
        .spinner {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 48px; height: 48px;
            border: 4px solid rgba(255, 255, 255, 0.2);
            border-top-color: #9146ff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            display: none;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
            pointer-events: none;
        }
        .spinner.visible { display: block; }
        @keyframes spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
        
        .dvr-container { 
            position: absolute;
            bottom: 45px; 
            left: 10px; 
            right: 15px; 
            display: flex; 
            align-items: center; 
            gap: 14px; 
            transition: opacity 0.2s ease; 
            opacity: 0; 
            pointer-events: none; 
        }
        .dvr-container.visible { 
            opacity: 1; 
            pointer-events: auto; 
        }
        .seek-slider { 
            flex: 1; 
            margin: 0; 
            appearance: none; 
            background: rgba(255, 255, 255, 0.4); 
            height: 4px; 
            border-radius: 2px; 
            cursor: pointer; 
            transition: height 0.1s;
        }
        .seek-slider:hover { 
            height: 6px; 
        }
        .seek-slider::-webkit-slider-thumb { 
            appearance: none; 
            width: 14px; 
            height: 14px; 
            background: #9146ff; 
            border-radius: 50%; 
            transition: transform 0.1s; 
            box-shadow: 0 0 4px rgba(0,0,0,0.5); 
        }
        .seek-slider:hover::-webkit-slider-thumb, .seek-slider:active::-webkit-slider-thumb { 
            transform: scale(1.3); 
        }
        .time-display { 
            font-size: 13px; 
            font-weight: 600; 
            color: #fff; 
            text-shadow: 0 1px 3px rgba(0,0,0,0.8); 
            font-variant-numeric: tabular-nums; 
            min-width: 45px; 
            text-align: right; 
        }
        .catchup-badge {
            position: absolute;
            top: 10px; right: 10px;
            background: rgba(145, 70, 255, 0.85);
            color: #fff;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.5px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            z-index: 50;
        }
        .catchup-badge.visible { opacity: 1; }
        .shortcut-overlay {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(24, 24, 27, 0.95);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 24px;
            min-width: 300px;
            display: none;
            pointer-events: auto;
            z-index: 200;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
            backdrop-filter: blur(8px);
        }
        .shortcut-overlay.visible { display: block; }
        .shortcut-title {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 16px; padding-bottom: 12px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            font-size: 15px; font-weight: 700; color: #efeff1;
        }
        .shortcut-close {
            cursor: pointer; opacity: 0.6; transition: opacity 0.2s;
            font-size: 14px;
        }
        .shortcut-close:hover { opacity: 1; }
        .shortcut-list { display: flex; flex-direction: column; gap: 6px; }
        .shortcut-item {
            display: flex; justify-content: space-between; align-items: center;
            font-size: 13px; color: #dedee3; gap: 16px;
        }
        .shortcut-item > span { color: #adadb8; white-space: nowrap; }
        .shortcut-keys { display: flex; gap: 4px; }
        kbd {
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 4px;
            padding: 2px 8px;
            font-size: 11px;
            font-family: inherit;
            color: #fff;
            min-width: 24px;
            text-align: center;
            line-height: 1.4;
        }
      `;
    }

    setDisabledNotice(show) {
      if (!this._shadow) return;
      const notice = this._shadow.getElementById('disabledNotice');
      if (notice) {
        notice.style.display = show ? 'flex' : 'none';
      }
    }

    setBuffering(state) {
      if (!this._shadow) return;
      const overlay = this._shadow.getElementById('loadingOverlay');
      if (overlay) {
        if (state) overlay.classList.add('visible');
        else overlay.classList.remove('visible');
      }
    }

    toggleShortcutOverlay() {
      if (!this._shadow) return;
      const overlay = this._shadow.getElementById('shortcutOverlay');
      if (overlay) overlay.classList.toggle('visible');
    }

    hideShortcutOverlay() {
      if (!this._shadow) return;
      const overlay = this._shadow.getElementById('shortcutOverlay');
      if (overlay) overlay.classList.remove('visible');
    }

    setCatchUpBadge(visible, speed) {
      if (!this._shadow) return;
      const badge = this._shadow.getElementById('catchupBadge');
      if (badge) {
        if (visible) {
          badge.textContent = `CATCH-UP ${speed}x`;
          badge.classList.add('visible');
        } else {
          badge.classList.remove('visible');
        }
      }
    }

    _bindEvents(target) {
      const closeNotice = this._shadow.getElementById('closeNoticeBtn');
      if (closeNotice) {
        closeNotice.addEventListener('click', (e) => {
          e.stopPropagation();
          const notice = this._shadow.getElementById('disabledNotice');
          if (notice) notice.style.display = 'none';
        });
      }

      const closeShortcuts = this._shadow.getElementById('closeShortcuts');
      if (closeShortcuts) {
        closeShortcuts.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hideShortcutOverlay();
        });
      }
      
      let hideTimeout;
      const showControls = () => {
         const dvr = this._shadow.getElementById('dvrContainer');
         if (dvr) {
             dvr.classList.add('visible');
             clearTimeout(hideTimeout);
             hideTimeout = setTimeout(() => {
                 if (!this._isScrubbing) dvr.classList.remove('visible');
             }, 3000);
         }
      };

      target.addEventListener('mousemove', showControls);
      target.addEventListener('click', (e) => {
        showControls();
        // Blur any focused Twitch button so keyboard shortcuts keep working
        if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
          document.activeElement.blur();
        }
      });
      target.addEventListener('mouseleave', () => {
         if (!this._isScrubbing) {
             clearTimeout(hideTimeout);
             const dvr = this._shadow.getElementById('dvrContainer');
             if (dvr) dvr.classList.remove('visible');
         }
      });

      const seekBar = this._shadow.getElementById('seekBar');
      
      const updateFill = () => {
        const min = parseFloat(seekBar.min) || -600;
        const max = parseFloat(seekBar.max) || 0;
        const val = parseFloat(seekBar.value) || 0;
        if (max === min) return;
        const percentage = ((val - min) / (max - min)) * 100;
        seekBar.style.background = `linear-gradient(to right, #9146ff ${percentage}%, rgba(255,255,255,0.4) ${percentage}%)`;
      };

      seekBar.addEventListener('input', () => {
        this._isScrubbing = true;
        const val = parseInt(seekBar.value, 10);
        this._shadow.getElementById('timeDisplay').textContent = val === 0 ? 'LIVE' : '-' + this._formatTime(Math.abs(val));
        updateFill();
      });

      seekBar.addEventListener('change', () => {
        this._isScrubbing = false;
        const val = parseInt(seekBar.value, 10);
        if (val >= -3) { // Snap to live if within 3 seconds
          for (const cb of this._liveCallbacks) cb();
        } else {
          for (const cb of this._rewindCallbacks) cb(Math.abs(val));
        }
      });
    }

    updateStatus(isLive, secondsBehind, maxAvailable, mode) {
      this._isCurrentlyLive = isLive;
      this._currentMode = mode;
      this._updateLiveButtonUI();

      if (!this._shadow) return;
      
      const dvr = this._shadow.getElementById('dvrContainer');
      if (mode === 'disabled') {
        if (dvr) dvr.style.display = 'none';
        return;
      } else {
        if (dvr) dvr.style.display = 'flex';
      }

      const seekBar = this._shadow.getElementById('seekBar');
      seekBar.min = -Math.floor(maxAvailable);

      if (!this._isScrubbing) {
        if (isLive) {
          seekBar.value = 0;
          this._shadow.getElementById('timeDisplay').textContent = 'LIVE';
        } else {
          seekBar.value = -Math.floor(secondsBehind);
          this._shadow.getElementById('timeDisplay').textContent = '-' + this._formatTime(secondsBehind);
        }
        
        const min = parseFloat(seekBar.min) || -600;
        const max = parseFloat(seekBar.max) || 0;
        const val = parseFloat(seekBar.value) || 0;
        if (max !== min) {
          const percentage = ((val - min) / (max - min)) * 100;
          seekBar.style.background = `linear-gradient(to right, #9146ff ${percentage}%, rgba(255,255,255,0.4) ${percentage}%)`;
        }
      }
    }

    _formatTime(seconds) {
      const s = Math.floor(seconds);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      return `${m}:${String(sec).padStart(2, '0')}`;
    }

    onRewind(cb) { this._rewindCallbacks.push(cb); }
    onReturnToLive(cb) { this._liveCallbacks.push(cb); }
  }

  class Orchestrator {
    constructor() {
      this._vodResolver = new VODResolver();
      this._player = new RewindPlayer();
      this._ui = new UIController();
      this._currentChannel = null;
      this._mode = null;
      this._vodData = null;
      this._settings = { autoStart: true, autoUnmute: false };
      this._statusInterval = null;
      this._catchUpEnabled = false;
      this._lastCatchUpRate = 1.0;
    }

    init() {
      window.addEventListener('message', (e) => {
        if (e.source === window && e.data?.source === 'TWITCH_REWIND_ISOLATED') {
          if (['SETTINGS_LOADED', 'SETTINGS_UPDATED'].includes(e.data.action)) {
            Object.assign(this._settings, e.data.payload);
            
            if (this._settings.autoStart === false) {
              this._mode = 'off';
              this._ui.unmount();
              this._player.destroy();
              if (this._statusInterval) { clearInterval(this._statusInterval); this._statusInterval = null; }
              window.postMessage({ source: 'TWITCH_REWIND_MAIN', action: 'BUFFER_STATS_UPDATE', payload: { mode: 'off', channel: this._currentChannel, title: document.title } }, '*');
            } else if (e.data.action === 'SETTINGS_UPDATED' && this._settings.autoStart) {
              this._onChannelChange(this._currentChannel);
            }
          }
        }
      });

      this._ui.onRewind(s => this._onRewind(s));
      this._ui.onReturnToLive(() => this._onReturnToLive());
      this._player.onBuffering((state) => this._ui.setBuffering(state));

      this._bindKeyboardShortcuts();

      let lastUrl = location.href;
      const checkNav = () => { if (location.href !== lastUrl) { lastUrl = location.href; this._onUrlChange(); } };
      const op = history.pushState; const or = history.replaceState;
      history.pushState = function(...a) { op.apply(this, a); checkNav(); };
      history.replaceState = function(...a) { or.apply(this, a); checkNav(); };
      window.addEventListener('popstate', checkNav);
      
      setInterval(checkNav, 1000);
      this._onUrlChange();
    }

    _bindKeyboardShortcuts() {
      window.addEventListener('keydown', (e) => {
        const ae = document.activeElement;
        if (ae && (['INPUT', 'TEXTAREA'].includes(ae.tagName) || ae.isContentEditable)) return;

        const key = e.key.toLowerCase();
        
        if (key === 'arrowleft' || key === 'j') {
          e.preventDefault(); e.stopPropagation();
          this._seekRelative(-10);
        } else if (key === 'arrowright' || key === 'l') {
          e.preventDefault(); e.stopPropagation();
          this._seekRelative(10);
        } else if (key === 'arrowup') {
          e.preventDefault(); e.stopPropagation();
          this._changeVolume(0.05);
        } else if (key === 'arrowdown') {
          e.preventDefault(); e.stopPropagation();
          this._changeVolume(-0.05);
        } else if (key === '<' || key === ',') {
          e.preventDefault(); e.stopPropagation();
          this._changeSpeed(-0.25);
        } else if (key === '>' || key === '.') {
          e.preventDefault(); e.stopPropagation();
          this._changeSpeed(0.25);
        } else if (key >= '0' && key <= '9') {
          e.preventDefault(); e.stopPropagation();
          this._seekToPercent(parseInt(key, 10) / 10);
        } else if (key === 'm') {
          e.preventDefault(); e.stopPropagation();
          const muteBtn = document.querySelector('[data-a-target="player-mute-unmute-button"]');
          if (muteBtn) muteBtn.click();
        } else if (key === 'k') {
          e.preventDefault(); e.stopPropagation();
          const playBtn = document.querySelector('[data-a-target="player-play-pause-button"]');
          if (playBtn) playBtn.click();
        } else if (key === 'f') {
          e.preventDefault(); e.stopPropagation();
          const fsBtn = document.querySelector('[data-a-target="player-fullscreen-button"]');
          if (fsBtn) fsBtn.click();
        } else if (key === ' ' && ae && ae.tagName !== 'BUTTON') { 
          e.preventDefault(); e.stopPropagation();
          const playBtn = document.querySelector('[data-a-target="player-play-pause-button"]');
          if (playBtn) playBtn.click();
        } else if (key === 'c') {
          e.preventDefault(); e.stopPropagation();
          this._toggleCatchUp();
        } else if (key === '?' || key === 'h') {
          e.preventDefault(); e.stopPropagation();
          this._ui.toggleShortcutOverlay();
        } else if (key === 'escape') {
          this._ui.hideShortcutOverlay();
        }
      }, true);
    }

    _changeVolume(delta) {
      if (this._mode === 'disabled' || this._mode === 'off') return;
      const video = this._player._twitchVideo || document.querySelector('video');
      if (!video) return;
      let newVol = video.volume + delta;
      if (newVol > 1) newVol = 1;
      if (newVol < 0) newVol = 0;
      
      if (newVol > 0 && video.muted) {
          const muteBtn = document.querySelector('[data-a-target="player-mute-unmute-button"]');
          if (muteBtn) muteBtn.click();
          setTimeout(() => { if (video) video.volume = newVol; }, 20);
      } else {
          video.volume = newVol;
      }
      this._ui.showNotification(`Volume: ${Math.round(newVol * 100)}%`);
    }

    _changeSpeed(delta) {
      if (this._mode === 'disabled' || this._mode === 'off') return;
      // Manual speed change disables catch-up
      if (this._catchUpEnabled) {
        this._catchUpEnabled = false;
        this._ui.setCatchUpBadge(false);
      }
      if (this._player && this._player._overlayVideo) {
          let newSpeed = this._player._overlayVideo.playbackRate + delta;
          if (newSpeed < 0.25) newSpeed = 0.25;
          if (newSpeed > 2.0) newSpeed = 2.0;
          this._player._overlayVideo.playbackRate = newSpeed;
          this._ui.showNotification(`Speed: ${newSpeed}x`);
      }
    }

    _toggleCatchUp() {
      if (this._mode === 'disabled' || this._mode === 'off') return;
      this._catchUpEnabled = !this._catchUpEnabled;
      if (this._catchUpEnabled) {
        this._lastCatchUpRate = 1.0;
        this._ui.showNotification('Catch-up: ON');
        this._ui.setCatchUpBadge(true, '...');
        // Start rewind if not already active — jump back 10s to give it something to catch up to
        if (!this._player.isActive() && this._mode === 'vod') {
          this._onRewind(10);
        }
      } else {
        if (this._player._overlayVideo) {
          this._player._overlayVideo.playbackRate = 1.0;
        }
        this._ui.showNotification('Catch-up: OFF');
        this._ui.setCatchUpBadge(false);
      }
    }

    _seekToPercent(percent) {
      if (this._mode === 'disabled' || this._mode === 'off') return;
      let maxAvailable = 0;
      if (this._mode === 'vod' && this._vodData) {
        maxAvailable = (Date.now() - new Date(this._vodData.streamStartedAt).getTime()) / 1000;
      }
      
      let targetBehind = maxAvailable * (1 - percent);
      
      if (targetBehind <= 3) {
        this._onReturnToLive();
      } else {
        this._onRewind(targetBehind);
      }
      this._ui.flashControls();
      this._ui.showNotification(`Seek: ${Math.round(percent * 100)}%`);
    }

    _seekRelative(delta) {
      if (this._mode === 'disabled' || this._mode === 'off') return;
      let currentBehind = 0;
      if (this._player.isActive()) {
        currentBehind = this._player.getSecondsBehindLive();
      }
      
      let targetBehind = currentBehind - delta;
      
      let maxAvailable = 0;
      if (this._mode === 'vod' && this._vodData) {
        maxAvailable = (Date.now() - new Date(this._vodData.streamStartedAt).getTime()) / 1000;
      }
      
      if (targetBehind > maxAvailable) targetBehind = maxAvailable;

      if (targetBehind <= 3) {
        this._onReturnToLive();
      } else {
        this._onRewind(targetBehind);
      }
      
      this._ui.flashControls();
    }

    _onUrlChange() {
      const match = location.pathname.match(/^\/([a-zA-Z0-9_]{3,25})(?:\/)?$/);
      if (!match || ['directory', 'settings', 'subscriptions', 'videos'].includes(match[1].toLowerCase())) return;
      const channel = match[1].toLowerCase();
      if (channel !== this._currentChannel) {
        this._currentChannel = channel;
        this._onChannelChange(channel);
      }
    }

    async _onChannelChange(channel) {
      if (this._checkContainerInterval) { clearInterval(this._checkContainerInterval); this._checkContainerInterval = null; }
      this._ui.unmount();
      this._player.destroy();
      if (this._statusInterval) { clearInterval(this._statusInterval); this._statusInterval = null; }
      if (!this._settings.autoStart) return;

      const status = await this._vodResolver.resolve(channel);
      
      // Re-verify channel and autoStart in case settings loaded while awaiting network response
      if (!this._settings.autoStart || this._currentChannel !== channel) return;

      if (!status || !status.isLive) {
          // Channel is offline. Do not mount the extension UI or intercept network requests.
          return;
      }

      if (status.vodData) { 
        this._mode = 'vod'; 
        this._vodData = status.vodData; 
        this._player.preloadVOD(status.vodData.playlistUrl);
      } else { 
        this._mode = 'disabled'; 
        this._vodData = null; 
      }

      this._checkContainerInterval = setInterval(() => {
        if (!this._settings.autoStart) {
          clearInterval(this._checkContainerInterval);
          return;
        }
        if (document.querySelector('.video-player__container')) {
          clearInterval(this._checkContainerInterval);
          this._ui.mount();
          if (this._mode === 'disabled') {
            this._ui.setDisabledNotice(true);
          }
          this._statusInterval = setInterval(() => this._updateStatus(), 1000);
          
          if (this._settings.autoUnmute) {
             let attempts = 0;
             const unmuteInterval = setInterval(() => {
                if (++attempts > 10) { clearInterval(unmuteInterval); return; }
                const video = document.querySelector('video');
                if (video && (video.muted || video.volume === 0)) {
                   video.muted = false;
                   if (video.volume === 0) video.volume = 0.5;
                   clearInterval(unmuteInterval);
                }
             }, 500);
          }
        }
      }, 500);
    }

    _updateStatus() {
      if (this._ui._host && !document.contains(this._ui._host)) {
        this._ui._mounted = false;
        this._ui.mount();
        if (this._mode === 'disabled') {
          this._ui.setDisabledNotice(true);
        }
      }

      let maxAvailable = 0;
      if (this._mode === 'vod' && this._vodData) {
        maxAvailable = (Date.now() - new Date(this._vodData.streamStartedAt).getTime()) / 1000;
      }

      const isLive = !this._player.isActive();
      let secondsBehind = 0;

      if (!isLive) {
        secondsBehind = this._player.getSecondsBehindLive();
      }

      // Auto catch-up speed adjustment
      if (this._catchUpEnabled && !isLive && this._player._overlayVideo) {
        let targetRate = 1.0;
        if (secondsBehind > 120) targetRate = 2.0;
        else if (secondsBehind > 30) targetRate = 1.5;
        else if (secondsBehind > 10) targetRate = 1.25;
        else if (secondsBehind <= 5) {
          this._catchUpEnabled = false;
          this._player._overlayVideo.playbackRate = 1.0;
          this._ui.setCatchUpBadge(false);
          this._ui.showNotification('Caught up!');
          this._onReturnToLive();
          return;
        }

        if (targetRate !== this._lastCatchUpRate) {
          this._player._overlayVideo.playbackRate = targetRate;
          this._lastCatchUpRate = targetRate;
          this._ui.setCatchUpBadge(true, targetRate);
        }
      } else if (!this._catchUpEnabled && this._player._overlayVideo && this._player._overlayVideo.playbackRate !== 1.0 && !this._player.isActive()) {
        // Reset speed when not catching up and returned to live
        this._player._overlayVideo.playbackRate = 1.0;
      }

      this._ui.updateStatus(isLive, secondsBehind, maxAvailable, this._mode);

      window.postMessage({
        source: 'TWITCH_REWIND_MAIN',
        action: 'BUFFER_STATS_UPDATE',
        payload: {
          mode: this._mode,
          bufferedSeconds: maxAvailable,
          channel: this._currentChannel,
          title: document.title
        }
      }, '*');
    }

    _onRewind(seconds) {
      if (this._mode !== 'vod') return;
      this._player.seekVOD(seconds);
    }

    _onReturnToLive() {
      if (this._catchUpEnabled) {
        this._catchUpEnabled = false;
        this._lastCatchUpRate = 1.0;
        this._ui.setCatchUpBadge(false);
      }
      this._player.returnToLive();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => new Orchestrator().init());
  else new Orchestrator().init();

})();



