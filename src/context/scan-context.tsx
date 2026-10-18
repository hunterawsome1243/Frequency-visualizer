import type { ReactNode } from 'react';

import type { BleScanState } from '@/hooks/use-ble-scan';
import type { Scanner } from '@/lib/scanner';

/** Shares one useBleScan instance across the radar, list and detail screens. */
export function ScanProvider(props: { children: ReactNode; scanner?: Scanner }): ReactNode {
  throw new Error('not implemented');
}

/** Throws if used outside ScanProvider. */
export function useScan(): BleScanState {
  throw new Error('not implemented');
}
