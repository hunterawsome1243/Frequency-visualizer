import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import {
  BLUETOOTH_OFF_FALLBACK,
  describeScanStatus,
  PERMISSION_DENIED_FALLBACK,
  ScanStatusCard,
  UNSUPPORTED_FALLBACK,
} from '@/components/scan-status-card';
import { useScan } from '@/context/scan-context';
import type { BleScanState } from '@/hooks/use-ble-scan';
import type { ScanStatus } from '@/lib/types';

jest.mock('@/context/scan-context', () => ({ useScan: jest.fn() }));

const mockUseScan = jest.mocked(useScan);

function mockScan(overrides: Partial<BleScanState> = {}): BleScanState {
  const state: BleScanState = {
    status: 'idle',
    message: null,
    devices: [],
    isScanning: false,
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(),
    clear: jest.fn(),
    ...overrides,
  };
  mockUseScan.mockReturnValue(state);
  return state;
}

beforeEach(() => {
  mockUseScan.mockReset();
});

test.each<ScanStatus>(['idle', 'scanning'])('renders nothing while %s', async (status) => {
  mockScan({ status, isScanning: status === 'scanning' });
  await render(<ScanStatusCard />);

  expect(screen.toJSON()).toBeNull();
});

test('shows a small spinner while asking for permission', async () => {
  mockScan({ status: 'requesting-permission' });
  await render(<ScanStatusCard />);

  expect(screen.getByTestId('scan-status-spinner')).toBeOnTheScreen();
  expect(screen.getByText('Asking for Bluetooth permission…')).toBeOnTheScreen();
  expect(screen.queryByRole('button')).toBeNull();
});

test('permission denied offers Settings and a retry', async () => {
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  const state = mockScan({
    status: 'permission-denied',
    message: 'Bluetooth access is turned off for this app. You can allow it in Settings.',
  });
  await render(<ScanStatusCard />);

  expect(screen.getByText('Bluetooth permission needed')).toBeOnTheScreen();
  expect(
    screen.getByText('Bluetooth access is turned off for this app. You can allow it in Settings.'),
  ).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Open settings' }));
  expect(openSettings).toHaveBeenCalledTimes(1);

  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(state.start).toHaveBeenCalledTimes(1);

  openSettings.mockRestore();
});

test('permission denied without a message from the hook uses a plain fallback', async () => {
  mockScan({ status: 'permission-denied' });
  await render(<ScanStatusCard />);

  expect(screen.getByText(PERMISSION_DENIED_FALLBACK)).toBeOnTheScreen();
});

test('Bluetooth off asks to turn it on and can retry', async () => {
  const state = mockScan({ status: 'bluetooth-off' });
  await render(<ScanStatusCard />);

  expect(screen.getByText('Bluetooth is off')).toBeOnTheScreen();
  expect(screen.getByText(BLUETOOTH_OFF_FALLBACK)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(state.start).toHaveBeenCalledTimes(1);
});

test('unsupported explains that a development build is needed', async () => {
  mockScan({ status: 'unsupported' });
  await render(<ScanStatusCard />);

  expect(screen.getByText("Scanning isn't available here")).toBeOnTheScreen();
  expect(screen.getByText(UNSUPPORTED_FALLBACK)).toBeOnTheScreen();
  expect(screen.queryByRole('button')).toBeNull();
});

test('unsupported prefers the reason the hook gives', async () => {
  mockScan({
    status: 'unsupported',
    message: 'Bluetooth scanning needs a development build of this app. Expo Go cannot scan.',
  });
  await render(<ScanStatusCard />);

  expect(
    screen.getByText('Bluetooth scanning needs a development build of this app. Expo Go cannot scan.'),
  ).toBeOnTheScreen();
});

test('an error shows the message and a retry that does not throw when start fails', async () => {
  const start = jest.fn(() => Promise.reject(new Error('boom')));
  mockScan({ status: 'error', message: 'Something went wrong while scanning. Try again.', start });
  await render(<ScanStatusCard />);

  expect(screen.getByText('Something went wrong while scanning. Try again.')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(start).toHaveBeenCalledTimes(1);
});

test('describeScanStatus gives every status a plain label', () => {
  const statuses: ScanStatus[] = [
    'idle',
    'requesting-permission',
    'scanning',
    'permission-denied',
    'bluetooth-off',
    'unsupported',
    'error',
  ];
  const labels = statuses.map((status) => describeScanStatus(status).label);

  expect(labels.every((label) => label.length > 0)).toBe(true);
  expect(new Set(labels).size).toBe(statuses.length);
  expect(describeScanStatus('bluetooth-off').label).toBe('Bluetooth is off');
});
