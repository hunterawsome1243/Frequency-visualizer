import type { ReactNode } from 'react';

/**
 * Reads useScan() and shows what the user needs to do for the current status: allow Bluetooth
 * (permission-denied, with an "Open settings" button), turn Bluetooth on, use a development build
 * (unsupported), an error with retry, or nothing while scanning. Renders null when there is nothing to say.
 */
export function ScanStatusCard(): ReactNode {
  throw new Error('not implemented');
}
