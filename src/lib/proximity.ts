import type { Proximity } from './types';

/** RSSI (dBm) at or above `near` is near; at or above `medium` is medium; anything lower is far. */
export const PROXIMITY_THRESHOLDS = { near: -60, medium: -80 } as const;

/** Value some Bluetooth stacks report when RSSI is not available. */
export const RSSI_UNAVAILABLE = 127;

/** True for a finite RSSI that is not the "not available" value 127. */
export function isUsableRssi(rssi: number | null | undefined): rssi is number {
  return typeof rssi === 'number' && Number.isFinite(rssi) && rssi !== RSSI_UNAVAILABLE;
}

/** Turns RSSI into a rough proximity. null, NaN or 127 (the "not available" value some stacks report) give "unknown". */
export function rssiToProximity(rssi: number | null | undefined): Proximity {
  if (!isUsableRssi(rssi)) return 'unknown';
  if (rssi >= PROXIMITY_THRESHOLDS.near) return 'near';
  if (rssi >= PROXIMITY_THRESHOLDS.medium) return 'medium';
  return 'far';
}

const LABELS: Record<Proximity, string> = {
  near: 'Near',
  medium: 'Medium',
  far: 'Far',
  unknown: 'Unknown',
};

/** Human label, e.g. "Near", "Medium", "Far", "Unknown". */
export function proximityLabel(p: Proximity): string {
  return LABELS[p] ?? LABELS.unknown;
}
