import type { Advertisement, TrackerMatch } from './types';

/**
 * Best-effort guess whether an advertisement comes from a tracker (AirTag / Apple Find My,
 * Tile, Samsung SmartTag, Chipolo). Returns null when nothing matches. Never claims certainty:
 * labels say "Possible ..." or "Likely ...".
 */
export function detectTracker(ad: Advertisement): TrackerMatch | null {
  throw new Error('not implemented');
}
