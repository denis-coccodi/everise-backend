// Reads an image's format and size from its first bytes, without decoding it.
// The format comes from the file itself, never from what the client claims,
// so only these four kinds of image are ever stored and served.

type ImageType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

interface ImageInfo {
  type: ImageType;
  width: number;
  height: number;
}

function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) =>
    offset + length <= bytes.length
      ? String.fromCharCode(...bytes.subarray(offset, offset + length))
      : '';

  try {
    // PNG: signature, then the IHDR chunk with width and height.
    if (ascii(1, 3) === 'PNG' && bytes[0] === 0x89 && ascii(12, 4) === 'IHDR') {
      return sized('image/png', data.getUint32(16), data.getUint32(20));
    }

    // GIF: logical screen size, little-endian.
    if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') {
      return sized(
        'image/gif',
        data.getUint16(6, true),
        data.getUint16(8, true)
      );
    }

    // WebP: a RIFF container with one of three chunk kinds.
    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
      return readWebp(data, ascii(12, 4));
    }

    // JPEG: the size is in the first start-of-frame segment.
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      return readJpeg(data);
    }
  } catch {
    // Truncated data: reading past the end throws a RangeError.
  }
  return null;
}

function readWebp(data: DataView, chunk: string): ImageInfo | null {
  switch (chunk) {
    case 'VP8 ':
      // Lossy: 14-bit sizes after the frame tag and start code.
      return sized(
        'image/webp',
        data.getUint16(26, true) & 0x3fff,
        data.getUint16(28, true) & 0x3fff
      );
    case 'VP8L': {
      // Lossless: 14-bit sizes minus one, packed after a 0x2f signature.
      const bits = data.getUint32(21, true);
      return sized(
        'image/webp',
        (bits & 0x3fff) + 1,
        ((bits >> 14) & 0x3fff) + 1
      );
    }
    case 'VP8X':
      // Extended: 24-bit canvas sizes minus one.
      return sized('image/webp', uint24(data, 24) + 1, uint24(data, 27) + 1);
    default:
      return null;
  }
}

function readJpeg(data: DataView): ImageInfo | null {
  let offset = 2;
  while (offset + 4 <= data.byteLength) {
    if (data.getUint8(offset) !== 0xff) return null;
    const marker = data.getUint8(offset + 1);
    // Fill bytes before a marker.
    if (marker === 0xff) {
      offset++;
      continue;
    }
    const length = data.getUint16(offset + 2);
    // Start of frame: every SOFn except DHT (C4), JPG (C8) and DAC (CC).
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return sized(
        'image/jpeg',
        data.getUint16(offset + 7),
        data.getUint16(offset + 5)
      );
    }
    offset += 2 + length;
  }
  return null;
}

function uint24(data: DataView, offset: number) {
  return (
    data.getUint8(offset) |
    (data.getUint8(offset + 1) << 8) |
    (data.getUint8(offset + 2) << 16)
  );
}

function sized(type: ImageType, width: number, height: number) {
  return width > 0 && height > 0 ? {type, width, height} : null;
}

export {ImageInfo, ImageType, readImageInfo};
