import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import DevicesScreen from '@/app/(tabs)/devices';
import { NicknamesProvider } from '@/context/nicknames-context';
import { useScan } from '@/context/scan-context';
import type { BleScanState } from '@/hooks/use-ble-scan';
import { createMemoryStorage } from '@/lib/nicknames';
import type { ScannedDevice, TrackerMatch } from '@/lib/types';

// Kept outside src/app: Expo Router treats every file under src/app as a route.

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useIsFocused: () => true }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/context/scan-context', () => ({ useScan: jest.fn() }));

const mockUseScan = jest.mocked(useScan);

const TRACKER: TrackerMatch = {
  type: 'airtag',
  label: 'Likely AirTag',
  confidence: 'likely',
  reason: 'Test.',
};

function device(id: string, rssi: number, tracker: TrackerMatch | null = null): ScannedDevice {
  return {
    id,
    name: null,
    rssi,
    firstSeen: 0,
    lastSeen: 0,
    rssiHistory: [{ t: 0, rssi }],
    advertisement: {
      id,
      name: null,
      localName: null,
      rssi,
      manufacturerData: null,
      serviceUUIDs: null,
      serviceData: null,
      txPowerLevel: null,
      isConnectable: null,
    },
    tracker,
  };
}

function mockScan(overrides: Partial<BleScanState> = {}) {
  mockUseScan.mockReturnValue({
    status: 'scanning',
    message: null,
    devices: [],
    isScanning: true,
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(),
    clear: jest.fn(),
    ...overrides,
  });
}

function renderScreen() {
  return render(
    <NicknamesProvider storage={createMemoryStorage()}>
      <DevicesScreen />
    </NicknamesProvider>,
  );
}

function rowLabels(): string[] {
  return screen.getAllByRole('button', { name: /proximity/ }).map((row) => row.props.accessibilityLabel);
}

beforeEach(() => {
  mockPush.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('lists trackers first, even with a weaker signal, and sums up what was found', async () => {
  mockScan({ devices: [device('plain', -40), device('tag', -90, TRACKER)] });
  await renderScreen();

  expect(rowLabels()).toEqual([
    'Warning: Likely AirTag, Unnamed device, -90 dBm, proximity Far',
    'Unnamed device, -40 dBm, proximity Near',
  ]);
  expect(screen.getByText('2 devices found · 1 possible tracker')).toBeOnTheScreen();
});

test('filters with the chips and offers a way back when nothing matches', async () => {
  mockScan({ devices: [device('plain', -40), device('tag', -90, TRACKER)] });
  await renderScreen();

  await fireEvent.press(screen.getByRole('radio', { name: 'Trackers, 1 device' }));
  expect(screen.getByText('Showing 1 of 2 devices · 1 possible tracker')).toBeOnTheScreen();
  expect(rowLabels()).toHaveLength(1);

  await fireEvent.press(screen.getByRole('radio', { name: 'Named, 0 devices' }));
  expect(screen.getByText('No devices match this filter')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Show all' }));
  expect(rowLabels()).toHaveLength(2);
});

test('with no devices it says what to do before a scan and that it is looking during one', async () => {
  mockScan({ status: 'idle', isScanning: false });
  await renderScreen();
  expect(screen.getByText('Tap Start scan to look for nearby Bluetooth devices')).toBeOnTheScreen();

  mockScan();
  await screen.rerender(
    <NicknamesProvider storage={createMemoryStorage()}>
      <DevicesScreen />
    </NicknamesProvider>,
  );
  expect(screen.getByText('Looking for devices…')).toBeOnTheScreen();
});

test('on Android it says which permissions the first scan will ask for', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform as { Version: number }, 'Version', 'get').mockReturnValue(33);
  mockScan({ status: 'idle', isScanning: false });
  await renderScreen();
  expect(
    screen.getByText(/Android will ask you to allow Nearby devices and precise Location\. The app doesn't save/),
  ).toBeOnTheScreen();
});

test('tapping a row opens its detail screen', async () => {
  mockScan({ devices: [device('AA:BB:CC', -50)] });
  await renderScreen();
  await fireEvent.press(screen.getByRole('button', { name: /proximity/ }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/device/[id]', params: { id: 'AA:BB:CC' } });
});
