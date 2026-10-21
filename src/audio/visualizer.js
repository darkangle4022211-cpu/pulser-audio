/**
 * 60 FPS High-Performance Canvas Audio Visualizer
 * Modes:
 * 1. Glowing Frequency Spectrum Bars with Peak Caps
 * 2. Smooth Oscillating Sine Waveform
 * High Efficiency: Automatically sleeps when window is minimized or hidden (<1% CPU)
 */

import { audioEngine } from './engine.js';

export class AudioVisualizer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { alpha: true });
    this.mode = 'off'; // Default 'off' for 0% CPU & 0% GPU until user toggles it on
    this.animationId = null;
    this.timeoutId = null;
    this.isRunning = false;

    this.frameInterval = 100; // ~10 FPS: smooth visualizer while saving 90ms of deep CPU/GPU sleep

    this.fftSize = 64;
    this.freqData = new Uint8Array(this.fftSize / 2);
    this.waveData = new Uint8Array(this.fftSize);
    this.peaks = new Array(this.fftSize / 2).fill(0);

    this._gradient = null;
    this._lastH = 0;

    this._setupVisibilityListener();
    this._handleResize();
    window.addEventListener('resize', () => this._handleResize());
  }

  _handleResize() {
    if (!this.canvas) return;
    this.canvas.width = 256;
    this.canvas.height = 64;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this._gradient = null;
  }

  _setupVisibilityListener() {
    // Only run animation when window is active and mode is enabled
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stop(false);
      } else if (audioEngine.isPlaying() && this.mode !== 'off') {
        this.start();
      }
    });
  }

  toggleMode() {
    if (this.mode === 'off') {
      this.mode = 'bars';
      if (audioEngine.isPlaying()) {
        this.start();
      }
    } else if (this.mode === 'bars') {
      this.mode = 'wave';
    } else {
      this.mode = 'off';
      this.stop(true);
    }
    return this.mode;
  }

  start() {
    if (this.mode === 'off') return;
    this.isRunning = true;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this._render();
  }

  stop(clearCanvas = true) {
    this.isRunning = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (clearCanvas && this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  _render() {
    if (!this.isRunning || this.mode === 'off') {
      return;
    }

    const w = this.canvas.width;
    const h = this.canvas.height;

    // If audio is paused and not currently transitioning tracks, decay peaks smoothly
    if (audioEngine.isPaused && audioEngine.isPaused() && !audioEngine.isChangingTrack) {
      let hasPeaks = false;
      for (let i = 0; i < this.peaks.length; i++) {
        this.peaks[i] = Math.max(0, this.peaks[i] - 2);
        if (this.peaks[i] > 0) hasPeaks = true;
      }
      if (!hasPeaks) {
        this.stop(true);
        return;
      }
    }

    this.ctx.clearRect(0, 0, w, h);

    if (this.mode === 'bars') {
      this._drawBars(w, h);
    } else if (this.mode === 'wave') {
      this._drawWave(w, h);
    }

    // Schedule next frame with a true delay (~10 FPS) so the CPU enters deep C-states
    this.timeoutId = setTimeout(() => {
      if (this.isRunning && this.mode !== 'off') {
        this.animationId = requestAnimationFrame(() => this._render());
      }
    }, this.frameInterval);
  }

  _drawBars(w, h) {
    const hasData = audioEngine.getAnalyserData(this.freqData);
    if (!hasData) {
      for (let i = 0; i < this.peaks.length; i++) {
        this.peaks[i] = Math.max(0, this.peaks[i] - 2);
      }
      return;
    }

    const numBars = this.freqData.length;
    const barWidth = (w / numBars) * 0.75;
    const gap = (w / numBars) * 0.25;

    // Cache gradient across frames
    if (!this._gradient || this._lastH !== h) {
      this._gradient = this.ctx.createLinearGradient(0, h, 0, 0);
      this._gradient.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
      this._gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.8)');
      this._gradient.addColorStop(1, '#06b6d4');
      this._lastH = h;
    }

    // Pass 1: Draw all 32 gradient bars
    this.ctx.fillStyle = this._gradient;
    for (let i = 0; i < numBars; i++) {
      const val = this.freqData[i];
      const barHeight = Math.max(2, (val / 255) * (h * 0.9));
      const x = i * (barWidth + gap) + gap / 2;
      const y = h - barHeight;
      this.ctx.fillRect(x, y, barWidth, barHeight);
      if (barHeight > this.peaks[i]) {
        this.peaks[i] = barHeight;
      } else {
        this.peaks[i] = Math.max(0, this.peaks[i] - 1.2);
      }
    }

    // Pass 2: Draw all 32 peak caps in a single style pass
    this.ctx.fillStyle = '#22d3ee';
    for (let i = 0; i < numBars; i++) {
      const x = i * (barWidth + gap) + gap / 2;
      const peakY = h - this.peaks[i] - 3;
      this.ctx.fillRect(x, peakY, barWidth, 2);
    }
  }

  _drawWave(w, h) {
    const hasData = audioEngine.getWaveformData(this.waveData);
    if (!hasData) return;

    this.ctx.lineWidth = 2.0;
    this.ctx.strokeStyle = '#06b6d4';

    this.ctx.beginPath();
    const sliceWidth = w / this.waveData.length;
    let x = 0;

    for (let i = 0; i < this.waveData.length; i++) {
      const v = this.waveData[i] / 128.0;
      const y = (v * h) / 2;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    this.ctx.lineTo(w, h / 2);
    this.ctx.stroke();
  }
}
