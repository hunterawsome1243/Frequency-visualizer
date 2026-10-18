import type { ReactNode } from 'react';

import type { TrackerMatch } from '@/lib/types';

/** Small warning pill, e.g. "⚠ Possible AirTag". Renders null when tracker is null. */
export function TrackerBadge(props: { tracker: TrackerMatch | null; compact?: boolean }): ReactNode {
  throw new Error('not implemented');
}
