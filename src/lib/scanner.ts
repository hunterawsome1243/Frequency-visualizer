import type { Advertisement, ScanStatus } from './types';

export interface ScannerListener {
  onAdvertisement(ad: Advertisement): void;
  onStatus(status: ScanStatus, message?: string): void;
}

export type PermissionResult = 'granted' | 'denied' | 'blocked';

/** Thin wrapper around the BLE library so the hook and tests can use a fake. */
export interface Scanner {
  /** Asks for the runtime permissions the platform needs (Android 12+: BLUETOOTH_SCAN/CONNECT; older Android: fine location; iOS: handled by the system on first scan). */
  requestPermissions(): Promise<PermissionResult>;
  /** Starts scanning, reporting every advertisement (duplicates allowed so RSSI stays live) and status changes. */
  start(listener: ScannerListener): void;
  stop(): void;
  /** Releases the native manager. The scanner must not be used afterwards. */
  destroy(): void;
}

/**
 * Real scanner backed by react-native-ble-plx. When the native module is missing (Expo Go, web, Jest)
 * it returns a scanner whose start() reports status "unsupported" with a message saying a development
 * build is needed, instead of crashing.
 */
export function createBleScanner(): Scanner {
  throw new Error('not implemented');
}

/** Test double: records calls and lets tests push advertisements and statuses. */
export interface FakeScanner extends Scanner {
  emit(ad: Advertisement): void;
  emitStatus(status: ScanStatus, message?: string): void;
  permissionResult: PermissionResult;
  readonly started: boolean;
  readonly destroyed: boolean;
}

export function createFakeScanner(permissionResult?: PermissionResult): FakeScanner {
  throw new Error('not implemented');
}
