import { fireEvent, render, screen } from '@testing-library/react-native';

import DeviceDetailScreen from '@/app/device/[id]';
import { NicknamesProvider } from '@/context/nicknames-context';
import { useScan } from '@/context/scan-context';
import type { BleScanState } from '@/hooks/use-ble-scan';
import { createMemoryStorage } from '@/lib/nicknames';
import type { ScannedDevice, TrackerMatch } from '@/lib/types';

// Kept outside src/app: Expo Router treats every file under src/app as a route.

const mockRouter = { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() };
let mockParams: { id: string | string[] } = { id: 'AA:BB' };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/context/scan-context', () => ({ useScan: jest.fn() }));

const mockUseScan = jest.mocked(useScan);

const TRACKER: TrackerMatch = {
  type: 'airtag',
  label: 'Likely AirTag',
  confidence: 'likely',
  reason: 'Apple Find My broadcast that looks like an AirTag away from its owner.',
};

function device(overrides: Partial<ScannedDevice> = {}, ad: Partial<ScannedDevice['advertisement']> = {}): ScannedDevice {
  return {
    id: 'AA:BB',
    name: 'Speaker',
    rssi: -55,
    firstSeen: Date.now() - 60_000,
    lastSeen: Date.now(),
    rssiHistory: [
      { t: Date.now() - 2000, rssi: -60 },
      { t: Date.now() - 1000, rssi: -55 },
    ],
    advertisement: {
      id: 'AA:BB',
      name: 'Speaker',
      localName: null,
      rssi: -55,
      manufacturerData: null,
      serviceUUIDs: null,
      serviceData: null,
      txPowerLevel: null,
      isConnectable: true,
      ...ad,
    },
    tracker: null,
    ...overrides,
  };
}

function mockScan(devices: ScannedDevice[], isScanning = true) {
  const state: BleScanState = {
    status: isScanning ? 'scanning' : 'idle',
    message: null,
    devices,
    isScanning,
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(),
    clear: jest.fn(),
  };
  mockUseScan.mockReturnValue(state);
}

function renderScreen() {
  return render(
    <NicknamesProvider storage={createMemoryStorage()}>
      <DeviceDetailScreen />
    </NicknamesProvider>,
  );
}

beforeEach(() => {
  mockParams = { id: 'AA:BB' };
  mockRouter.back.mockReset();
  mockRouter.replace.mockReset();
  mockRouter.canGoBack.mockReset().mockReturnValue(true);
});

test('finds the device from an array id and shows its signal and estimated distance', async () => {
  mockParams = { id: ['AA:BB'] };
  mockScan([device({ id: 'other', name: 'Other' }), device()]);
  await renderScreen();

  expect(screen.getByText('-55')).toBeOnTheScreen();
  expect(screen.getByLabelText('Signal -55 dBm. Estimated distance: Near.')).toBeOnTheScreen();
  expect(screen.queryByText('This device is out of range')).toBeNull();
});

test('shows the technical details in a readable form', async () => {
  mockScan([device({}, { manufacturerData: 'TAASGQ==', txPowerLevel: 127, isConnectable: null })]);
  await renderScreen();
  expect(screen.getByText('4c 00 12 19')).toBeOnTheScreen();
  expect(screen.getByText('Not advertised')).toBeOnTheScreen();
  expect(screen.getByText('Unknown')).toBeOnTheScreen();

  mockScan([device({}, { txPowerLevel: 4 })]);
  await screen.rerender(
    <NicknamesProvider storage={createMemoryStorage()}>
      <DeviceDetailScreen />
    </NicknamesProvider>,
  );
  expect(screen.getByText('4 dBm')).toBeOnTheScreen();
  expect(screen.getByText('Yes')).toBeOnTheScreen();
});

test('explains a tracker match without claiming certainty, and only for trackers', async () => {
  mockScan([device({ tracker: TRACKER })]);
  await renderScreen();
  expect(screen.getByText(TRACKER.reason)).toBeOnTheScreen();
  expect(screen.getByText(/not a sure match/)).toBeOnTheScreen();

  mockScan([device()]);
  await screen.rerender(
    <NicknamesProvider storage={createMemoryStorage()}>
      <DeviceDetailScreen />
    </NicknamesProvider>,
  );
  expect(screen.queryByText(/not a sure match/)).toBeNull();
});

test('says when the readings are not updating because scanning is stopped', async () => {
  mockScan([device()], false);
  await renderScreen();
  expect(screen.getByText('Scanning is stopped, so these readings are not updating.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Start scan' })).toBeOnTheScreen();
});

test('an unknown device shows the out-of-range state, and Back goes back or to the list', async () => {
  mockScan([]);
  await renderScreen();
  expect(screen.getByText('This device is out of range')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).not.toHaveBeenCalled();

  // Opened from a link with nothing underneath.
  mockRouter.canGoBack.mockReturnValue(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockRouter.replace).toHaveBeenCalledWith('/devices');
});
