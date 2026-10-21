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

    // Ignore hotkeys when typing inside an input or textarea
    const target = e.target;
    const tag = target ? target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || (target && target.isContentEditable)) {
      if (e.key === 'Escape') {
        target.blur();
        if (handlers.onEscape) handlers.onEscape();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyB') {
      e.preventDefault();
      if (handlers.onToggleSidebar) handlers.onToggleSidebar();
      return;
    }

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (handlers.onPlayPause) handlers.onPlayPause();
        break;

      case 'ArrowLeft':
        e.preventDefault();
        if (e.shiftKey) {
          if (handlers.onPrevious) handlers.onPrevious();
        } else {
          if (handlers.onSeekRel) handlers.onSeekRel(-5);
        }
        break;

      case 'ArrowRight':
        e.preventDefault();
        if (e.shiftKey) {
          if (handlers.onNext) handlers.onNext();
        } else {
          if (handlers.onSeekRel) handlers.onSeekRel(5);
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (handlers.onVolumeRel) handlers.onVolumeRel(0.05);
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (handlers.onVolumeRel) handlers.onVolumeRel(-0.05);
        break;

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
