import fs from 'fs';
import path from 'path';
import os from 'os';
import assert from 'assert';

console.log('=== RUNNING VERIFICATION SUITE: DUPLICATE PREVENTION & PHYSICAL DELETION ===\n');

// -------------------------------------------------------------
// Test 1: Duplicate Track Detection Logic
// -------------------------------------------------------------
console.log('Test 1: Verifying duplicate detection logic...');

class AppDuplicateDetector {
  constructor(existingTracks = []) {
    this.tracks = existingTracks;
  }

  _findDuplicateTrack(file, meta = null, filePath = null) {
    if (!this.tracks || this.tracks.length === 0) return null;

    const norm = (p) => (p || '').trim().toLowerCase().replace(/\\/g, '/');
    const cleanFilePath = norm(filePath);
    const fileName = (file && file.name) ? file.name.trim().toLowerCase() : '';
    const fileSize = (file && file.size) ? file.size : 0;
    const title = (meta && meta.title) ? meta.title.trim().toLowerCase() : '';
    const artist = (meta && meta.artist) ? meta.artist.trim().toLowerCase() : '';
    const duration = (meta && meta.duration) ? meta.duration : 0;

    for (const existing of this.tracks) {
      // 1. Check exact file path if available
      if (cleanFilePath && existing.filePath) {
        if (norm(existing.filePath) === cleanFilePath) {
          return existing;
        }
      }
      // 2. Check exact file name and file size
      if (fileName && existing.fileName && existing.fileName.trim().toLowerCase() === fileName) {
        if (fileSize > 0 && existing.fileSize && existing.fileSize === fileSize) {
          return existing;
        }
      }
      // 3. Check audio metadata (title & artist)
      if (title && existing.title) {
        const exTitle = existing.title.trim().toLowerCase();
        const exArtist = (existing.artist || '').trim().toLowerCase();
        if (exTitle === title && exArtist === artist) {
          if (fileSize > 0 && existing.fileSize && existing.fileSize === fileSize) {
            return existing;
          }
          if (duration > 0 && existing.duration > 0 && Math.abs(existing.duration - duration) < 2) {
            return existing;
          }
          if (fileName && existing.fileName && existing.fileName.trim().toLowerCase() === fileName) {
            return existing;
          }
        }
      }
    }
    return null;
  }
}

const existingLibrary = [
  {
    id: 'trk_1',
    title: 'Cosmic Horizon',
    artist: 'Pulsar Audio',
    fileName: '01_Cosmic_Horizon.mp3',
    fileSize: 250669,
    filePath: '/run/media/hamza/Disk D/mp3 player/test-tracks/01_Cosmic_Horizon.mp3',
    duration: 6.27
  },
  {
    id: 'trk_2',
    title: 'Cybernetic Pulse',
    artist: 'Pulsar Audio',
    fileName: '02_Cybernetic_Pulse.mp3',
    fileSize: 250661,
    filePath: '/run/media/hamza/Disk D/mp3 player/test-tracks/02_Cybernetic_Pulse.mp3',
    duration: 6.27
  }
];

const detector = new AppDuplicateDetector(existingLibrary);

// Case A: Matching by exact file path
const dupByPath = detector._findDuplicateTrack(
  { name: 'random_copy.mp3', size: 999999 },
  { title: 'Different Tag', artist: 'Different' },
  '/run/media/hamza/Disk D/mp3 player/test-tracks/01_Cosmic_Horizon.mp3'
);
assert.ok(dupByPath, 'Should detect duplicate by exact file path');
assert.strictEqual(dupByPath.id, 'trk_1');
console.log('  ✓ Case A passed: Detected duplicate by filePath');

// Case B: Matching by file name and size
const dupByNameAndSize = detector._findDuplicateTrack(
  { name: '02_Cybernetic_Pulse.mp3', size: 250661 },
  null,
  null
);
assert.ok(dupByNameAndSize, 'Should detect duplicate by fileName and fileSize');
assert.strictEqual(dupByNameAndSize.id, 'trk_2');
console.log('  ✓ Case B passed: Detected duplicate by fileName + fileSize');

// Case C: Matching by Title and Artist metadata
const dupByMeta = detector._findDuplicateTrack(
  { name: 'renamed_track.mp3', size: 12345 },
  { title: 'Cosmic Horizon', artist: 'Pulsar Audio', duration: 6.3 },
  null
);
assert.ok(dupByMeta, 'Should detect duplicate by metadata title + artist + duration');
assert.strictEqual(dupByMeta.id, 'trk_1');
console.log('  ✓ Case C passed: Detected duplicate by ID3 title + artist + duration');

// Case D: A completely new unique song
const uniqueSong = detector._findDuplicateTrack(
  { name: 'new_unique_track.mp3', size: 500000 },
  { title: 'Neon Highway', artist: 'Retro Wave', duration: 180 },
  '/home/hamza/Music/new_unique_track.mp3'
);
assert.strictEqual(uniqueSong, null, 'New unique song should not be flagged as duplicate');
console.log('  ✓ Case D passed: Unique song correctly allowed');

// -------------------------------------------------------------
// Test 2: Physical File Deletion From Disk
// -------------------------------------------------------------
console.log('\nTest 2: Verifying physical file deletion on PC disk...');

// Implement the exact logic from main.cjs
async function deletePhysicalFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return { success: false, error: 'Invalid path' };
  try {
    const candidates = [
      filePath,
      path.resolve(filePath),
      path.resolve(process.cwd(), filePath),
      path.join(os.homedir(), 'Music', 'Pulsar Downloads', path.basename(filePath)),
      path.join(os.homedir(), 'Music', path.basename(filePath)),
      path.join(os.homedir(), 'Downloads', path.basename(filePath))
    ];
    for (const p of candidates) {
      if (p && fs.existsSync(p)) {
        const stat = await fs.promises.stat(p);
        if (stat.isFile()) {
          await fs.promises.unlink(p);
          console.log('    [Handler] Successfully deleted physical audio file from disk:', p);

          const lrcPath = p.replace(/\.[^.]+$/, '.lrc');
          if (lrcPath !== p && fs.existsSync(lrcPath)) {
            try {
              await fs.promises.unlink(lrcPath);
              console.log('    [Handler] Deleted companion LRC file:', lrcPath);
            } catch (e) {}
          }

          return { success: true, deletedPath: p };
        }
      }
    }
    return { success: false, error: 'File not found on disk' };
  } catch (err) {
    console.warn('Failed to delete physical file:', filePath, err.message);
    return { success: false, error: err.message };
  }
}

// Create a real temporary test file and companion LRC file
const tempAudioPath = path.join(process.cwd(), 'test-tracks', 'temp_delete_test.mp3');
const tempLrcPath = path.join(process.cwd(), 'test-tracks', 'temp_delete_test.lrc');

fs.writeFileSync(tempAudioPath, 'dummy audio binary data');
fs.writeFileSync(tempLrcPath, '[00:01.00] Temporary lyric');

assert.ok(fs.existsSync(tempAudioPath), 'Temporary audio file must exist before test');
assert.ok(fs.existsSync(tempLrcPath), 'Temporary LRC file must exist before test');
console.log('  Created temporary test files:', tempAudioPath);

// Execute deletePhysicalFile
const deleteResult = await deletePhysicalFile(tempAudioPath);
assert.strictEqual(deleteResult.success, true, 'deletePhysicalFile should report success: true');
assert.strictEqual(fs.existsSync(tempAudioPath), false, 'Audio file MUST be deleted from disk!');
assert.strictEqual(fs.existsSync(tempLrcPath), false, 'Companion LRC file MUST be deleted from disk!');
console.log('  ✓ Verified: Physical audio file and companion .lrc were permanently deleted from disk!');

// Verify deleting non-existent file returns proper error
const nonExistentResult = await deletePhysicalFile('/path/that/does/not/exist_ever_123.mp3');
assert.strictEqual(nonExistentResult.success, false);
assert.strictEqual(nonExistentResult.error, 'File not found on disk');
console.log('  ✓ Verified: Non-existent path returns { success: false, error: "File not found on disk" }');

console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
