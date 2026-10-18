import { PermissionsAndroid, Platform } from 'react-native';

import type { WifiNetwork } from './types';
import { type RawWifiEntry, toWifiNetworks } from './wifi';

export type WifiScanResult =
  /** cached is true when Android refused a fresh scan and these are the last results it had. */
  | { status: 'ok'; networks: WifiNetwork[]; cached?: boolean }
  | { status: 'unsupported'; message: string }
  | { status: 'permission-denied'; message: string }
  | { status: 'error'; message: string };

export const WIFI_IOS_MESSAGE = "iOS doesn't let apps scan for Wi-Fi networks.";
export const WIFI_WEB_MESSAGE = "Web browsers can't scan for Wi-Fi networks. Open the app on an Android phone.";
export const WIFI_DEV_BUILD_MESSAGE =
  'Wi-Fi scanning needs a development build of this app. Expo Go cannot scan.';
export const WIFI_PERMISSION_DENIED_MESSAGE =
  'Location permission is needed to see nearby Wi-Fi networks. Android asks for it before any Wi-Fi scan.';
export const WIFI_PERMISSION_BLOCKED_MESSAGE =
  'Location permission is turned off for this app. Turn it on in Settings to see nearby Wi-Fi networks.';
export const WIFI_LOCATION_OFF_MESSAGE =
  'Turn on Location in your phone settings to scan for Wi-Fi networks. Android needs it for Wi-Fi scans.';
export const WIFI_SCAN_FAILED_MESSAGE = "Couldn't scan for Wi-Fi networks. Try again in a minute.";

type WifiModule = (typeof import('react-native-wifi-reborn'))['default'];

/** Loaded here, not at the top: the library is not linked on iOS and its native module is missing in Expo Go. */
function loadWifiModule(): WifiModule | null {
  if (Platform.OS !== 'android') return null;
  try {
    const wifi = (require('react-native-wifi-reborn') as typeof import('react-native-wifi-reborn')).default;
    return wifi ?? null;
  } catch {
    return null;
  }
}

/** True only on Android with the native module present. */
export function isWifiScanSupported(): boolean {
  return loadWifiModule() !== null;
}

type LocationPermission = 'granted' | 'denied' | 'blocked';

async function requestLocationPermission(): Promise<LocationPermission> {
  const permission = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
  try {
    if (await PermissionsAndroid.check(permission)) return 'granted';
    const result = await PermissionsAndroid.request(permission, {
      title: 'Allow location for Wi-Fi scans',
      message:
        "Android only shows nearby Wi-Fi networks to apps with location permission. This app doesn't save your location, and nothing leaves your phone.",
      buttonPositive: 'OK',
    });
    if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
    return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
  } catch {
    return 'denied';
  }
}

function errorCodeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const { code } = error as { code: unknown };
  return typeof code === 'string' ? code : null;
}

function resultForError(error: unknown): WifiScanResult {
  switch (errorCodeOf(error)) {
    case 'locationServicesOff':
      return { status: 'error', message: WIFI_LOCATION_OFF_MESSAGE };
    case 'locationPermissionMissing':
      return { status: 'permission-denied', message: WIFI_PERMISSION_DENIED_MESSAGE };
    default:
      return { status: 'error', message: WIFI_SCAN_FAILED_MESSAGE };
  }
}

function isRawEntry(entry: unknown): entry is RawWifiEntry {
  return typeof entry === 'object' && entry !== null;
}

/** Android only: asks for fine location if needed, then scans and returns the networks strongest first. */
export async function scanWifi(): Promise<WifiScanResult> {
  if (Platform.OS === 'web') return { status: 'unsupported', message: WIFI_WEB_MESSAGE };
  if (Platform.OS !== 'android') return { status: 'unsupported', message: WIFI_IOS_MESSAGE };

  const wifi = loadWifiModule();
  if (!wifi) return { status: 'unsupported', message: WIFI_DEV_BUILD_MESSAGE };

  const permission = await requestLocationPermission();
  if (permission === 'blocked') return { status: 'permission-denied', message: WIFI_PERMISSION_BLOCKED_MESSAGE };
  if (permission === 'denied') return { status: 'permission-denied', message: WIFI_PERMISSION_DENIED_MESSAGE };

  let entries: unknown = null;
  let scanError: unknown = null;
  try {
    // When Android throttles scans (about 4 per 2 minutes) this resolves with a message string, not a list.
    entries = await wifi.reScanAndLoadWifiList();
  } catch (error) {
    scanError = error;
  }
  if (Array.isArray(entries)) return { status: 'ok', networks: toWifiNetworks(entries.filter(isRawEntry)) };

  // Location being off or permission missing fails the cached list the same way, so report it now.
  const code = errorCodeOf(scanError);
  if (code === 'locationServicesOff' || code === 'locationPermissionMissing') return resultForError(scanError);

  try {
    const cached: unknown = await wifi.loadWifiList();
    if (Array.isArray(cached)) {
      return { status: 'ok', networks: toWifiNetworks(cached.filter(isRawEntry)), cached: true };
    }
  } catch (error) {
    return resultForError(error);
  }
  return { status: 'error', message: WIFI_SCAN_FAILED_MESSAGE };
}
