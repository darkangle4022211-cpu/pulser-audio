/**
 * High-Performance Web Audio Playback Engine
 * Features:
 * - 10-Band Graphic Equalizer (32Hz - 16kHz)
 * - 3D Stereo Widener / Spatial Depth Toggle
 * - Soft Peak Limiter (DynamicsCompressorNode)
 * - Logarithmic Volume Control & Mute
 * - Variable Playback Speed (0.5x - 2.0x) with Pitch Preservation
 * - AnalyserNode for 60FPS Canvas Visualizers
 * - Smooth Crossfade Transitions
 */

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bassBoost: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  vocal: [-2, -2, -1, 2, 4, 4, 3, 1, 0, -1],
  rock: [4, 3, 2, 0, -1, 0, 2, 3, 4, 4],
  pop: [-1, 1, 3, 4, 3, 0, -1, -1, 2, 3],
  classical: [4, 3, 2, 2, -1, -1, 0, 2, 3, 3]
};

class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preservesPitch = true;

    this.audioCtx = null;
    this.sourceNode = null;
    this.analyser = null;
    this.gainNode = null;
    this.compressor = null;
    this.eqNodes = [];
    this.widenerGain = null;
    this.widenerDelay = null;

    this.isWidenerActive = false;
    this.isMuted = false;
    this.previousVolume = 0.8;
    this.crossfadeDuration = 1.5; // seconds
    this._trackDuration = 0;
    this.audio.preload = 'auto';

    this.onTimeUpdate = null;
    this.onEnded = null;
    this.onError = null;
    this.onPlayStateChange = null;

    this._bindAudioEvents();
  }

  _ensureAudioContext() {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContextClass({ latencyHint: 'playback' });

    // Source
    this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

    // 10-Band Graphic Equalizer Filters
    this.eqNodes = EQ_FREQUENCIES.map((freq, i) => {
      const filter = this.audioCtx.createBiquadFilter();
      if (i === 0) {
        filter.type = 'lowshelf';
      } else if (i === EQ_FREQUENCIES.length - 1) {
        filter.type = 'highshelf';
      } else {
        filter.type = 'peaking';
        filter.Q.value = 1.4;
      }
      filter.frequency.value = freq;
      filter.gain.value = 0;
      return filter;
    });

    // Chain EQ nodes sequentially
    for (let i = 0; i < this.eqNodes.length - 1; i++) {
      this.eqNodes[i].connect(this.eqNodes[i + 1]);
    }

    // 3D Stereo Widener nodes
    this.widenerDelay = this.audioCtx.createDelay();
    this.widenerDelay.delayTime.value = 0.012; // 12ms phase offset
    this.widenerGain = this.audioCtx.createGain();
    this.widenerGain.gain.value = 0; // Off by default

    // Dynamics Compressor (Soft Limiter to prevent clipping)
    this.compressor = this.audioCtx.createDynamicsCompressor();
    this.compressor.threshold.value = -3.0; // dB
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    // Master Gain Node
    this.gainNode = this.audioCtx.createGain();
    this.setVolume(this.previousVolume);

    // Analyser Node (60 FPS Visualizer)
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.8;

    // Widener path and compressor to master routing
    this.widenerDelay.connect(this.widenerGain);
    this.widenerGain.connect(this.compressor);

    this.compressor.connect(this.gainNode);
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);

    this._updateEQRouting();
  }

  _isEQFlat() {
    if (!this.eqNodes || this.eqNodes.length === 0) return true;
    return this.eqNodes.every(node => Math.abs(node.gain.value) < 0.01);
  }

  _updateEQRouting() {
    if (!this.sourceNode || !this.compressor || !this.eqNodes || this.eqNodes.length === 0) return;

    const lastEq = this.eqNodes[this.eqNodes.length - 1];

    try {
      this.sourceNode.disconnect();
    } catch (e) {}

    try {
      lastEq.disconnect();
    } catch (e) {}

    if (this._isEQFlat() && !this.isWidenerActive) {
      this.sourceNode.connect(this.compressor);
    } else {
      this.sourceNode.connect(this.eqNodes[0]);
      lastEq.connect(this.compressor);
      if (this.widenerDelay) {
        lastEq.connect(this.widenerDelay);
      }
    }
  }

  _bindAudioEvents() {
    this.audio.addEventListener('timeupdate', () => {
      if (this.onTimeUpdate) {
        this.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
      }
    });

    this.audio.addEventListener('play', () => {
      if (this.onPlayStateChange) this.onPlayStateChange(true);
    });

    this.audio.addEventListener('playing', () => {
      if (this.onPlayStateChange) this.onPlayStateChange(true);
    });

    this.audio.addEventListener('canplay', () => {
      if (!this.audio.paused && this.onPlayStateChange) {
        this.onPlayStateChange(true);
      }
    });

    this.audio.addEventListener('pause', () => {
      if (this.onPlayStateChange && !this.isChangingTrack) this.onPlayStateChange(false);
    });

    this.audio.addEventListener('ended', () => {
      if (this.onEnded) this.onEnded();
    });

    this.audio.addEventListener('error', (e) => {
      if (this.onPlayStateChange) this.onPlayStateChange(false);
      if (this.onError) this.onError(e);
    });
  }

  setTrackDuration(duration) {
    if (duration && isFinite(duration) && duration > 0) {
      this._trackDuration = Number(duration);
    }
  }

  async loadAndPlay(src, startTime = 0, duration = 0) {
    this._ensureAudioContext();
    this.isChangingTrack = true;
    if (duration && isFinite(duration) && duration > 0) {
      this.setTrackDuration(duration);
    }
    this.audio.preload = 'auto';
    this.audio.src = src;
    if (startTime > 0) {
      try {
        this.audio.currentTime = startTime;
      } catch (e) {}
    }

    try {
      await this.audio.play();
      if (this.onPlayStateChange) this.onPlayStateChange(true);
    } catch (err) {
      console.warn('Playback error / Autoplay prevented:', err);
      if (this.onPlayStateChange) this.onPlayStateChange(false);
      throw err;
    } finally {
      this.isChangingTrack = false;
    }
  }

  play() {
    this._ensureAudioContext();
    return this.audio.play();
  }

  pause() {
    this.audio.pause();
  }

  seek(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return;
    const dur = this.getDuration();
    const target = (dur && isFinite(dur) && dur > 0)
      ? Math.max(0, Math.min(seconds, dur))
      : Math.max(0, seconds);
    try {
      if (this.audio) {
        this.audio.currentTime = target;
        if (this.onTimeUpdate) {
          this.onTimeUpdate(target, dur);
        }
      }
    } catch (e) {
      console.warn('Seek error:', e);
    }
  }

  setVolume(linearVal) {
    const val = Math.max(0, Math.min(1, linearVal));
    this.previousVolume = val;

    // Logarithmic curve for natural volume perception: y = x^2
    const logGain = Math.pow(val, 2);

    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : logGain, this.audioCtx ? this.audioCtx.currentTime : 0);
    }
    this.audio.volume = val;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.setVolume(this.previousVolume);
    return this.isMuted;
  }

  setPlaybackRate(rate) {
    this.audio.playbackRate = Math.max(0.5, Math.min(2.0, rate));
  }

  setEQBand(index, gainDb) {
    this._ensureAudioContext();
    if (this.eqNodes[index]) {
      this.eqNodes[index].gain.setValueAtTime(gainDb, this.audioCtx.currentTime);
      this._updateEQRouting();
    }
  }

  applyEQPreset(presetName) {
    const gains = EQ_PRESETS[presetName] || EQ_PRESETS.flat;
    this._ensureAudioContext();
    gains.forEach((gain, i) => {
      if (this.eqNodes[i]) {
        this.eqNodes[i].gain.setValueAtTime(gain, this.audioCtx.currentTime);
      }
    });
    this._updateEQRouting();
    return gains;
  }

  toggleStereoWidener(enable) {
    this._ensureAudioContext();
    this.isWidenerActive = enable !== undefined ? enable : !this.isWidenerActive;
    if (this.widenerGain) {
      this.widenerGain.gain.setValueAtTime(this.isWidenerActive ? 0.35 : 0, this.audioCtx.currentTime);
    }
    this._updateEQRouting();
    return this.isWidenerActive;
  }

  getAnalyserData(frequencyDataArray) {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(frequencyDataArray);
      return true;
    }
    return false;
  }

  getWaveformData(timeDomainDataArray) {
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(timeDomainDataArray);
      return true;
    }
    return false;
  }

  isPlaying() {
    return !this.audio.paused && !this.audio.ended;
  }

  isPaused() {
    return this.audio.paused || this.audio.ended;
  }

  getCurrentTime() {
    return this.audio.currentTime || 0;
  }

  getDuration() {
    if (this.audio && this.audio.duration && isFinite(this.audio.duration) && this.audio.duration > 0) {
      return this.audio.duration;
    }
    return this._trackDuration || 0;
  }
}

export const audioEngine = new AudioEngine();
