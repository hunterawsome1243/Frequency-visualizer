// Hand-written so it works on Hermes, where Buffer is missing and atob is not guaranteed.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Character code -> 6-bit value, or -1 for characters outside the base64 alphabet. */
const LOOKUP: Int8Array = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) {
    table[ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/** Decodes standard base64 (padding optional) to bytes. Returns an empty array for null, empty or invalid input. */
export function base64ToBytes(input: string | null | undefined): Uint8Array {
  if (typeof input !== 'string') return new Uint8Array(0);

  const clean = input.replace(/\s+/g, '');
  const firstPad = clean.indexOf('=');
  const data = firstPad === -1 ? clean : clean.slice(0, firstPad);
  const padding = clean.length - data.length;
  const rest = data.length % 4;

  // Padding may only appear at the very end, at most twice, and only where a group is incomplete.
  if (padding > 0 && !/^=+$/.test(clean.slice(firstPad))) return new Uint8Array(0);
  if (padding > 2 || rest === 1 || (padding > 0 && (rest === 0 || rest + padding > 4))) {
    return new Uint8Array(0);
  }
  if (data.length === 0) return new Uint8Array(0);

  const out = new Uint8Array(Math.floor((data.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (let i = 0; i < data.length; i++) {
    const code = data.charCodeAt(i);
    const value = code < 128 ? LOOKUP[code] : -1;
    if (value < 0) return new Uint8Array(0);
    buffer = ((buffer << 6) | value) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

/** Formats bytes as lowercase hex pairs separated by spaces, e.g. "4c 00 12 19". */
export function bytesToHex(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    parts.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}
