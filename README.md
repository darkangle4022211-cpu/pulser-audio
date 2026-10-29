# Pulsar Music Player 🎵

> Premium 100% Offline MP3 Music Player for Linux with Custom Playlists, 10-Band Graphic Equalizer, and Real-Time Audio Visualizer.

---

## ✨ Features

- **100% Offline Playback**: Fast, private local audio playback without cloud dependencies or telemetries.
- **Dynamic 60FPS Audio Visualizer**: Real-time frequency spectrum and audio waveform visualization powered by the Web Audio API.
- **10-Band Graphic Equalizer**: Fine-tuned presets (Rock, Pop, Jazz, Electronic, Bass Boost, Flat) and customizable EQ sliders.
- **Playlist & Library Management**: Create, reorganize, search, and manage your local music tracks seamlessly.
- **ID3 Metadata Parsing**: Automatic extraction of artist, album, track title, and embedded cover artwork.
- **Linux Native Packaging**: Desktop launcher, system notifications, and `.deb` packaging for Ubuntu/Debian.

---

## 🚀 Quick Start (Development)

Ensure you have **Node.js** (v18+) installed on your system.

```bash
# 1. Install dependencies
npm install

# 2. Run web frontend in development mode
npm run dev

# 3. Launch with Electron
npm run electron:dev
```

---

## 📦 Building Native Packages

To build the native Linux `.deb` installer:

```bash
npm run build:deb
```

The resulting package will be created in `dist-electron/pulsar-music-player_1.0.0_amd64.deb`.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
