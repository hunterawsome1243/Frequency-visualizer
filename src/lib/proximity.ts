import type { Proximity } from './types';

/** RSSI (dBm) at or above `near` is near; at or above `medium` is medium; anything lower is far. */
export const PROXIMITY_THRESHOLDS = { near: -60, medium: -80 } as const;

/** Turns RSSI into a rough proximity. null, NaN or 127 (the "not available" value some stacks report) give "unknown". */
export function rssiToProximity(rssi: number | null | undefined): Proximity {
  throw new Error('not implemented');
}

/** Human label, e.g. "Near", "Medium", "Far", "Unknown". */
export function proximityLabel(p: Proximity): string {
  throw new Error('not implemented');
}
