/**
 * Global Keyboard Shortcuts Manager
 * Hotkeys:
 * - Space: Play/Pause
 * - Left/Right: Seek 5s
 * - Shift + Left/Right: Previous/Next Track
 * - Up/Down: Volume Up/Down (5%)
 * - M: Mute/Unmute
 * - S: Toggle Shuffle
 * - L: Toggle Loop
 * - F or /: Focus Search
 * - Escape: Close modals / clear search
 */

export function setupHotkeys(handlers) {
  // Global blur listener: Clicking anywhere outside text inputs removes focus from inputs
  document.addEventListener('pointerdown', (e) => {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      if (!e.target.closest('input, textarea, [contenteditable="true"]')) {
        document.activeElement.blur();
      }
    }
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    // If any modal dialog is currently active, ignore all player hotkeys except Escape
    const hasActiveModal = document.querySelector('.modal-backdrop.active');
    if (hasActiveModal) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (handlers.onEscape) handlers.onEscape();
      }
      return;
    }

    // Ignore hotkeys when actively typing inside an input or textarea
    const target = e.target;
    const tag = target ? target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || (target && target.isContentEditable)) {
      if (e.key === 'Escape') {
        target.blur();
        if (handlers.onEscape) handlers.onEscape();
      }
      return;
    }

    const key = e.key;
    const code = e.code;

    if ((e.ctrlKey || e.metaKey) && (code === 'KeyB' || key === 'b' || key === 'B')) {
      e.preventDefault();
      if (handlers.onToggleSidebar) handlers.onToggleSidebar();
      return;
    }

    // Left Arrow: Seek Backward (or Previous track with Shift)
    if (key === 'ArrowLeft' || code === 'ArrowLeft' || code === 'Numpad4') {
      e.preventDefault();
      if (e.shiftKey) {
        if (handlers.onPrevious) handlers.onPrevious();
      } else {
        const step = (e.ctrlKey || e.altKey) ? 15 : 5;
        if (handlers.onSeekRel) handlers.onSeekRel(-step);
      }
      return;
    }

    // Right Arrow: Seek Forward (or Next track with Shift)
    if (key === 'ArrowRight' || code === 'ArrowRight' || code === 'Numpad6') {
      e.preventDefault();
      if (e.shiftKey) {
        if (handlers.onNext) handlers.onNext();
      } else {
        const step = (e.ctrlKey || e.altKey) ? 15 : 5;
        if (handlers.onSeekRel) handlers.onSeekRel(step);
      }
      return;
    }

    // Up Arrow: Volume Up
    if (key === 'ArrowUp' || code === 'ArrowUp' || code === 'Numpad8') {
      e.preventDefault();
      if (handlers.onVolumeRel) handlers.onVolumeRel(0.05);
      return;
    }

    // Down Arrow: Volume Down
    if (key === 'ArrowDown' || code === 'ArrowDown' || code === 'Numpad2') {
      e.preventDefault();
      if (handlers.onVolumeRel) handlers.onVolumeRel(-0.05);
      return;
    }

    // Space: Play/Pause
    if (key === ' ' || code === 'Space') {
      e.preventDefault();
      if (handlers.onPlayPause) handlers.onPlayPause();
      return;
    }

    // Universal Media Keys (support both standard e.code and Bluetooth/driver e.key)
    if (key === 'MediaPlayPause' || code === 'MediaPlayPause') {
      e.preventDefault();
      if (handlers.onMediaPlayPauseTap) {
        handlers.onMediaPlayPauseTap();
      } else if (handlers.onPlayPause) {
        handlers.onPlayPause();
      }
      return;
    }

    if (key === 'MediaTrackNext' || code === 'MediaTrackNext' || key === 'MediaNextTrack') {
      e.preventDefault();
      if (handlers.onNext) handlers.onNext();
      return;
    }

    if (key === 'MediaTrackPrevious' || code === 'MediaTrackPrevious' || key === 'MediaPreviousTrack') {
      e.preventDefault();
      if (handlers.onPrevious) handlers.onPrevious();
      return;
    }

    if (key === 'MediaStop' || code === 'MediaStop') {
      e.preventDefault();
      if (handlers.onStop) handlers.onStop();
      return;
    }

    switch (code) {

      case 'KeyQ':
      case 'KeyN':
        e.preventDefault();
        if (handlers.onToggleQueue) handlers.onToggleQueue();
        break;

      case 'Escape':
        if (handlers.onEscape) handlers.onEscape();
        break;
    }
  });
}
