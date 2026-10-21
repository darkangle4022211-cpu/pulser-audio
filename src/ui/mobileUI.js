/**
 * Mobile UI Controller & Touch Gestures for Pulsar Music Player
 * Flagship YouTube Music Mobile Experience for screens <= 768px
 */

export function initMobileUI(appInstance) {
  const isMobileViewport = () => window.innerWidth <= 768 || document.body.classList.contains('platform-mobile');

  // Elements
  const appSidebar = document.getElementById('appSidebar');
  const nowPlayingStage = document.getElementById('nowPlayingStage');
  const npCollapseBtn = document.getElementById('npCollapseBtn');
  const playerBar = document.querySelector('.player-bar');
  const playerLeftDetails = document.getElementById('playerLeftDetails');
  const eqModal = document.getElementById('eqModal');
  const mobileSearchBtn = document.getElementById('mobileSearchBtn');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileDrawerBackdrop = document.getElementById('mobileDrawerBackdrop');
  const flowSearchInput = document.getElementById('flowSearchInput');
  const navDiscover = document.getElementById('navDiscover');
  const navAllSongs = document.getElementById('navAllSongs');
  const navFavorites = document.getElementById('navFavorites');

  // Bottom Nav Tabs
  const mTabHome = document.getElementById('mTabHome');
  const mTabExplore = document.getElementById('mTabExplore');
  const mTabPlaylists = document.getElementById('mTabPlaylists');
  const mTabLibrary = document.getElementById('mTabLibrary');
  const mobileTabs = [mTabHome, mTabExplore, mTabPlaylists, mTabLibrary].filter(Boolean);

  function setActiveTab(activeBtn) {
    mobileTabs.forEach(t => t.classList.remove('active'));
    if (activeBtn) activeBtn.classList.add('active');
  }

  // Mini-player progress bar element creation
  let miniProgressLine = document.querySelector('.mini-player-progress-line');
  if (!miniProgressLine && playerBar) {
    miniProgressLine = document.createElement('div');
    miniProgressLine.className = 'mini-player-progress-line';
    miniProgressLine.style.width = '0%';
    playerBar.appendChild(miniProgressLine);
  }

  // 1. Bottom Nav Tab Actions
  if (mTabHome) {
    mTabHome.addEventListener('click', () => {
      setActiveTab(mTabHome);
      if (navDiscover) navDiscover.click();
      const scrollEl = document.getElementById('flowBodyScroll') || document.getElementById('mainContent');
      if (scrollEl) scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (mTabExplore) {
    mTabExplore.addEventListener('click', () => {
      setActiveTab(mTabExplore);
      if (navDiscover) navDiscover.click();
      // Scroll down to vibes or trending
      const vibesSec = document.querySelector('.flow-vibes-section') || document.getElementById('flowPlaylistsSection');
      if (vibesSec) {
        vibesSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  if (mTabPlaylists) {
    mTabPlaylists.addEventListener('click', () => {
      setActiveTab(mTabPlaylists);
      if (navFavorites) navFavorites.click();
    });
  }

  if (mTabLibrary) {
    mTabLibrary.addEventListener('click', () => {
      setActiveTab(mTabLibrary);
      openDrawer();
    });
  }

  // 2. Mobile Drawer open/close
  function openDrawer() {
    if (appSidebar) appSidebar.classList.add('mobile-open');
    if (mobileDrawerBackdrop) mobileDrawerBackdrop.classList.add('active');
  }

  function closeDrawer() {
    if (appSidebar) appSidebar.classList.remove('mobile-open');
    if (mobileDrawerBackdrop) mobileDrawerBackdrop.classList.remove('active');
  }

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      if (appSidebar && appSidebar.classList.contains('mobile-open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });
  }

  if (mobileDrawerBackdrop) {
    mobileDrawerBackdrop.addEventListener('click', closeDrawer);
  }

  // Close drawer when clicking any nav item inside sidebar
  if (appSidebar) {
    appSidebar.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (isMobileViewport()) closeDrawer();
      });
    });
  }

  // 3. Mobile Header Search Button
  if (mobileSearchBtn) {
    mobileSearchBtn.addEventListener('click', () => {
      if (navDiscover) navDiscover.click();
      if (flowSearchInput) {
        flowSearchInput.focus();
        flowSearchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  // 4. Slide-Up Full-Screen Now Playing Stage
  function openFullPlayer() {
    if (!nowPlayingStage) return;
    nowPlayingStage.style.display = 'flex';
    requestAnimationFrame(() => {
      nowPlayingStage.classList.add('mobile-active');
    });
    // Push history state for Android hardware back button support
    try {
      history.pushState({ modal: 'nowPlaying' }, '');
    } catch (_) {}
  }

  function closeFullPlayer() {
    if (!nowPlayingStage) return;
    nowPlayingStage.classList.remove('mobile-active');
    setTimeout(() => {
      if (!nowPlayingStage.classList.contains('mobile-active')) {
        // if on desktop, app.js controls display
        if (isMobileViewport()) {
          nowPlayingStage.style.display = 'none';
        }
      }
    }, 320);
  }

  if (playerLeftDetails) {
    playerLeftDetails.addEventListener('click', (e) => {
      if (isMobileViewport()) {
        e.stopPropagation();
        openFullPlayer();
      }
    });
  }

  if (playerBar) {
    playerBar.addEventListener('click', (e) => {
      if (isMobileViewport()) {
        // Don't expand if play/pause or heart was tapped
        if (e.target.closest('#playPauseBtn') || e.target.closest('#playerHeartBtn')) return;
        openFullPlayer();
      }
    });
  }

  if (npCollapseBtn) {
    npCollapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFullPlayer();
    });
  }

  // 5. Mobile Seeker & Full Player Controls Sync
  const npTrackTitle = document.getElementById('npTrackTitle');
  const npTrackArtist = document.getElementById('npTrackArtist');
  const npLargeCover = document.getElementById('npLargeCover');
  const playerTitle = document.getElementById('playerTitle');
  const playerArtist = document.getElementById('playerArtist');
  const playerThumb = document.getElementById('playerThumb');

  // Create mobile full player controls injection if not in DOM
  const npArtColumn = document.querySelector('.np-art-column');
  if (npArtColumn && !document.querySelector('.mobile-full-player-controls')) {
    const controlsWrap = document.createElement('div');
    controlsWrap.className = 'mobile-full-player-controls';
    controlsWrap.innerHTML = `
      <div class="mobile-seeker-row">
        <div class="mobile-seeker-track" id="mSeekerTrack">
          <div class="mobile-seeker-fill" id="mSeekerFill" style="width:0%;"></div>
        </div>
        <div class="mobile-seeker-timestamps">
          <span id="mTimeCurrent">0:00</span>
          <span id="mTimeDuration">0:00</span>
        </div>
      </div>
      <div class="mobile-main-playback-btns">
        <button id="mShuffleBtn" class="icon-btn" title="Shuffle">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
        </button>
        <button id="mPrevBtn" class="icon-btn" title="Previous">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button id="mPlayPauseBtn" class="mobile-btn-play-pause-lg" title="Play/Pause">
          <svg id="mPlayIcon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <svg id="mPauseIcon" viewBox="0 0 24 24" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        </button>
        <button id="mNextBtn" class="icon-btn" title="Next">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </button>
        <button id="mRepeatBtn" class="icon-btn" title="Repeat">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
        </button>
      </div>
      <div class="mobile-aux-tools-row">
        <button id="mSpeedBtn" class="mobile-aux-tool-btn">1.0x</button>
        <button id="mEqBtn" class="mobile-aux-tool-btn">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>
          <span>Equalizer</span>
        </button>
        <button id="mVizBtn" class="mobile-aux-tool-btn">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 9h4v11H4zm6-5h4v16h-4zm6 8h4v8h-4z"/></svg>
          <span>Visualizer</span>
        </button>
      </div>
    `;
    npArtColumn.appendChild(controlsWrap);

    // Wire buttons to corresponding desktop handlers
    const mPlayPauseBtn = document.getElementById('mPlayPauseBtn');
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (mPlayPauseBtn && playPauseBtn) {
      mPlayPauseBtn.addEventListener('click', () => playPauseBtn.click());
    }

    const mPrevBtn = document.getElementById('mPrevBtn');
    const prevBtn = document.getElementById('prevBtn');
    if (mPrevBtn && prevBtn) mPrevBtn.addEventListener('click', () => prevBtn.click());

    const mNextBtn = document.getElementById('mNextBtn');
    const nextBtn = document.getElementById('nextBtn');
    if (mNextBtn && nextBtn) mNextBtn.addEventListener('click', () => nextBtn.click());

    const mShuffleBtn = document.getElementById('mShuffleBtn');
    const shuffleBtn = document.getElementById('shuffleBtn');
    if (mShuffleBtn && shuffleBtn) mShuffleBtn.addEventListener('click', () => shuffleBtn.click());

    const mRepeatBtn = document.getElementById('mRepeatBtn');
    const repeatBtn = document.getElementById('repeatBtn');
    if (mRepeatBtn && repeatBtn) mRepeatBtn.addEventListener('click', () => repeatBtn.click());

    const mSpeedBtn = document.getElementById('mSpeedBtn');
    const speedBtn = document.getElementById('speedBtn');
    if (mSpeedBtn && speedBtn) {
      mSpeedBtn.addEventListener('click', () => {
        speedBtn.click();
        mSpeedBtn.textContent = speedBtn.textContent.trim();
      });
    }

    const mEqBtn = document.getElementById('mEqBtn');
    const eqModalBtn = document.getElementById('eqModalBtn');
    if (mEqBtn && eqModalBtn) mEqBtn.addEventListener('click', () => eqModalBtn.click());

    const mVizBtn = document.getElementById('mVizBtn');
    const visualizerToggleBtn = document.getElementById('visualizerToggleBtn');
    if (mVizBtn && visualizerToggleBtn) mVizBtn.addEventListener('click', () => visualizerToggleBtn.click());

    // Mobile Seeker Touch/Click Drag
    const mSeekerTrack = document.getElementById('mSeekerTrack');
    if (mSeekerTrack) {
      const handleSeek = (e) => {
        const rect = mSeekerTrack.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        if (appInstance && appInstance.audioEngine && appInstance.audioEngine.audio) {
          const dur = appInstance.audioEngine.audio.duration;
          if (dur && !isNaN(dur) && dur > 0) {
            appInstance.audioEngine.seek(ratio * dur);
          }
        }
      };
      mSeekerTrack.addEventListener('click', handleSeek);
      mSeekerTrack.addEventListener('touchmove', handleSeek, { passive: true });
    }
  }

  // 6. Timeupdate Listener to sync Mini-Player Progress & Mobile Seeker
  if (appInstance && appInstance.audioEngine && appInstance.audioEngine.audio) {
    appInstance.audioEngine.audio.addEventListener('timeupdate', () => {
      const audio = appInstance.audioEngine.audio;
      const cur = audio.currentTime || 0;
      const dur = audio.duration || 0;
      const pct = dur > 0 ? (cur / dur) * 100 : 0;

      if (miniProgressLine) miniProgressLine.style.width = `${pct}%`;

      const mSeekerFill = document.getElementById('mSeekerFill');
      if (mSeekerFill) mSeekerFill.style.width = `${pct}%`;

      const mTimeCurrent = document.getElementById('mTimeCurrent');
      const mTimeDuration = document.getElementById('mTimeDuration');
      if (mTimeCurrent && appInstance._formatDuration) mTimeCurrent.textContent = appInstance._formatDuration(cur);
      if (mTimeDuration && appInstance._formatDuration) mTimeDuration.textContent = appInstance._formatDuration(dur);

      // Play/Pause icon sync
      const mPlayIcon = document.getElementById('mPlayIcon');
      const mPauseIcon = document.getElementById('mPauseIcon');
      if (mPlayIcon && mPauseIcon) {
        if (audio.paused) {
          mPlayIcon.style.display = 'block';
          mPauseIcon.style.display = 'none';
        } else {
          mPlayIcon.style.display = 'none';
          mPauseIcon.style.display = 'block';
        }
      }
    });
  }

  // 7. Android Hardware Back Button Support
  window.addEventListener('popstate', (e) => {
    if (eqModal && eqModal.classList.contains('active')) {
      const closeEqBtn = document.getElementById('closeEqBtn');
      if (closeEqBtn) closeEqBtn.click();
      return;
    }
    if (nowPlayingStage && nowPlayingStage.classList.contains('mobile-active')) {
      closeFullPlayer();
      return;
    }
    if (appSidebar && appSidebar.classList.contains('mobile-open')) {
      closeDrawer();
      return;
    }
  });

  // 8. Virtual Keyboard Protection: adjust padding/visibility when focus enters inputs
  document.querySelectorAll('input, textarea').forEach(inp => {
    inp.addEventListener('focus', () => {
      if (isMobileViewport()) {
        document.body.classList.add('keyboard-open');
      }
    });
    inp.addEventListener('blur', () => {
      document.body.classList.remove('keyboard-open');
    });
  });
}
