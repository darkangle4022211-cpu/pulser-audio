/**
 * 100% Offline Pure JavaScript ID3v1 & ID3v2 Audio Tag Parser
 * Extracts Title, Artist, Album, Year, Track Number, and Embedded Cover Art (APIC)
 */

export async function parseAudioMetadata(file) {
  const defaultMeta = {
    title: formatCleanFilename(file.name),
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    year: '',
    trackNumber: '',
    duration: 0,
    coverUrl: null,
    fileName: file.name,
    fileSize: file.size,
    type: file.type || 'audio/mpeg',
    lastModified: file.lastModified
  };

  try {
    // Read the first 512KB for ID3v2 headers and embedded cover art
    const sliceSize = Math.min(file.size, 512 * 1024);
    const buffer = await file.slice(0, sliceSize).arrayBuffer();
    const view = new DataView(buffer);

    // Check for ID3v2 magic bytes ("ID3")
    if (view.getUint8(0) === 0x49 && view.getUint8(1) === 0x44 && view.getUint8(2) === 0x33) {
      const version = view.getUint8(3);
      const tagSize = parseSyncsafeInt(view, 6);
      parseID3v2(view, version, Math.min(tagSize + 10, buffer.byteLength), defaultMeta);
    } else {
      // Fallback: Check for ID3v1 at the last 128 bytes of the file
      if (file.size >= 128) {
        const v1Buffer = await file.slice(file.size - 128).arrayBuffer();
        const v1View = new DataView(v1Buffer);
        parseID3v1(v1View, defaultMeta);
      }
    }
  } catch (err) {
    console.warn('Metadata parse warning:', err);
  }

  return defaultMeta;
}

function parseSyncsafeInt(view, offset) {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  );
}

function parseID3v2(view, version, maxOffset, meta) {
  let offset = 10;
  const isV23 = version === 3;
  const isV24 = version === 4;

  while (offset < maxOffset - 10) {
    // Read 4-character Frame ID
    const frameId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );

    if (frameId.charCodeAt(0) === 0) break; // Padding reached

    const frameSize = isV24
      ? parseSyncsafeInt(view, offset + 4)
      : view.getUint32(offset + 4);

    if (frameSize <= 0 || offset + 10 + frameSize > maxOffset) break;

    const dataOffset = offset + 10;

    if (frameId === 'TIT2') {
      meta.title = decodeTextFrame(view, dataOffset, frameSize) || meta.title;
    } else if (frameId === 'TPE1') {
      meta.artist = decodeTextFrame(view, dataOffset, frameSize) || meta.artist;
    } else if (frameId === 'TALB') {
      meta.album = decodeTextFrame(view, dataOffset, frameSize) || meta.album;
    } else if (frameId === 'TYER' || frameId === 'TDRC') {
      meta.year = decodeTextFrame(view, dataOffset, frameSize) || meta.year;
    } else if (frameId === 'TRCK') {
      meta.trackNumber = decodeTextFrame(view, dataOffset, frameSize) || '';
    } else if (frameId === 'APIC' && !meta.coverUrl) {
      meta.coverUrl = decodeAPICFrame(view, dataOffset, frameSize);
    }

    offset += 10 + frameSize;
  }
}

function decodeTextFrame(view, offset, size) {
  if (size <= 1) return '';
  const encoding = view.getUint8(offset);
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset + 1, size - 1);
  return decodeString(bytes, encoding).trim();
}

function decodeAPICFrame(view, offset, size) {
  try {
    const encoding = view.getUint8(offset);
    let cur = offset + 1;

    // Read MIME type (null-terminated ASCII)
    let mime = '';
    while (cur < offset + size && view.getUint8(cur) !== 0) {
      mime += String.fromCharCode(view.getUint8(cur));
      cur++;
    }
    cur++; // skip null byte

    // Picture type byte (0x03 = Cover Front)
    cur++;

    // Skip description (null-terminated according to encoding)
    if (encoding === 1 || encoding === 2) {
      while (cur < offset + size - 1) {
        if (view.getUint8(cur) === 0 && view.getUint8(cur + 1) === 0) {
          cur += 2;
          break;
        }
        cur += 2;
      }
    } else {
      while (cur < offset + size && view.getUint8(cur) !== 0) {
        cur++;
      }
      cur++;
    }

    if (cur >= offset + size) return null;

    const imgBytes = new Uint8Array(view.buffer, view.byteOffset + cur, offset + size - cur);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < imgBytes.length; i += chunkSize) {
      const chunk = imgBytes.subarray(i, Math.min(i + chunkSize, imgBytes.length));
      binary += String.fromCharCode.apply(null, chunk);
    }
    const base64 = btoa(binary);
    return `data:${mime || 'image/jpeg'};base64,${base64}`;
  } catch (e) {
    return null;
  }
}

function decodeID3v1(view, meta) {
  const tag = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2));
  if (tag === 'TAG') {
    const title = decodeAscii(view, 3, 30).trim();
    const artist = decodeAscii(view, 33, 30).trim();
    const album = decodeAscii(view, 63, 30).trim();
    const year = decodeAscii(view, 93, 4).trim();

    if (title) meta.title = title;
    if (artist) meta.artist = artist;
    if (album) meta.album = album;
    if (year) meta.year = year;
  }
}

function decodeAscii(view, offset, length) {
  let str = '';
  for (let i = 0; i < length; i++) {
    const code = view.getUint8(offset + i);
    if (code === 0) break;
    str += String.fromCharCode(code);
  }
  return str;
}

function decodeString(bytes, encoding) {
  let str = '';
  try {
    if (encoding === 1) {
      str = new TextDecoder('utf-16').decode(bytes);
    } else if (encoding === 2) {
      str = new TextDecoder('utf-16be').decode(bytes);
    } else if (encoding === 3) {
      str = new TextDecoder('utf-8').decode(bytes);
    } else {
      str = new TextDecoder('iso-8859-1').decode(bytes);
    }
  } catch (e) {
    str = String.fromCharCode.apply(null, bytes);
  }
  return str.replace(/\0+$/g, '').trim();
}

function formatCleanFilename(filename) {
  return filename.replace(/\.[^/.]+$/, '').replace(/^[0-9\s._-]+/, '').trim();
}
