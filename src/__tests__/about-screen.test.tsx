import { render, screen } from '@testing-library/react-native';

import AboutScreen from '@/app/(tabs)/about';
import { PERMISSION_DENIED_FALLBACK } from '@/components/scan-status-card';
import { useScan } from '@/context/scan-context';
import type { BleScanState } from '@/hooks/use-ble-scan';

// Kept outside src/app: Expo Router treats every file under src/app as a route.

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/context/scan-context', () => ({ useScan: jest.fn() }));

function mockScan(overrides: Partial<BleScanState>) {
  jest.mocked(useScan).mockReturnValue({
    status: 'idle',
    message: null,
    devices: [],
    isScanning: false,
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(),
    clear: jest.fn(),
    ...overrides,
  });
}

test('a refused permission gets a plain explanation and a way to Settings', async () => {
  mockScan({ status: 'permission-denied' });
  await render(<AboutScreen />);
  expect(screen.getByText(PERMISSION_DENIED_FALLBACK)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Open settings' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Allow Bluetooth and scan' })).toBeOnTheScreen();
});

test('while scanning it says so instead of asking again', async () => {
  mockScan({ status: 'scanning', isScanning: true });
  await render(<AboutScreen />);
  expect(screen.getByText(/^Scanning is on\./)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Allow Bluetooth and scan' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull();
});
