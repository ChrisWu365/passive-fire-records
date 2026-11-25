export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

const JPEG_START = [0xff, 0xd8, 0xff];
const PNG_START = [0x89, 0x50, 0x4e, 0x47];
const RIFF_START = [0x52, 0x49, 0x46, 0x46];
const WEBP_MARK = [0x57, 0x45, 0x42, 0x50];
const WEBP_MARK_OFFSET = 8;

/**
 * Tells JPEG, PNG and WebP apart from the first bytes of the file. Uploaded photos are stored without a
 * file extension, so the content is the only reliable source of the type.
 *
 * @returns the type, or undefined when the bytes are none of the three accepted formats
 */
export function detectImageMimeType(bytes: Uint8Array): ImageMimeType | undefined {
  if (startsWith(bytes, JPEG_START, 0)) return 'image/jpeg';
  if (startsWith(bytes, PNG_START, 0)) return 'image/png';
  if (startsWith(bytes, RIFF_START, 0) && startsWith(bytes, WEBP_MARK, WEBP_MARK_OFFSET)) return 'image/webp';
  return undefined;
}

function startsWith(bytes: Uint8Array, expected: number[], offset: number): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}
