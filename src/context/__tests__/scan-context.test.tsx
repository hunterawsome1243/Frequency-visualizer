import { act, render, renderHook, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { BleScanState } from '@/hooks/use-ble-scan';

import { ScanProvider, useScan } from '@/context/scan-context';
import type { DeviceMap } from '@/lib/device-list';
import { createFakeScanner } from '@/lib/scanner';
import type { Advertisement, ScannedDevice } from '@/lib/types';

// device-list has its own tests; a small stand-in keeps these tests about the provider.
jest.mock('@/lib/device-list', () => ({
  DEFAULT_STALE_MS: 30_000,
  upsertAdvertisement: (devices: DeviceMap, ad: Advertisement, now: number): DeviceMap => {
    const device: ScannedDevice = {
      id: ad.id,
      name: ad.name,
      rssi: ad.rssi,
      firstSeen: devices[ad.id]?.firstSeen ?? now,
      lastSeen: now,
      rssiHistory: [],
      advertisement: ad,
      tracker: null,
    };
    return { ...devices, [ad.id]: device };
  },
  pruneStale: (devices: DeviceMap) => devices,
}));

const AD: Advertisement = {
  id: 'AA:BB',
  name: 'Headphones',
  localName: null,
  rssi: -60,
  manufacturerData: null,
  serviceUUIDs: null,
  serviceData: null,
  txPowerLevel: null,
  isConnectable: null,
};

function ScanSummary(props: { label: string }) {
  const { status, devices } = useScan();
  return (
    <Text>
      {props.label}: {status}, {devices.length} devices
    </Text>
  );
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('every screen under the provider sees the same scan', async () => {
  const seen: Record<string, BleScanState> = {};
  function Consumer(props: { name: string }) {
    seen[props.name] = useScan();
    return null;
  }
  await render(
    <ScanProvider scanner={createFakeScanner()}>
      <Consumer name="radar" />
      <Consumer name="list" />
    </ScanProvider>,
  );
  expect(seen.radar.status).toBe('idle');
  expect(seen.radar).toBe(seen.list);
});

test('starting from one consumer updates the others', async () => {
  const fake = createFakeScanner();
  let start: () => Promise<void> = async () => undefined;
  function Starter() {
    start = useScan().start;
    return null;
  }
  await render(
    <ScanProvider scanner={fake} options={{ updateIntervalMs: 100 }}>
      <Starter />
      <ScanSummary label="Radar" />
      <ScanSummary label="List" />
    </ScanProvider>,
  );

  await act(() => start());
  await act(async () => {
    fake.emit(AD);
    jest.advanceTimersByTime(100);
  });

  expect(screen.getByText('Radar: scanning, 1 devices')).toBeTruthy();
  expect(screen.getByText('List: scanning, 1 devices')).toBeTruthy();
});

test('useScan() outside the provider throws a clear error', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await expect(renderHook(() => useScan())).rejects.toThrow('useScan() must be used inside <ScanProvider>.');
  jest.restoreAllMocks();
});
