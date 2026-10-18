/** Decodes standard base64 (padding optional) to bytes. Returns an empty array for null, empty or invalid input. */
export function base64ToBytes(input: string | null | undefined): Uint8Array {
  throw new Error('not implemented');
}

/** Formats bytes as lowercase hex pairs separated by spaces, e.g. "4c 00 12 19". */
export function bytesToHex(bytes: Uint8Array): string {
  throw new Error('not implemented');
}
