import { fireEvent, render, screen } from '@testing-library/react-native';

import { SCAN_UNSUPPORTED_HINT, ScanButton } from '@/components/scan-button';
import { useScan } from '@/context/scan-context';
import type { BleScanState } from '@/hooks/use-ble-scan';

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

test('starts a scan when idle', async () => {
  const state = mockScan();
  await render(<ScanButton />);

  await fireEvent.press(screen.getByRole('button', { name: 'Start scan' }));

  expect(state.start).toHaveBeenCalledTimes(1);
  expect(state.stop).not.toHaveBeenCalled();
});

test('stops the scan while scanning', async () => {
  const state = mockScan({ status: 'scanning', isScanning: true });
  await render(<ScanButton />);

  await fireEvent.press(screen.getByRole('button', { name: 'Stop scan' }));

  expect(state.stop).toHaveBeenCalledTimes(1);
  expect(state.start).not.toHaveBeenCalled();
});

test('is disabled with a short hint when scanning is unsupported', async () => {
  const state = mockScan({ status: 'unsupported', message: 'Expo Go cannot scan.' });
  await render(<ScanButton />);

  const button = screen.getByRole('button', { name: 'Start scan' });
  expect(button).toBeDisabled();
  expect(screen.getByText(SCAN_UNSUPPORTED_HINT)).toBeOnTheScreen();

  await fireEvent.press(button);
  expect(state.start).not.toHaveBeenCalled();
});

test('is busy and disabled while asking for permission', async () => {
  const state = mockScan({ status: 'requesting-permission' });
  await render(<ScanButton />);

  const button = screen.getByRole('button', { name: 'Starting…' });
  expect(button).toBeDisabled();
  expect(button).toBeBusy();

  await fireEvent.press(button);
  expect(state.start).not.toHaveBeenCalled();
});

test('offers to start again after an error', async () => {
  const state = mockScan({ status: 'error', message: 'Something went wrong while scanning.' });
  await render(<ScanButton />);

  await fireEvent.press(screen.getByRole('button', { name: 'Start scan' }));

  expect(state.start).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(SCAN_UNSUPPORTED_HINT)).toBeNull();
});
