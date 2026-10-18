import { PermissionsAndroid, Platform } from 'react-native';

import type { RawWifiEntry } from '@/lib/wifi';
import {
  isWifiScanSupported,
  scanWifi,
  WIFI_DEV_BUILD_MESSAGE,
  WIFI_IOS_MESSAGE,
  WIFI_LOCATION_OFF_MESSAGE,
  WIFI_PERMISSION_BLOCKED_MESSAGE,
  WIFI_PERMISSION_DENIED_MESSAGE,
  WIFI_SCAN_FAILED_MESSAGE,
  WIFI_WEB_MESSAGE,
} from '@/lib/wifi-scanner';

// The real conversion is tested in wifi.test.ts; here it only tags each entry so the tests can see what was passed.
jest.mock('@/lib/wifi', () => ({
  toWifiNetworks: jest.fn((entries: RawWifiEntry[]) =>
    entries.map((entry) => ({
      ssid: entry.SSID,
      bssid: entry.BSSID,
      level: entry.level,
      frequency: entry.frequency,
      channel: null,
      band: 'unknown',
      capabilities: entry.capabilities,
    })),
  ),
}));

jest.mock('react-native-wifi-reborn', () => ({
  __esModule: true,
  default: {
    reScanAndLoadWifiList: jest.fn(),
    loadWifiList: jest.fn(),
  },
}));

const wifiMock = jest.requireMock<{
  default: { reScanAndLoadWifiList: jest.Mock; loadWifiList: jest.Mock };
}>('react-native-wifi-reborn').default;

const ENTRY: RawWifiEntry = {
  SSID: 'Home',
  BSSID: '00:11:22:33:44:55',
  capabilities: '[WPA2-PSK-CCMP][ESS]',
  frequency: 2437,
  level: -48,
  timestamp: 1,
};

function nativeError(code: string) {
  return Object.assign(new Error(code), { code });
}

function setAndroid() {
  jest.replaceProperty(Platform, 'OS', 'android');
}

function mockPermission(alreadyGranted: boolean, answer: 'granted' | 'denied' | 'never_ask_again' = 'granted') {
  const check = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(alreadyGranted);
  const request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(answer);
  return { check, request };
}

beforeEach(() => {
  wifiMock.reScanAndLoadWifiList.mockReset();
  wifiMock.loadWifiList.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('where Wi-Fi scanning is not available', () => {
  test('iOS gets a short note and no scan', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(isWifiScanSupported()).toBe(false);
    await expect(scanWifi()).resolves.toEqual({ status: 'unsupported', message: WIFI_IOS_MESSAGE });
    expect(WIFI_IOS_MESSAGE).toBe("iOS doesn't let apps scan for Wi-Fi networks.");
    expect(wifiMock.reScanAndLoadWifiList).not.toHaveBeenCalled();
  });

  test('web says browsers cannot scan', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    expect(isWifiScanSupported()).toBe(false);
    await expect(scanWifi()).resolves.toEqual({ status: 'unsupported', message: WIFI_WEB_MESSAGE });
  });

  test('Android without the native module (Expo Go) asks for a development build', async () => {
    setAndroid();
    const library = jest.requireMock<{ default: unknown }>('react-native-wifi-reborn');
    const original = library.default;
    library.default = undefined;
    try {
      expect(isWifiScanSupported()).toBe(false);
      await expect(scanWifi()).resolves.toEqual({ status: 'unsupported', message: WIFI_DEV_BUILD_MESSAGE });
    } finally {
      library.default = original;
    }
  });
});

describe('on Android', () => {
  beforeEach(() => {
    setAndroid();
  });

  test('is supported when the native module is there', () => {
    expect(isWifiScanSupported()).toBe(true);
  });

  test('skips the prompt when location is already allowed and returns the fresh scan', async () => {
    const { request } = mockPermission(true);
    wifiMock.reScanAndLoadWifiList.mockResolvedValue([ENTRY]);

    const result = await scanWifi();

    expect(request).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'ok',
      networks: [expect.objectContaining({ ssid: 'Home', bssid: '00:11:22:33:44:55', level: -48 })],
    });
    expect(wifiMock.loadWifiList).not.toHaveBeenCalled();
  });

  test('asks for fine location when needed', async () => {
    const { request } = mockPermission(false, 'granted');
    wifiMock.reScanAndLoadWifiList.mockResolvedValue([]);

    await expect(scanWifi()).resolves.toEqual({ status: 'ok', networks: [] });
    expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, expect.any(Object));
  });

  test('a denied permission explains why it is needed and does not scan', async () => {
    mockPermission(false, 'denied');
    await expect(scanWifi()).resolves.toEqual({
      status: 'permission-denied',
      message: WIFI_PERMISSION_DENIED_MESSAGE,
    });
    expect(wifiMock.reScanAndLoadWifiList).not.toHaveBeenCalled();
  });

  test('a blocked permission points to Settings', async () => {
    mockPermission(false, 'never_ask_again');
    await expect(scanWifi()).resolves.toEqual({
      status: 'permission-denied',
      message: WIFI_PERMISSION_BLOCKED_MESSAGE,
    });
  });

  test('a throttled scan falls back to the cached list', async () => {
    mockPermission(true);
    wifiMock.reScanAndLoadWifiList.mockResolvedValue(
      "Starting Android 9, it's only allowed to scan 4 times per 2 minuts in a foreground app.",
    );
    wifiMock.loadWifiList.mockResolvedValue([ENTRY]);

    await expect(scanWifi()).resolves.toEqual({
      status: 'ok',
      networks: [expect.objectContaining({ ssid: 'Home' })],
      cached: true,
    });
  });

  test('a failed scan falls back to the cached list', async () => {
    mockPermission(true);
    wifiMock.reScanAndLoadWifiList.mockRejectedValue(nativeError('exception'));
    wifiMock.loadWifiList.mockResolvedValue([ENTRY]);

    const result = await scanWifi();
    expect(result.status).toBe('ok');
    expect(wifiMock.loadWifiList).toHaveBeenCalledTimes(1);
  });

  test('Location turned off asks the user to turn it on', async () => {
    mockPermission(true);
    wifiMock.reScanAndLoadWifiList.mockRejectedValue(nativeError('locationServicesOff'));

    await expect(scanWifi()).resolves.toEqual({ status: 'error', message: WIFI_LOCATION_OFF_MESSAGE });
    expect(WIFI_LOCATION_OFF_MESSAGE).toMatch(/turn on location/i);
    expect(wifiMock.loadWifiList).not.toHaveBeenCalled();
  });

  test('a missing permission reported by the library gives permission-denied', async () => {
    mockPermission(true);
    wifiMock.reScanAndLoadWifiList.mockRejectedValue(nativeError('locationPermissionMissing'));
    await expect(scanWifi()).resolves.toEqual({
      status: 'permission-denied',
      message: WIFI_PERMISSION_DENIED_MESSAGE,
    });
  });

  test('reports an error when the cached list fails too', async () => {
    mockPermission(true);
    wifiMock.reScanAndLoadWifiList.mockRejectedValue(nativeError('exception'));
    wifiMock.loadWifiList.mockRejectedValue(nativeError('exception'));
    await expect(scanWifi()).resolves.toEqual({ status: 'error', message: WIFI_SCAN_FAILED_MESSAGE });
  });

  test('reports an error when the cached list is not a list', async () => {
    mockPermission(true);
    wifiMock.reScanAndLoadWifiList.mockResolvedValue('throttled');
    wifiMock.loadWifiList.mockResolvedValue(null);
    await expect(scanWifi()).resolves.toEqual({ status: 'error', message: WIFI_SCAN_FAILED_MESSAGE });
  });

  test('drops entries that are not objects', async () => {
    mockPermission(true);
    wifiMock.reScanAndLoadWifiList.mockResolvedValue([ENTRY, null, 'junk']);
    const result = await scanWifi();
    expect(result.status === 'ok' && result.networks).toHaveLength(1);
  });

  test('a failing permission request counts as denied', async () => {
    jest.spyOn(PermissionsAndroid, 'check').mockRejectedValue(new Error('no activity'));
    await expect(scanWifi()).resolves.toEqual({
      status: 'permission-denied',
      message: WIFI_PERMISSION_DENIED_MESSAGE,
    });
  });
});
