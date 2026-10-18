import { base64ToBytes, bytesToHex } from '@/lib/base64';

const bytes = (input: string | null | undefined) => Array.from(base64ToBytes(input));

/** Small reference encoder so the round-trip test does not need Node's Buffer. */
function encode(values: number[]): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < values.length; i += 3) {
    const [a, b, c] = [values[i], values[i + 1], values[i + 2]];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63];
    out += b === undefined ? '=' : alphabet[(n >> 6) & 63];
    out += c === undefined ? '=' : alphabet[n & 63];
  }
  return out;
}

describe('base64ToBytes', () => {
  it('decodes full groups', () => {
    expect(bytes('TWFu')).toEqual([77, 97, 110]);
    expect(bytes('TWFuTWFu')).toEqual([77, 97, 110, 77, 97, 110]);
  });

  it('decodes padded input', () => {
    expect(bytes('TWE=')).toEqual([77, 97]);
    expect(bytes('TQ==')).toEqual([77]);
  });

  it('tolerates missing or partial padding', () => {
    expect(bytes('TWE')).toEqual([77, 97]);
    expect(bytes('TQ')).toEqual([77]);
    expect(bytes('TQ=')).toEqual([77]);
  });

  it('ignores whitespace anywhere', () => {
    expect(bytes(' TW\nFu\t')).toEqual([77, 97, 110]);
    expect(bytes('TQ =\r\n=')).toEqual([77]);
  });

  it('decodes Apple manufacturer data as react-native-ble-plx gives it', () => {
    expect(bytesToHex(base64ToBytes('TAASGQ=='))).toBe('4c 00 12 19');
  });

  it('agrees with the reference encoder on a known value', () => {
    expect(encode([77, 97, 110, 77])).toBe('TWFuTQ==');
  });

  it('round-trips every byte value', () => {
    const all = Array.from({ length: 256 }, (_, i) => i);
    for (let length = 0; length <= 6; length++) {
      const slice = all.slice(250 - length, 250);
      expect(bytes(encode(slice))).toEqual(slice);
    }
    expect(bytes(encode(all))).toEqual(all);
  });

  it('does not depend on Buffer or atob', () => {
    const globals = globalThis as { Buffer?: unknown; atob?: unknown };
    const savedBuffer = globals.Buffer;
    const savedAtob = globals.atob;
    globals.Buffer = undefined;
    globals.atob = undefined;
    try {
      expect(bytes('AP8=')).toEqual([0, 255]);
    } finally {
      globals.Buffer = savedBuffer;
      globals.atob = savedAtob;
    }
  });

  it.each([null, undefined, '', '   ', '\n'])('returns an empty array for %p', (input) => {
    const result = base64ToBytes(input);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toHaveLength(0);
  });

  it.each([
    ['a character outside the alphabet', 'TW!u'],
    ['URL-safe characters', 'TW-_'],
    ['a non-ASCII character', 'TWFú'],
    ['a lone character in the last group', 'TWFuT'],
    ['a single character', 'T'],
    ['too much padding', 'TQ==='],
    ['padding on a full group', 'TWFu='],
    ['padding in the middle', 'TQ==TWFu'],
    ['data after padding', 'T=Q='],
    ['only padding', '=='],
    ['more padding than the group needs', 'TWE=='],
  ])('returns an empty array for %s', (_, input) => {
    expect(bytes(input)).toEqual([]);
  });
});

describe('bytesToHex', () => {
  it('formats lowercase pairs separated by spaces', () => {
    expect(bytesToHex(new Uint8Array([0x4c, 0x00, 0x12, 0x19]))).toBe('4c 00 12 19');
    expect(bytesToHex(new Uint8Array([255, 1, 0xab]))).toBe('ff 01 ab');
  });

  it('gives an empty string for no bytes', () => {
    expect(bytesToHex(new Uint8Array(0))).toBe('');
  });

  it('formats a single byte without separators', () => {
    expect(bytesToHex(new Uint8Array([7]))).toBe('07');
  });
});
