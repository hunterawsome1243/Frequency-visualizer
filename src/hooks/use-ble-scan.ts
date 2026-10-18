import { useEffect, useLayoutEffect, useMemo, useState } from 'react';

import { DEFAULT_STALE_MS, type DeviceMap, pruneStale, upsertAdvertisement } from '@/lib/device-list';
import { createBleScanner, type PermissionResult, type Scanner, type ScannerListener } from '@/lib/scanner';
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

export const DEFAULT_UPDATE_INTERVAL_MS = 500;
export const PERMISSION_DENIED_MESSAGE = 'Bluetooth permission is needed to see nearby devices.';
export const PERMISSION_BLOCKED_MESSAGE =
  'Bluetooth permission is turned off for this app. Allow it in Settings, then try again.';
export const START_FAILED_MESSAGE = "Couldn't start scanning. Try again.";

interface StatusState {
  status: ScanStatus;
  message: string | null;
}

interface ScanConfig {
  scanner: Scanner | undefined;
  updateIntervalMs: number;
  staleMs: number;
  now: () => number;
}

/**
 * The imperative side of the hook, created once per hook instance. Advertisements go into a plain
 * map; React state only changes on the publish interval, so a busy room does not re-render per packet.
 */
function createScanController(
  setStatusState: (next: StatusState) => void,
  setDevices: (next: ScannedDevice[]) => void,
  initialConfig: ScanConfig,
) {
  let config = initialConfig;
  let devices: DeviceMap = {};
  let dirty = false;
  let status: ScanStatus = 'idle';
  /** Bumped by every start, stop and unmount so callbacks from an earlier run are ignored. */
  let generation = 0;
  let mounted = true;
  let active: Scanner | null = null;
  let own: Scanner | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let pendingStart: Promise<void> | null = null;

  function setStatus(next: ScanStatus, message: string | null = null) {
    status = next;
    if (mounted) setStatusState({ status: next, message });
  }

  function publish() {
    if (!dirty || !mounted) return;
    dirty = false;
    setDevices(Object.values(devices));
  }

  function tick() {
    const pruned = pruneStale(devices, config.now(), config.staleMs);
    if (pruned !== devices) {
      devices = pruned;
      dirty = true;
    }
    publish();
  }

  function stopTimer() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(tick, config.updateIntervalMs);
  }

  function stopActive() {
    stopTimer();
    const scanner = active;
    active = null;
    scanner?.stop();
  }

  function resolveScanner(): Scanner {
    if (config.scanner) return config.scanner;
    own ??= createBleScanner();
    return own;
  }

  async function run(runGeneration: number, scanner: Scanner): Promise<void> {
    let permission: PermissionResult;
    try {
      permission = await scanner.requestPermissions();
    } catch {
      permission = 'denied';
    }
    if (runGeneration !== generation || !mounted) return;
    if (permission !== 'granted') {
      setStatus(
        'permission-denied',
        permission === 'blocked' ? PERMISSION_BLOCKED_MESSAGE : PERMISSION_DENIED_MESSAGE,
      );
      return;
    }

    const isCurrent = () => runGeneration === generation;
    const listener: ScannerListener = {
      onAdvertisement(ad) {
        if (!isCurrent()) return;
        devices = upsertAdvertisement(devices, ad, config.now());
        dirty = true;
      },
      onStatus(next, message) {
        if (isCurrent()) setStatus(next, message ?? null);
      },
    };
    active = scanner;
    startTimer();
    try {
      scanner.start(listener);
    } catch {
      stopActive();
      setStatus('error', START_FAILED_MESSAGE);
    }
  }

  return {
    configure(next: ScanConfig) {
      const intervalChanged = next.updateIntervalMs !== config.updateIntervalMs;
      config = next;
      if (intervalChanged && timer !== null) startTimer();
    },

    start(): Promise<void> {
      if (!mounted) return Promise.resolve();
      if (pendingStart) return pendingStart;
      const scanner = resolveScanner();
      if (status === 'scanning' && active === scanner) return Promise.resolve();

      // Anything else (a different scanner, Bluetooth off, an error) starts over from the permission step.
      stopActive();
      generation += 1;
      setStatus('requesting-permission');
      const promise = run(generation, scanner).finally(() => {
        if (pendingStart === promise) pendingStart = null;
      });
      pendingStart = promise;
      return promise;
    },

    stop() {
      if (status === 'idle' && active === null && pendingStart === null) return;
      generation += 1;
      pendingStart = null;
      stopActive();
      // Keep the devices, including any that arrived since the last publish.
      publish();
      setStatus('idle');
    },

    clear() {
      devices = {};
      dirty = false;
      if (mounted) setDevices([]);
    },

    mount() {
      mounted = true;
    },

    unmount() {
      generation += 1;
      pendingStart = null;
      stopActive();
      mounted = false;
      // Only a scanner this hook created is destroyed; an injected one belongs to the caller.
      own?.destroy();
      own = null;
    },
  };
}

/**
 * Owns a Scanner: batches advertisements with upsertAdvertisement, prunes stale devices,
 * publishes the list at most every updateIntervalMs, stops on unmount and destroys a scanner
 * it created itself. Pass a scanner (e.g. createFakeScanner()) in tests; otherwise it creates
 * createBleScanner() lazily on first start().
 */
export function useBleScan(scanner?: Scanner, options?: BleScanOptions): BleScanState {
  const updateIntervalMs = options?.updateIntervalMs ?? DEFAULT_UPDATE_INTERVAL_MS;
  const staleMs = options?.staleMs ?? DEFAULT_STALE_MS;
  const now = options?.now ?? Date.now;

  const [statusState, setStatusState] = useState<StatusState>({ status: 'idle', message: null });
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const [controller] = useState(() =>
    createScanController(setStatusState, setDevices, { scanner, updateIntervalMs, staleMs, now }),
  );

  // A layout effect, so a child that calls start() in its own effect already sees the latest props.
  useLayoutEffect(() => {
    controller.configure({ scanner, updateIntervalMs, staleMs, now });
  });

  useEffect(() => {
    controller.mount();
    return () => controller.unmount();
  }, [controller]);

  const { status, message } = statusState;
  return useMemo(
    () => ({
      status,
      message,
      devices,
      isScanning: status === 'scanning',
      start: controller.start,
      stop: controller.stop,
      clear: controller.clear,
    }),
    [status, message, devices, controller],
  );
}
