import { PermissionsAndroid, Platform } from 'react-native';

import {
  BLE_NOT_AVAILABLE_MESSAGE,
  BLUETOOTH_OFF_MESSAGE,
  BLUETOOTH_UNAUTHORIZED_MESSAGE,
  combinePermissionResults,
  createBleScanner,
  createFakeScanner,
  DEV_BUILD_NEEDED_MESSAGE,
  deviceToAdvertisement,
  LOCATION_OFF_MESSAGE,
  requestBlePermissions,
  SCAN_FAILED_MESSAGE,
  type ScannerListener,
  WEB_UNSUPPORTED_MESSAGE,
} from '@/lib/scanner';
import type { Advertisement } from '@/lib/types';

type StateListener = (state: string) => void;
type ScanCallback = (error: unknown, device: unknown) => void;

interface MockManager {
  onStateChange: jest.Mock;
  startDeviceScan: jest.Mock;
  stopDeviceScan: jest.Mock;
  destroy: jest.Mock;
  removeStateSubscription: jest.Mock;
  stateListener: StateListener | null;
  scanCallback: ScanCallback | null;
}

const mockManagers: MockManager[] = [];

function mockCreateManager(): MockManager {
  const manager: MockManager = {
    stateListener: null,
    scanCallback: null,
    removeStateSubscription: jest.fn(),
    onStateChange: jest.fn((listener: StateListener) => {
      manager.stateListener = listener;
      return { remove: manager.removeStateSubscription };
    }),
    startDeviceScan: jest.fn((_uuids: unknown, _options: unknown, callback: ScanCallback) => {
      manager.scanCallback = callback;
      return Promise.resolve();
    }),
    stopDeviceScan: jest.fn(() => Promise.resolve()),
    destroy: jest.fn(() => Promise.resolve()),
  };
  mockManagers.push(manager);
  return manager;
}

jest.mock('expo', () => ({ isRunningInExpoGo: jest.fn(() => false) }));

jest.mock('react-native-ble-plx', () => ({
  State: {
    Unknown: 'Unknown',
    Resetting: 'Resetting',
    Unsupported: 'Unsupported',
    Unauthorized: 'Unauthorized',
    PoweredOff: 'PoweredOff',
    PoweredOn: 'PoweredOn',
  },
  ScanMode: { Opportunistic: -1, LowPower: 0, Balanced: 1, LowLatency: 2 },
  BleErrorCode: {
    UnknownError: 0,
    BluetoothManagerDestroyed: 1,
    BluetoothUnsupported: 100,
    BluetoothUnauthorized: 101,
    BluetoothPoweredOff: 102,
    BluetoothInUnknownState: 103,
    BluetoothResetting: 104,
    ScanStartFailed: 600,
    LocationServicesDisabled: 601,
  },
  BleManager: jest.fn(() => mockCreateManager()),
}));

const expoMock = jest.requireMock<{ isRunningInExpoGo: jest.Mock }>('expo');
const bleMock = jest.requireMock<{ BleManager: jest.Mock }>('react-native-ble-plx');

function recordingListener() {
  const statuses: { status: string; message?: string }[] = [];
  const ads: Advertisement[] = [];
  const listener: ScannerListener = {
    onAdvertisement: (ad) => ads.push(ad),
    onStatus: (status, message) => statuses.push(message === undefined ? { status } : { status, message }),
  };
  return { listener, statuses, ads };
}

function setPlatform(os: 'ios' | 'android' | 'web', version?: number) {
  jest.replaceProperty(Platform, 'OS', os);
  if (version !== undefined) {
    jest.spyOn(Platform as { Version: number }, 'Version', 'get').mockReturnValue(version);
  }
}

const flushPromises = () => new Promise<void>((resolve) => setImmediate(resolve));

const AD: Advertisement = {
  id: 'AA:BB',
  name: 'Headphones',
  localName: null,
  rssi: -60,
  manufacturerData: null,
  serviceUUIDs: null,
  serviceData: null,
  txPowerLevel: null,
  isConnectable: true,
};

beforeEach(() => {
  mockManagers.length = 0;
  expoMock.isRunningInExpoGo.mockReturnValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('createFakeScanner', () => {
  test('reports the permission result it was given and counts the calls', async () => {
    const fake = createFakeScanner('blocked');
    await expect(fake.requestPermissions()).resolves.toBe('blocked');
    fake.permissionResult = 'granted';
    await expect(fake.requestPermissions()).resolves.toBe('granted');
    expect(fake.calls.requestPermissions).toBe(2);
  });

  test('defaults to granted', async () => {
    await expect(createFakeScanner().requestPermissions()).resolves.toBe('granted');
  });

  test('reports scanning on start and passes on advertisements and statuses until stopped', () => {
    const fake = createFakeScanner();
    const { listener, statuses, ads } = recordingListener();

    fake.emit(AD);
    expect(ads).toHaveLength(0);

    fake.start(listener);
    expect(fake.started).toBe(true);
    expect(statuses).toEqual([{ status: 'scanning' }]);

    fake.emit(AD);
    fake.emitStatus('bluetooth-off', 'Turn on Bluetooth to scan.');
    expect(ads).toEqual([AD]);
    expect(statuses[1]).toEqual({ status: 'bluetooth-off', message: 'Turn on Bluetooth to scan.' });

    fake.stop();
    expect(fake.started).toBe(false);
    fake.emit(AD);
    expect(ads).toHaveLength(1);
    expect(fake.calls).toEqual({ requestPermissions: 0, start: 1, stop: 1, destroy: 0 });
  });

  test('ignores start after destroy', () => {
    const fake = createFakeScanner();
    const { listener, statuses } = recordingListener();
    fake.destroy();
    fake.start(listener);
    expect(fake.destroyed).toBe(true);
    expect(fake.started).toBe(false);
    expect(statuses).toEqual([]);
  });
});

describe('createBleScanner when scanning is not possible', () => {
  test('in Expo Go it reports unsupported with a development build message and never loads the manager', async () => {
    expoMock.isRunningInExpoGo.mockReturnValue(true);
    const scanner = createBleScanner();
    const { listener, statuses } = recordingListener();

    await expect(scanner.requestPermissions()).resolves.toBe('granted');
    scanner.start(listener);

    expect(statuses).toEqual([{ status: 'unsupported', message: DEV_BUILD_NEEDED_MESSAGE }]);
    expect(DEV_BUILD_NEEDED_MESSAGE).toBe(
      'Bluetooth scanning needs a development build of this app. Expo Go cannot scan.',
    );
    expect(bleMock.BleManager).not.toHaveBeenCalled();
    expect(() => {
      scanner.stop();
      scanner.destroy();
    }).not.toThrow();
  });

  test('on web it says browsers cannot scan', () => {
    setPlatform('web');
    const { listener, statuses } = recordingListener();
    createBleScanner().start(listener);
    expect(statuses).toEqual([{ status: 'unsupported', message: WEB_UNSUPPORTED_MESSAGE }]);
    expect(bleMock.BleManager).not.toHaveBeenCalled();
  });

  test('reports unsupported when the native manager cannot be created', () => {
    bleMock.BleManager.mockImplementationOnce(() => {
      throw new Error('BlePlx native module is missing');
    });
    const { listener, statuses } = recordingListener();
    createBleScanner().start(listener);
    expect(statuses).toEqual([{ status: 'unsupported', message: DEV_BUILD_NEEDED_MESSAGE }]);
  });
});

describe('createBleScanner with the native library', () => {
  function startScanner() {
    const scanner = createBleScanner();
    const manager = mockManagers[0];
    const recording = recordingListener();
    scanner.start(recording.listener);
    return { scanner, manager, ...recording };
  }

  test('subscribes to the Bluetooth state and scans with duplicates and low latency once it is on', () => {
    const { manager, statuses } = startScanner();
    expect(manager.onStateChange).toHaveBeenCalledWith(expect.any(Function), true);
    expect(manager.startDeviceScan).not.toHaveBeenCalled();

    manager.stateListener?.('PoweredOn');
    expect(manager.startDeviceScan).toHaveBeenCalledWith(
      null,
      { allowDuplicates: true, scanMode: 2 },
      expect.any(Function),
    );
    expect(statuses).toEqual([{ status: 'scanning' }]);
  });

  test('maps scanned devices to advertisements', () => {
    const { manager, ads } = startScanner();
    manager.stateListener?.('PoweredOn');
    manager.scanCallback?.(null, {
      id: 'AA:BB',
      name: 'Headphones',
      localName: undefined,
      rssi: -60,
      mtu: 23,
      manufacturerData: 'TAAS',
      rawScanRecord: 'AAAA',
      serviceUUIDs: ['180f'],
      serviceData: { '180f': 'ZA==' },
      txPowerLevel: null,
      isConnectable: true,
    });
    expect(ads).toEqual([
      {
        id: 'AA:BB',
        name: 'Headphones',
        localName: null,
        rssi: -60,
        manufacturerData: 'TAAS',
        serviceUUIDs: ['180f'],
        serviceData: { '180f': 'ZA==' },
        txPowerLevel: null,
        isConnectable: true,
      },
    ]);
  });

  test('reports Bluetooth off, unauthorized and unsupported states', () => {
    const { manager, statuses } = startScanner();
    manager.stateListener?.('Unknown');
    manager.stateListener?.('PoweredOff');
    manager.stateListener?.('Unauthorized');
    manager.stateListener?.('Unsupported');
    expect(statuses).toEqual([
      { status: 'bluetooth-off', message: BLUETOOTH_OFF_MESSAGE },
      { status: 'permission-denied', message: BLUETOOTH_UNAUTHORIZED_MESSAGE },
      { status: 'unsupported', message: BLE_NOT_AVAILABLE_MESSAGE },
    ]);
    expect(BLUETOOTH_OFF_MESSAGE).toBe('Turn on Bluetooth to scan.');
  });

  test('stops the scan when Bluetooth turns off and scans again when it comes back', () => {
    const { manager, statuses } = startScanner();
    manager.stateListener?.('PoweredOn');
    manager.stateListener?.('PoweredOff');
    expect(manager.stopDeviceScan).toHaveBeenCalledTimes(1);
    manager.stateListener?.('PoweredOn');
    expect(manager.startDeviceScan).toHaveBeenCalledTimes(2);
    expect(statuses.map((entry) => entry.status)).toEqual(['scanning', 'bluetooth-off', 'scanning']);
  });

  test('maps scan errors to statuses with friendly messages and stops the failed scan', () => {
    const { manager, statuses } = startScanner();
    manager.stateListener?.('PoweredOn');
    manager.scanCallback?.({ errorCode: 601, message: 'Location services are disabled' }, null);
    expect(statuses[1]).toEqual({ status: 'error', message: LOCATION_OFF_MESSAGE });
    expect(manager.stopDeviceScan).toHaveBeenCalledTimes(1);

    manager.stateListener?.('PoweredOn');
    manager.scanCallback?.({ errorCode: 102 }, null);
    manager.stateListener?.('PoweredOn');
    manager.scanCallback?.({ errorCode: 999 }, null);
    expect(statuses.slice(2)).toEqual([
      { status: 'scanning' },
      { status: 'bluetooth-off', message: BLUETOOTH_OFF_MESSAGE },
      { status: 'scanning' },
      { status: 'error', message: SCAN_FAILED_MESSAGE },
    ]);
  });

  test('reports a rejected scan start as an error', async () => {
    const { manager, statuses } = startScanner();
    manager.startDeviceScan.mockImplementationOnce(() => Promise.reject({ errorCode: 101 }));
    manager.stateListener?.('PoweredOn');
    await flushPromises();
    expect(statuses).toEqual([
      { status: 'scanning' },
      { status: 'permission-denied', message: BLUETOOTH_UNAUTHORIZED_MESSAGE },
    ]);
  });

  test('ignores the error a destroyed manager reports', () => {
    const { manager, statuses } = startScanner();
    manager.stateListener?.('PoweredOn');
    manager.scanCallback?.({ errorCode: 1 }, null);
    expect(statuses).toEqual([{ status: 'scanning' }]);
  });

  test('stop() stops scanning and drops the state subscription; late results are ignored', () => {
    const { scanner, manager, ads, statuses } = startScanner();
    manager.stateListener?.('PoweredOn');
    scanner.stop();
    expect(manager.stopDeviceScan).toHaveBeenCalledTimes(1);
    expect(manager.removeStateSubscription).toHaveBeenCalledTimes(1);

    manager.scanCallback?.(null, { ...AD });
    expect(ads).toHaveLength(0);
    expect(statuses).toHaveLength(1);
    expect(manager.destroy).not.toHaveBeenCalled();
  });

  test('destroy() also destroys the manager, once', () => {
    const { scanner, manager } = startScanner();
    manager.stateListener?.('PoweredOn');
    scanner.destroy();
    scanner.destroy();
    expect(manager.stopDeviceScan).toHaveBeenCalledTimes(1);
    expect(manager.destroy).toHaveBeenCalledTimes(1);
  });

  test('start() after destroy() reports an error instead of using the manager', () => {
    const scanner = createBleScanner();
    const manager = mockManagers[0];
    scanner.destroy();
    const { listener, statuses } = recordingListener();
    scanner.start(listener);
    expect(manager.onStateChange).not.toHaveBeenCalled();
    expect(statuses[0].status).toBe('error');
  });
});

describe('deviceToAdvertisement', () => {
  test('turns missing fields into null', () => {
    expect(
      deviceToAdvertisement({
        id: 'x',
        name: null,
        localName: null,
        rssi: null,
        manufacturerData: null,
        serviceUUIDs: null,
        serviceData: null,
        txPowerLevel: null,
        isConnectable: null,
      }),
    ).toEqual({
      id: 'x',
      name: null,
      localName: null,
      rssi: null,
      manufacturerData: null,
      serviceUUIDs: null,
      serviceData: null,
      txPowerLevel: null,
      isConnectable: null,
    });
  });
});

describe('requestBlePermissions', () => {
  const { BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION } = PermissionsAndroid.PERMISSIONS;

  function mockRequestMultiple(results: Record<string, string>) {
    return jest
      .spyOn(PermissionsAndroid, 'requestMultiple')
      .mockResolvedValue(results as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>);
  }

  test('on iOS resolves granted without asking (the system asks on the first scan)', async () => {
    setPlatform('ios');
    const spy = mockRequestMultiple({});
    await expect(requestBlePermissions()).resolves.toBe('granted');
    expect(spy).not.toHaveBeenCalled();
  });

  test('on Android 12+ asks for scan, connect and fine location', async () => {
    setPlatform('android', 31);
    const spy = mockRequestMultiple({
      [BLUETOOTH_SCAN]: 'granted',
      [BLUETOOTH_CONNECT]: 'granted',
      [ACCESS_FINE_LOCATION]: 'granted',
    });
    await expect(requestBlePermissions()).resolves.toBe('granted');
    expect(spy).toHaveBeenCalledWith([BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION]);
  });

  test('on Android before 12 asks for fine location only', async () => {
    setPlatform('android', 30);
    const spy = mockRequestMultiple({ [ACCESS_FINE_LOCATION]: 'granted' });
    await expect(requestBlePermissions()).resolves.toBe('granted');
    expect(spy).toHaveBeenCalledWith([ACCESS_FINE_LOCATION]);
  });

  test('any denial gives denied', async () => {
    setPlatform('android', 33);
    mockRequestMultiple({
      [BLUETOOTH_SCAN]: 'granted',
      [BLUETOOTH_CONNECT]: 'granted',
      [ACCESS_FINE_LOCATION]: 'denied',
    });
    await expect(requestBlePermissions()).resolves.toBe('denied');
  });

  test('any "never ask again" gives blocked, even next to a denial', async () => {
    setPlatform('android', 33);
    mockRequestMultiple({
      [BLUETOOTH_SCAN]: 'denied',
      [BLUETOOTH_CONNECT]: 'never_ask_again',
      [ACCESS_FINE_LOCATION]: 'granted',
    });
    await expect(requestBlePermissions()).resolves.toBe('blocked');
  });

  test('a missing answer or a failed request gives denied', async () => {
    setPlatform('android', 30);
    mockRequestMultiple({});
    await expect(requestBlePermissions()).resolves.toBe('denied');

    jest.spyOn(PermissionsAndroid, 'requestMultiple').mockRejectedValue(new Error('no activity'));
    await expect(requestBlePermissions()).resolves.toBe('denied');
  });

  test('the real scanner uses it', async () => {
    setPlatform('android', 31);
    mockRequestMultiple({
      [BLUETOOTH_SCAN]: 'granted',
      [BLUETOOTH_CONNECT]: 'never_ask_again',
      [ACCESS_FINE_LOCATION]: 'granted',
    });
    await expect(createBleScanner().requestPermissions()).resolves.toBe('blocked');
  });
});

describe('combinePermissionResults', () => {
  test('needs every answer to be granted', () => {
    expect(combinePermissionResults(['granted', 'granted'])).toBe('granted');
    expect(combinePermissionResults(['granted', undefined])).toBe('denied');
    expect(combinePermissionResults(['denied', 'never_ask_again'])).toBe('blocked');
  });
});
