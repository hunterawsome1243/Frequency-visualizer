import { type Permission, PermissionsAndroid, Platform } from 'react-native';
import type { BleError, BleManager, Device, ScanOptions, State, Subscription } from 'react-native-ble-plx';

import type { Advertisement, ScanStatus } from './types';

export interface ScannerListener {
  onAdvertisement(ad: Advertisement): void;
  onStatus(status: ScanStatus, message?: string): void;
}

export type PermissionResult = 'granted' | 'denied' | 'blocked';

/** Thin wrapper around the BLE library so the hook and tests can use a fake. */
export interface Scanner {
  /** Asks for the runtime permissions the platform needs (Android 12+: BLUETOOTH_SCAN/CONNECT plus fine and coarse location; older Android: fine and coarse location; iOS: handled by the system on first scan). */
  requestPermissions(): Promise<PermissionResult>;
  /** Starts scanning, reporting every advertisement (duplicates allowed so RSSI stays live) and status changes. */
  start(listener: ScannerListener): void;
  stop(): void;
  /** Releases the native manager. The scanner must not be used afterwards. */
  destroy(): void;
}

export const DEV_BUILD_NEEDED_MESSAGE =
  'Bluetooth scanning needs a development build of this app. Expo Go cannot scan.';
export const WEB_UNSUPPORTED_MESSAGE =
  "Web browsers can't scan for nearby Bluetooth devices. Open the app on your phone to scan.";
export const BLUETOOTH_OFF_MESSAGE = 'Turn on Bluetooth to scan.';
export const BLUETOOTH_UNAUTHORIZED_MESSAGE =
  'Bluetooth access is turned off for this app. You can allow it in Settings.';
export const BLE_NOT_AVAILABLE_MESSAGE = "This phone doesn't support Bluetooth Low Energy scanning.";
export const LOCATION_OFF_MESSAGE =
  'Turn on Location in your phone settings. Android needs it to scan for Bluetooth devices.';
export const SCAN_START_FAILED_MESSAGE =
  "Couldn't start the Bluetooth scan. Wait a few seconds and try again.";
export const BLUETOOTH_RESETTING_MESSAGE = 'Bluetooth is restarting. Try again in a moment.';
export const SCAN_FAILED_MESSAGE = 'Something went wrong while scanning. Try again.';
export const SCANNER_CLOSED_MESSAGE =
  'The Bluetooth scanner was closed. Close and reopen the app to scan again.';

type BlePlx = typeof import('react-native-ble-plx');

/** The Device fields the app keeps; a plain object with these fields works too. */
export type DeviceAdvertisementFields = Pick<
  Device,
  | 'id'
  | 'name'
  | 'localName'
  | 'rssi'
  | 'manufacturerData'
  | 'serviceUUIDs'
  | 'serviceData'
  | 'txPowerLevel'
  | 'isConnectable'
>;

/** Copies the advertisement fields of a scanned Device, turning anything missing into null. */
export function deviceToAdvertisement(device: DeviceAdvertisementFields): Advertisement {
  return {
    id: device.id,
    name: device.name ?? null,
    localName: device.localName ?? null,
    rssi: device.rssi ?? null,
    manufacturerData: device.manufacturerData ?? null,
    serviceUUIDs: device.serviceUUIDs ?? null,
    serviceData: device.serviceData ?? null,
    txPowerLevel: device.txPowerLevel ?? null,
    isConnectable: device.isConnectable ?? null,
  };
}

/** Combines the answers to several permission requests: one "never ask again" blocks, one denial denies. */
export function combinePermissionResults(results: readonly (string | undefined)[]): PermissionResult {
  if (results.some((result) => result === 'never_ask_again')) return 'blocked';
  return results.every((result) => result === 'granted') ? 'granted' : 'denied';
}

/**
 * Android 12+ (API 31) needs BLUETOOTH_SCAN and BLUETOOTH_CONNECT, plus fine location because the
 * manifest does not claim neverForLocation (some beacons and trackers are only reported with it).
 * Older Android needs fine location for any BLE scan. Fine location is always asked for together
 * with coarse location: Android 12+ may ignore a request for fine location on its own. All of them
 * must be granted, so choosing "Approximate" location counts as a denial. iOS asks on the first scan
 * by itself and reports a refusal through the Bluetooth state, so this resolves "granted" there.
 */
export async function requestBlePermissions(): Promise<PermissionResult> {
  if (Platform.OS !== 'android') return 'granted';

  const { PERMISSIONS } = PermissionsAndroid;
  const location: Permission[] = [PERMISSIONS.ACCESS_FINE_LOCATION, PERMISSIONS.ACCESS_COARSE_LOCATION];
  const permissions: Permission[] =
    Platform.Version >= 31 ? [PERMISSIONS.BLUETOOTH_SCAN, PERMISSIONS.BLUETOOTH_CONNECT, ...location] : location;

  try {
    const results: Partial<Record<Permission, string>> = await PermissionsAndroid.requestMultiple(permissions);
    return combinePermissionResults(permissions.map((permission) => results[permission]));
  } catch {
    return 'denied';
  }
}

/**
 * What Android calls the permissions requestBlePermissions needs, for messages such as "Allow Nearby
 * devices and precise Location". null on other platforms, where the system asks by itself.
 */
export function blePermissionNames(): string | null {
  if (Platform.OS !== 'android') return null;
  return Platform.Version >= 31 ? 'Nearby devices and precise Location' : 'Location';
}

/**
 * Android shows its permission prompts with no explanation from the app, so screens say before the
 * first scan what it will ask for. null on other platforms.
 */
export function blePermissionNote(): string | null {
  const names = blePermissionNames();
  return names === null ? null : `Android will ask you to allow ${names}. The app doesn't save your location.`;
}

function createUnsupportedScanner(message: string): Scanner {
  return {
    // Nothing to ask for: asking would show permission prompts for a scan that cannot run.
    requestPermissions: async () => 'granted',
    start(listener) {
      listener.onStatus('unsupported', message);
    },
    stop() {},
    destroy() {},
  };
}

function isExpoGo(): boolean {
  try {
    // isRunningInExpoGo is exact; Constants.executionEnvironment "storeClient" may also mean a dev-client build.
    const expo = require('expo') as typeof import('expo');
    return typeof expo.isRunningInExpoGo === 'function' && expo.isRunningInExpoGo();
  } catch {
    return false;
  }
}

function errorCodeOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('errorCode' in error)) return null;
  const { errorCode } = error as { errorCode: unknown };
  return typeof errorCode === 'number' ? errorCode : null;
}

function createRealScanner(ble: BlePlx, manager: BleManager): Scanner {
  const { BleErrorCode, ScanMode, State: BleState } = ble;
  // allowDuplicates is iOS only and scanMode is Android only; each platform ignores the other.
  const scanOptions: ScanOptions = { allowDuplicates: true, scanMode: ScanMode.LowLatency };

  let listener: ScannerListener | null = null;
  let stateSubscription: Subscription | null = null;
  let scanning = false;
  /** Bumped for every scan so late callbacks from an earlier scan are ignored. */
  let scanId = 0;
  let destroyed = false;

  function report(status: ScanStatus, message?: string) {
    listener?.onStatus(status, message);
  }

  function stopScan() {
    if (!scanning) return;
    scanning = false;
    // Also removes the library's scan listener, so a later scan does not report everything twice.
    manager.stopDeviceScan().catch(() => undefined);
  }

  function handleScanError(error: unknown) {
    const code = errorCodeOf(error);
    // The manager was destroyed on purpose; there is nothing to tell the user.
    if (code === BleErrorCode.BluetoothManagerDestroyed) return;
    // The library needs a fresh startDeviceScan after an error.
    stopScan();
    switch (code) {
      case BleErrorCode.BluetoothPoweredOff:
        report('bluetooth-off', BLUETOOTH_OFF_MESSAGE);
        return;
      case BleErrorCode.BluetoothUnauthorized:
        report('permission-denied', BLUETOOTH_UNAUTHORIZED_MESSAGE);
        return;
      case BleErrorCode.BluetoothUnsupported:
        report('unsupported', BLE_NOT_AVAILABLE_MESSAGE);
        return;
      case BleErrorCode.LocationServicesDisabled:
        report('error', LOCATION_OFF_MESSAGE);
        return;
      case BleErrorCode.ScanStartFailed:
        report('error', SCAN_START_FAILED_MESSAGE);
        return;
      case BleErrorCode.BluetoothResetting:
      case BleErrorCode.BluetoothInUnknownState:
        report('error', BLUETOOTH_RESETTING_MESSAGE);
        return;
      default:
        report('error', SCAN_FAILED_MESSAGE);
    }
  }

  function startScan() {
    if (scanning) {
      report('scanning');
      return;
    }
    scanning = true;
    scanId += 1;
    const id = scanId;
    const isCurrent = () => scanning && id === scanId && listener !== null;
    manager
      .startDeviceScan(null, scanOptions, (error: BleError | null, device: Device | null) => {
        if (!isCurrent()) return;
        if (error) {
          handleScanError(error);
          return;
        }
        if (device) listener?.onAdvertisement(deviceToAdvertisement(device));
      })
      .catch((error: unknown) => {
        if (isCurrent()) handleScanError(error);
      });
    report('scanning');
  }

  function handleState(state: State) {
    switch (state) {
      case BleState.PoweredOn:
        startScan();
        return;
      case BleState.PoweredOff:
        stopScan();
        report('bluetooth-off', BLUETOOTH_OFF_MESSAGE);
        return;
      case BleState.Unauthorized:
        stopScan();
        report('permission-denied', BLUETOOTH_UNAUTHORIZED_MESSAGE);
        return;
      case BleState.Unsupported:
        stopScan();
        report('unsupported', BLE_NOT_AVAILABLE_MESSAGE);
        return;
      default:
        // Unknown and Resetting are followed by another update; keep the current status until then.
        return;
    }
  }

  function stop() {
    stateSubscription?.remove();
    stateSubscription = null;
    stopScan();
    listener = null;
  }

  return {
    requestPermissions: requestBlePermissions,
    start(next) {
      if (destroyed) {
        next.onStatus('error', SCANNER_CLOSED_MESSAGE);
        return;
      }
      listener = next;
      // Re-subscribing makes the library report the current state to the new listener right away.
      stateSubscription?.remove();
      stateSubscription = manager.onStateChange(handleState, true);
    },
    stop,
    destroy() {
      if (destroyed) return;
      stop();
      destroyed = true;
      manager.destroy().catch(() => undefined);
    },
  };
}

/**
 * Real scanner backed by react-native-ble-plx. When the native module is missing (Expo Go, web, Jest)
 * it returns a scanner whose start() reports status "unsupported" with a message saying a development
 * build is needed, instead of crashing.
 */
export function createBleScanner(): Scanner {
  if (Platform.OS === 'web') return createUnsupportedScanner(WEB_UNSUPPORTED_MESSAGE);
  if (isExpoGo()) return createUnsupportedScanner(DEV_BUILD_NEEDED_MESSAGE);

  try {
    // Loaded here, not at the top, so Expo Go, web and Jest never load the native library by importing this file.
    const ble = require('react-native-ble-plx') as BlePlx;
    const manager = new ble.BleManager();
    return createRealScanner(ble, manager);
  } catch {
    return createUnsupportedScanner(DEV_BUILD_NEEDED_MESSAGE);
  }
}

/** Test double: records calls and lets tests push advertisements and statuses. */
export interface FakeScanner extends Scanner {
  emit(ad: Advertisement): void;
  emitStatus(status: ScanStatus, message?: string): void;
  permissionResult: PermissionResult;
  readonly started: boolean;
  readonly destroyed: boolean;
  /** How many times each method was called. */
  readonly calls: Readonly<Record<'requestPermissions' | 'start' | 'stop' | 'destroy', number>>;
}

/**
 * start() reports "scanning" straight away, as the real scanner does when Bluetooth is on.
 * emit() and emitStatus() reach the listener only between start() and stop(), like real scan results.
 */
export function createFakeScanner(permissionResult: PermissionResult = 'granted'): FakeScanner {
  let listener: ScannerListener | null = null;
  let destroyed = false;
  const calls = { requestPermissions: 0, start: 0, stop: 0, destroy: 0 };

  const fake: FakeScanner = {
    permissionResult,
    get started() {
      return listener !== null;
    },
    get destroyed() {
      return destroyed;
    },
    calls,
    async requestPermissions() {
      calls.requestPermissions += 1;
      return fake.permissionResult;
    },
    start(next) {
      calls.start += 1;
      if (destroyed) return;
      listener = next;
      next.onStatus('scanning');
    },
    stop() {
      calls.stop += 1;
      listener = null;
    },
    destroy() {
      calls.destroy += 1;
      listener = null;
      destroyed = true;
    },
    emit(ad) {
      listener?.onAdvertisement(ad);
    },
    emitStatus(status, message) {
      listener?.onStatus(status, message);
    },
  };
  return fake;
}
