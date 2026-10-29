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

    switch (code) {

      case 'KeyM':
        e.preventDefault();
        if (handlers.onMute) handlers.onMute();
        break;

      case 'KeyS':
        e.preventDefault();
        if (handlers.onShuffle) handlers.onShuffle();
        break;

      case 'KeyL':
        e.preventDefault();
        if (handlers.onLoop) handlers.onLoop();
        break;

      case 'KeyF':
      case 'Slash':
        e.preventDefault();
        if (handlers.onSearchFocus) handlers.onSearchFocus();
        break;

      case 'MediaPlayPause':
        e.preventDefault();
        if (handlers.onMediaPlayPauseTap) {
          handlers.onMediaPlayPauseTap();
        } else if (handlers.onPlayPause) {
          handlers.onPlayPause();
        }
        break;

      case 'MediaTrackNext':
        e.preventDefault();
        if (handlers.onNext) handlers.onNext();
        break;

      case 'MediaTrackPrevious':
        e.preventDefault();
        if (handlers.onPrevious) handlers.onPrevious();
        break;

      case 'MediaStop':
        e.preventDefault();
        if (handlers.onStop) handlers.onStop();
        break;

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
