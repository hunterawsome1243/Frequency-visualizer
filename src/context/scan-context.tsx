import { createContext, type ReactNode, useContext } from 'react';

import { type BleScanOptions, type BleScanState, useBleScan } from '@/hooks/use-ble-scan';
import type { Scanner } from '@/lib/scanner';

const ScanContext = createContext<BleScanState | null>(null);
ScanContext.displayName = 'ScanContext';

/** Shares one useBleScan instance across the radar, list and detail screens. */
export function ScanProvider(props: {
  children: ReactNode;
  scanner?: Scanner;
  /** Passed to useBleScan, e.g. a faster update interval in tests. */
  options?: BleScanOptions;
}): ReactNode {
  // useBleScan memoises what it returns, so consumers re-render only when the scan state changes.
  const scan = useBleScan(props.scanner, props.options);
  return <ScanContext value={scan}>{props.children}</ScanContext>;
}

/** Throws if used outside ScanProvider. */
export function useScan(): BleScanState {
  const scan = useContext(ScanContext);
  if (scan === null) throw new Error('useScan() must be used inside <ScanProvider>.');
  return scan;
}
