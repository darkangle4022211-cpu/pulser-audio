/**
 * Synchronized LRC Lyrics Parser (Offline)
 * Parses standard [mm:ss.xx] and [mm:ss] timestamped lyrics lines
 */

export function parseLRC(lrcText) {
  if (!lrcText || typeof lrcText !== 'string') return [];

  const lines = lrcText.split('\n');
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
  const result = [];

  for (const line of lines) {
    const text = line.replace(timeRegex, '').trim();
    if (!text) continue;

    let match;
    timeRegex.lastIndex = 0;
    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
      const totalSeconds = minutes * 60 + seconds + milliseconds / 1000;

      result.push({
        time: totalSeconds,
        text: text
      });
    }
  }

  // Sort chronologically by timestamp
  return result.sort((a, b) => a.time - b.time);
}
