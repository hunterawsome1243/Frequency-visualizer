/** RSSI that maps to the centre of the radar, and the one that maps to its edge. */
export const RADAR_RSSI_RANGE = { strongest: -30, weakest: -100 } as const;

/** 0 = centre (strong), 1 = edge (weak). Clamped to [0, 1]. null/NaN gives 1. */
export function rssiToRadiusFraction(rssi: number | null | undefined): number {
  throw new Error('not implemented');
}

/** Stable angle in radians in [0, 2π) derived from the device id, so a device keeps its bearing between updates. */
export function idToAngle(id: string): number {
  throw new Error('not implemented');
}

/** Position of a dot on a radar of the given radius, centred at (cx, cy). Angle 0 points up, increasing clockwise. */
export function radarPosition(
  id: string,
  rssi: number | null | undefined,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number } {
  throw new Error('not implemented');
}
