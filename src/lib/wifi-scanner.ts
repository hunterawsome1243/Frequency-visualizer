import type { WifiNetwork } from './types';

export type WifiScanResult =
  | { status: 'ok'; networks: WifiNetwork[] }
  | { status: 'unsupported'; message: string }
  | { status: 'permission-denied'; message: string }
  | { status: 'error'; message: string };

/** True only on Android with the native module present. */
export function isWifiScanSupported(): boolean {
  throw new Error('not implemented');
}

/** Android only: asks for fine location if needed, then scans and returns the networks strongest first. */
export function scanWifi(): Promise<WifiScanResult> {
  throw new Error('not implemented');
}
