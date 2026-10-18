import { act, renderHook } from '@testing-library/react-native';

import {
  type BleScanOptions,
  PERMISSION_BLOCKED_MESSAGE,
  PERMISSION_DENIED_MESSAGE,
  START_FAILED_MESSAGE,
  useBleScan,
} from '@/hooks/use-ble-scan';
import { type DeviceMap, pruneStale } from '@/lib/device-list';
import { createBleScanner, createFakeScanner, type FakeScanner, type Scanner } from '@/lib/scanner';
import type { Advertisement, ScannedDevice } from '@/lib/types';

// device-list has its own tests; a small stand-in keeps these tests about the hook.
jest.mock('@/lib/device-list', () => ({
  DEFAULT_STALE_MS: 30_000,
  upsertAdvertisement: jest.fn((devices: DeviceMap, ad: Advertisement, now: number): DeviceMap => {
    const previous = devices[ad.id] as ScannedDevice | undefined;
    const device: ScannedDevice = {
      id: ad.id,
      name: ad.localName ?? ad.name ?? previous?.name ?? null,
      rssi: ad.rssi,
      firstSeen: previous?.firstSeen ?? now,
      lastSeen: now,
      rssiHistory: [],
      advertisement: ad,
      tracker: null,
    };
    return { ...devices, [ad.id]: device };
  }),
  pruneStale: jest.fn((devices: DeviceMap, now: number, maxAgeMs: number): DeviceMap => {
    const kept = Object.values(devices).filter((device) => device.lastSeen >= now - maxAgeMs);
    return kept.length === Object.keys(devices).length
      ? devices
      : Object.fromEntries(kept.map((device) => [device.id, device]));
  }),
}));

jest.mock('@/lib/scanner', () => {
  const actual = jest.requireActual<typeof import('@/lib/scanner')>('@/lib/scanner');
  return { ...actual, createBleScanner: jest.fn() };
});

const createBleScannerMock = createBleScanner as jest.MockedFunction<typeof createBleScanner>;
const pruneStaleMock = pruneStale as jest.MockedFunction<typeof pruneStale>;

function ad(id: string, rssi = -60, name: string | null = null): Advertisement {
  return {
    id,
    name,
    localName: null,
    rssi,
    manufacturerData: null,
    serviceUUIDs: null,
    serviceData: null,
    txPowerLevel: null,
    isConnectable: null,
  };
}

let clock = 0;
const now = () => clock;

async function renderScan(scanner?: Scanner, options: BleScanOptions = {}) {
  return renderHook(() => useBleScan(scanner, { now, ...options }));
}

async function advance(ms: number) {
  await act(async () => {
    clock += ms;
    jest.advanceTimersByTime(ms);
  });
}

async function emit(fake: FakeScanner, ...ads: Advertisement[]) {
  await act(async () => {
    for (const each of ads) fake.emit(each);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  clock = 1_000;
  createBleScannerMock.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

test('starts idle with no devices', async () => {
  const { result } = await renderScan(createFakeScanner());
  expect(result.current.status).toBe('idle');
  expect(result.current.message).toBeNull();
  expect(result.current.devices).toEqual([]);
  expect(result.current.isScanning).toBe(false);
});

test('start() asks for permission, then scans', async () => {
  const fake = createFakeScanner();
  const { result } = await renderScan(fake);

  await act(() => result.current.start());

  expect(fake.calls.requestPermissions).toBe(1);
  expect(fake.started).toBe(true);
  expect(result.current.status).toBe('scanning');
  expect(result.current.isScanning).toBe(true);
});

test('shows requesting-permission while the permission prompt is open', async () => {
  const fake = createFakeScanner();
  let answer: (result: 'granted') => void = () => undefined;
  fake.requestPermissions = () => new Promise((resolve) => (answer = resolve));
  const { result } = await renderScan(fake);

  let pending: Promise<void> = Promise.resolve();
  await act(async () => {
    pending = result.current.start();
  });
  expect(result.current.status).toBe('requesting-permission');
  expect(fake.started).toBe(false);

  await act(async () => {
    answer('granted');
    await pending;
  });
  expect(result.current.status).toBe('scanning');
});

test('publishes advertisements on the interval, not one by one', async () => {
  const fake = createFakeScanner();
  const { result } = await renderScan(fake);
  await act(() => result.current.start());

  await emit(fake, ad('a', -50), ad('b', -70), ad('a', -55));
  expect(result.current.devices).toEqual([]);

  await advance(499);
  expect(result.current.devices).toEqual([]);

  await advance(1);
  expect(result.current.devices.map((device) => [device.id, device.rssi])).toEqual([
    ['a', -55],
    ['b', -70],
  ]);
});

test('uses a custom update interval', async () => {
  const fake = createFakeScanner();
  const { result } = await renderScan(fake, { updateIntervalMs: 100 });
  await act(() => result.current.start());
  await emit(fake, ad('a'));
  await advance(100);
  expect(result.current.devices).toHaveLength(1);
});

test('does not re-render on a tick when nothing changed', async () => {
  const fake = createFakeScanner();
  const { result } = await renderScan(fake);
  await act(() => result.current.start());
  await emit(fake, ad('a'));
  await advance(500);
  const before = result.current;
  await advance(500);
  expect(result.current).toBe(before);
});

test('drops devices that have not been heard from for staleMs', async () => {
  const fake = createFakeScanner();
  const { result } = await renderScan(fake, { staleMs: 2_000 });
  await act(() => result.current.start());

  await emit(fake, ad('old'), ad('fresh'));
  await advance(500);
  expect(result.current.devices).toHaveLength(2);

  await advance(1_000);
  await emit(fake, ad('fresh'));
  await advance(1_000);
  expect(result.current.devices.map((device) => device.id)).toEqual(['fresh']);
});

test('a denied permission explains why it is needed and does not scan', async () => {
  const fake = createFakeScanner('denied');
  const { result } = await renderScan(fake);
  await act(() => result.current.start());

  expect(result.current.status).toBe('permission-denied');
  expect(result.current.message).toBe(PERMISSION_DENIED_MESSAGE);
  expect(PERMISSION_DENIED_MESSAGE).toBe('Bluetooth permission is needed to see nearby devices.');
  expect(fake.started).toBe(false);
});

test('a blocked permission points to Settings', async () => {
  const fake = createFakeScanner('blocked');
  const { result } = await renderScan(fake);
  await act(() => result.current.start());

  expect(result.current.status).toBe('permission-denied');
  expect(result.current.message).toBe(PERMISSION_BLOCKED_MESSAGE);
  expect(PERMISSION_BLOCKED_MESSAGE).toMatch(/Settings/);
});

test('a failing permission request counts as denied', async () => {
  const fake = createFakeScanner();
  fake.requestPermissions = () => Promise.reject(new Error('no activity'));
  const { result } = await renderScan(fake);
  await act(() => result.current.start());
  expect(result.current.status).toBe('permission-denied');
});

test('passes on statuses and messages from the scanner', async () => {
  const fake = createFakeScanner();
  const { result } = await renderScan(fake);
  await act(() => result.current.start());

  await act(async () => fake.emitStatus('bluetooth-off', 'Turn on Bluetooth to scan.'));
  expect(result.current.status).toBe('bluetooth-off');
  expect(result.current.message).toBe('Turn on Bluetooth to scan.');
  expect(result.current.isScanning).toBe(false);

  await act(async () => fake.emitStatus('scanning'));
  expect(result.current.status).toBe('scanning');
  expect(result.current.message).toBeNull();
});

test('start() while scanning does nothing', async () => {
  const fake = createFakeScanner();
  const { result } = await renderScan(fake);
  await act(() => result.current.start());
  await act(() => result.current.start());
  expect(fake.calls.requestPermissions).toBe(1);
  expect(fake.calls.start).toBe(1);
  expect(result.current.status).toBe('scanning');
});

test('start() while the permission prompt is open does not ask twice', async () => {
  const fake = createFakeScanner();
  const { result } = await renderScan(fake);
  await act(async () => {
    await Promise.all([result.current.start(), result.current.start()]);
  });
  expect(fake.calls.requestPermissions).toBe(1);
  expect(fake.calls.start).toBe(1);
});

test('start() after Bluetooth went off starts over', async () => {
  const fake = createFakeScanner();
  const { result } = await renderScan(fake);
  await act(() => result.current.start());
  await act(async () => fake.emitStatus('bluetooth-off', 'Turn on Bluetooth to scan.'));

  await act(() => result.current.start());
  expect(fake.calls.stop).toBe(1);
  expect(fake.calls.start).toBe(2);
  expect(result.current.status).toBe('scanning');
});

test('stop() stops the scanner and the interval but keeps the devices', async () => {
  const fake = createFakeScanner();
  const { result } = await renderScan(fake, { staleMs: 1_000 });
  await act(() => result.current.start());
  await emit(fake, ad('a'));
  await advance(500);
  await emit(fake, ad('b'));

  await act(async () => result.current.stop());

  expect(fake.started).toBe(false);
  expect(result.current.status).toBe('idle');
  expect(result.current.isScanning).toBe(false);
  // b arrived after the last tick and is published by stop(); nothing is pruned while stopped.
  await advance(10_000);
  expect(result.current.devices.map((device) => device.id)).toEqual(['a', 'b']);
});

test('stop() while the permission prompt is open means the scan never starts', async () => {
  const fake = createFakeScanner();
  let answer: (result: 'granted') => void = () => undefined;
  fake.requestPermissions = () => new Promise((resolve) => (answer = resolve));
  const { result } = await renderScan(fake);

  let pending: Promise<void> = Promise.resolve();
  await act(async () => {
    pending = result.current.start();
  });
  await act(async () => result.current.stop());
  await act(async () => {
    answer('granted');
    await pending;
  });

  expect(fake.started).toBe(false);
  expect(result.current.status).toBe('idle');
});

test('clear() forgets all devices', async () => {
  const fake = createFakeScanner();
  const { result } = await renderScan(fake);
  await act(() => result.current.start());
  await emit(fake, ad('a'));
  await advance(500);
  expect(result.current.devices).toHaveLength(1);

  await act(async () => result.current.clear());
  expect(result.current.devices).toEqual([]);
  await advance(500);
  expect(result.current.devices).toEqual([]);

  await emit(fake, ad('b'));
  await advance(500);
  expect(result.current.devices.map((device) => device.id)).toEqual(['b']);
});

test('reports an error when the scanner throws on start', async () => {
  const fake = createFakeScanner();
  fake.start = () => {
    throw new Error('boom');
  };
  const { result } = await renderScan(fake);
  await act(() => result.current.start());
  expect(result.current.status).toBe('error');
  expect(result.current.message).toBe(START_FAILED_MESSAGE);
});

test('unmounting stops an injected scanner but does not destroy it', async () => {
  const fake = createFakeScanner();
  const { result, unmount } = await renderScan(fake);
  await act(() => result.current.start());

  await unmount();

  expect(fake.started).toBe(false);
  expect(fake.destroyed).toBe(false);
  // The publish interval is gone too: no more ticks.
  pruneStaleMock.mockClear();
  jest.advanceTimersByTime(5_000);
  expect(pruneStaleMock).not.toHaveBeenCalled();
});

test('creates its own scanner on first start and destroys it on unmount', async () => {
  const own = createFakeScanner();
  createBleScannerMock.mockReturnValue(own);
  const { result, unmount } = await renderScan();
  expect(createBleScannerMock).not.toHaveBeenCalled();

  await act(() => result.current.start());
  await act(async () => result.current.stop());
  await act(() => result.current.start());
  expect(createBleScannerMock).toHaveBeenCalledTimes(1);
  expect(own.started).toBe(true);

  await unmount();
  expect(own.destroyed).toBe(true);
});

test('shows the unsupported message from the scanner', async () => {
  const fake = createFakeScanner();
  fake.start = (listener) => listener.onStatus('unsupported', 'Expo Go cannot scan.');
  const { result } = await renderScan(fake);
  await act(() => result.current.start());
  expect(result.current.status).toBe('unsupported');
  expect(result.current.message).toBe('Expo Go cannot scan.');
});
