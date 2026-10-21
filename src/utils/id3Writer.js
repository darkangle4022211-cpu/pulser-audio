/**
 * Lightweight Zero-Dependency ID3v2.3 Tag Writer
 * Prepends standard ID3v2.3 metadata (Title, Artist, Album, Year, Genre, Cover Art)
 * to MP3 audio buffers so they are universally recognized by all desktop players.
 */

export function writeID3Tags(mp3Buffer, tags = {}) {
  const frames = [];

  // Text Frame Helper
  function createTextFrame(frameId, text) {
    if (!text) return null;
    const str = String(text);
    const textEncoder = new TextEncoder();
    const strBytes = textEncoder.encode(str);
    // 1 byte encoding (0x03 = UTF-8) + text bytes
    const dataSize = 1 + strBytes.length;
    const frame = new Uint8Array(10 + dataSize);

    // Frame ID (4 bytes)
    for (let i = 0; i < 4; i++) frame[i] = frameId.charCodeAt(i);
    // Size (4 bytes big-endian)
    frame[4] = (dataSize >> 24) & 0xff;
    frame[5] = (dataSize >> 16) & 0xff;
    frame[6] = (dataSize >> 8) & 0xff;
    frame[7] = dataSize & 0xff;
    // Flags (2 bytes: 0)
    frame[8] = 0;
    frame[9] = 0;
    // Encoding byte (0x03 = UTF-8)
    frame[10] = 0x03;
    // Text bytes
    frame.set(strBytes, 11);

    return frame;
  }

  // APIC Frame Helper (Album Artwork)
  function createPictureFrame(imageBuffer, mimeType = 'image/jpeg') {
    if (!imageBuffer || imageBuffer.byteLength === 0) return null;
    const mimeBytes = new TextEncoder().encode(mimeType);
    // Encoding (1) + MIME + null terminator (1) + PicType (1) + Description null terminator (1) + Image Data
    const dataSize = 1 + mimeBytes.length + 1 + 1 + 1 + imageBuffer.byteLength;
    const frame = new Uint8Array(10 + dataSize);

    // Frame ID: APIC
    frame[0] = 0x41; // A
    frame[1] = 0x50; // P
    frame[2] = 0x49; // I
    frame[3] = 0x43; // C

    // Size
    frame[4] = (dataSize >> 24) & 0xff;
    frame[5] = (dataSize >> 16) & 0xff;
    frame[6] = (dataSize >> 8) & 0xff;
    frame[7] = dataSize & 0xff;
    frame[8] = 0;
    frame[9] = 0;

    let offset = 10;
    frame[offset++] = 0x00; // ISO-8859-1 for mime/description
    frame.set(mimeBytes, offset);
    offset += mimeBytes.length;
    frame[offset++] = 0x00; // Null byte terminating MIME string
    frame[offset++] = 0x03; // Picture Type: 0x03 = Cover (front)
    frame[offset++] = 0x00; // Null byte terminating Description
    frame.set(new Uint8Array(imageBuffer), offset);

    return frame;
  }

  if (tags.title) frames.push(createTextFrame('TIT2', tags.title));
  if (tags.artist) frames.push(createTextFrame('TPE1', tags.artist));
  if (tags.album) frames.push(createTextFrame('TALB', tags.album));
  if (tags.year) frames.push(createTextFrame('TYER', tags.year));
  if (tags.genre) frames.push(createTextFrame('TCON', tags.genre));
  if (tags.coverBuffer) {
    frames.push(createPictureFrame(tags.coverBuffer, tags.coverMime || 'image/jpeg'));
  }

  // Calculate total frames size
  const totalFramesSize = frames.reduce((acc, f) => acc + (f ? f.byteLength : 0), 0);
  if (totalFramesSize === 0) {
    return mp3Buffer;
  }

  // ID3v2 Header: 10 bytes
  const header = new Uint8Array(10);
  header[0] = 0x49; // 'I'
  header[1] = 0x44; // 'D'
  header[2] = 0x33; // '3'
  header[3] = 0x03; // Version 2.3
  header[4] = 0x00; // Revision 0
  header[5] = 0x00; // Flags

  // Size in syncsafe integer (4 bytes, 7 bits per byte)
  header[6] = (totalFramesSize >> 21) & 0x7f;
  header[7] = (totalFramesSize >> 14) & 0x7f;
  header[8] = (totalFramesSize >> 7) & 0x7f;
  header[9] = totalFramesSize & 0x7f;

  // Combine Header + Frames + MP3 Buffer
  const mp3Bytes = new Uint8Array(mp3Buffer);
  const totalLength = 10 + totalFramesSize + mp3Bytes.byteLength;
  const output = new Uint8Array(totalLength);

  output.set(header, 0);
  let curOffset = 10;
  for (const frame of frames) {
    if (frame) {
      output.set(frame, curOffset);
      curOffset += frame.byteLength;
    }
  }
  output.set(mp3Bytes, curOffset);

  return output.buffer;
}
