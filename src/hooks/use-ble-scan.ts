import type { Scanner } from '@/lib/scanner';
import type { ScannedDevice, ScanStatus } from '@/lib/types';

export interface BleScanState {
  status: ScanStatus;
  /** Plain-language explanation for non-ok statuses (e.g. "Turn on Bluetooth to scan"). */
  message: string | null;
  /** Unsorted; screens sort and filter with src/lib/sort-filter. */
  devices: ScannedDevice[];
  isScanning: boolean;
  /** Requests permission if needed, then starts scanning. Safe to call while already scanning. */
  start(): Promise<void>;
  stop(): void;
  /** Forgets all devices seen so far. */
  clear(): void;
}

export interface BleScanOptions {
  /** How often the device list is pushed to React state while scanning, in ms (default 500). */
  updateIntervalMs?: number;
  /** Devices unseen for this long are dropped (default DEFAULT_STALE_MS). */
  staleMs?: number;
  /** Injected clock for tests (default Date.now). */
  now?: () => number;
}

/**
 * Owns a Scanner: batches advertisements with upsertAdvertisement, prunes stale devices,
 * publishes the list at most every updateIntervalMs, stops on unmount and destroys a scanner
 * it created itself. Pass a scanner (e.g. createFakeScanner()) in tests; otherwise it creates
 * createBleScanner() lazily on first start().
 */
export function useBleScan(scanner?: Scanner, options?: BleScanOptions): BleScanState {
  throw new Error('not implemented');
}
