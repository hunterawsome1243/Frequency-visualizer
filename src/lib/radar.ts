import { isUsableRssi } from './proximity';

/** RSSI that maps to the centre of the radar, and the one that maps to its edge. */
export const RADAR_RSSI_RANGE = { strongest: -30, weakest: -100 } as const;

const TWO_PI = Math.PI * 2;

/** 0 = centre (strong), 1 = edge (weak). Clamped to [0, 1]. null/NaN (and the "not available" 127) give 1. */
export function rssiToRadiusFraction(rssi: number | null | undefined): number {
  if (!isUsableRssi(rssi)) return 1;
  const { strongest, weakest } = RADAR_RSSI_RANGE;
  const fraction = (strongest - rssi) / (strongest - weakest);
  return Math.min(1, Math.max(0, fraction));
}

/** 32-bit FNV-1a hash followed by a murmur3 finaliser, so ids that differ by one character land far apart. */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Stable angle in radians in [0, 2π) derived from the device id, so a device keeps its bearing between updates. */
export function idToAngle(id: string): number {
  return (hashId(id) / 0x100000000) * TWO_PI;
}

/** Position of a dot on a radar of the given radius, centred at (cx, cy). Angle 0 points up, increasing clockwise. */
export function radarPosition(
  id: string,
  rssi: number | null | undefined,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number } {
  const distance = rssiToRadiusFraction(rssi) * radius;
  const angle = idToAngle(id);
  // Screen y grows downwards, so "up" is -y and clockwise turns from up towards +x.
  return {
    x: cx + distance * Math.sin(angle),
    y: cy - distance * Math.cos(angle),
  };
}
