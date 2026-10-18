import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking, Platform } from 'react-native';

import WifiScreen, { WIFI_CACHED_NOTE, WIFI_THROTTLE_NOTE } from '@/app/(tabs)/wifi';
import { WifiRow } from '@/components/wifi-row';
import { Neon, ProximityColors } from '@/constants/theme';
import type { WifiNetwork } from '@/lib/types';
import {
  isWifiScanSupported,
  scanWifi,
  WIFI_LOCATION_OFF_MESSAGE,
  WIFI_PERMISSION_BLOCKED_MESSAGE,
  WIFI_SCAN_FAILED_MESSAGE,
  type WifiScanResult,
} from '@/lib/wifi-scanner';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/lib/wifi-scanner', () => ({
  ...jest.requireActual<typeof import('@/lib/wifi-scanner')>('@/lib/wifi-scanner'),
  isWifiScanSupported: jest.fn(() => true),
  scanWifi: jest.fn(),
}));

const mockSupported = jest.mocked(isWifiScanSupported);
const mockScanWifi = jest.mocked(scanWifi);

/** Calls the list's RefreshControl handler, as a pull-down gesture would. */
async function pullToRefresh() {
  const { refreshControl } = screen.getByTestId('wifi-list').props;
  await act(async () => {
    refreshControl.props.onRefresh();
  });
}

function network(overrides: Partial<WifiNetwork> = {}): WifiNetwork {
  return {
    ssid: 'Home',
    bssid: 'aa:bb:cc:dd:ee:01',
    level: -52,
    frequency: 5180,
    channel: 36,
    band: '5 GHz',
    capabilities: '[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]',
    ...overrides,
  };
}

describe('WifiRow', () => {
  test('shows the name, band, channel, signal and security', async () => {
    await render(<WifiRow network={network()} />);

    expect(screen.getByText('Home')).toBeOnTheScreen();
    expect(screen.getByText('5 GHz · Channel 36')).toBeOnTheScreen();
    expect(screen.getByText('aa:bb:cc:dd:ee:01')).toBeOnTheScreen();
    expect(screen.getByText('-52 dBm')).toHaveStyle({ color: ProximityColors.near });
    expect(screen.getByText('WPA2')).toBeOnTheScreen();
    expect(screen.getByTestId('wifi-lock-icon')).toBeOnTheScreen();
  });

  test('colours the signal like the radar', async () => {
    await render(<WifiRow network={network({ level: -70 })} />);
    expect(screen.getByText('-70 dBm')).toHaveStyle({ color: ProximityColors.medium });

    await render(<WifiRow network={network({ level: -88 })} />);
    expect(screen.getByText('-88 dBm')).toHaveStyle({ color: ProximityColors.far });
  });

  test('marks an open network without a lock', async () => {
    await render(<WifiRow network={network({ capabilities: '[ESS]' })} />);

    expect(screen.getByText('Open')).toHaveStyle({ color: Neon.amber });
    expect(screen.queryByTestId('wifi-lock-icon')).toBeNull();
  });

  test('copes with an unknown channel and band', async () => {
    await render(<WifiRow network={network({ channel: null, band: 'unknown', bssid: '' })} />);

    expect(screen.getByText('Unknown band · Channel unknown')).toBeOnTheScreen();
  });

  test('reads as one sentence to a screen reader', async () => {
    await render(<WifiRow network={network({ ssid: 'Cafe', capabilities: '[ESS]', level: -80 })} testID="row" />);

    expect(screen.getByTestId('row')).toHaveAccessibleName(
      'Cafe, 5 GHz, channel 36, open network, no password, signal -80 dBm, medium',
    );
  });
});

describe('Wi-Fi tab', () => {
  beforeEach(() => {
    mockSupported.mockReset().mockReturnValue(true);
    mockScanWifi.mockReset();
  });

  // Puts back Platform.OS and the Linking spies.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function deferred() {
    let resolve!: (result: WifiScanResult) => void;
    const promise = new Promise<WifiScanResult>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  test('on iPhone explains that iOS does not allow Wi-Fi scans', async () => {
    mockSupported.mockReturnValue(false);
    await render(<WifiScreen />);

    expect(screen.getByText("Wi-Fi scanning isn't available on iPhone")).toBeOnTheScreen();
    expect(
      screen.getByText("iOS doesn't let apps scan for nearby Wi-Fi networks. Bluetooth scanning still works."),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
    expect(mockScanWifi).not.toHaveBeenCalled();
  });

  test('in a browser says Wi-Fi scanning needs the Android app', async () => {
    mockSupported.mockReturnValue(false);
    jest.replaceProperty(Platform, 'OS', 'web');
    await render(<WifiScreen />);

    expect(screen.getByText("Wi-Fi scanning isn't available in a browser")).toBeOnTheScreen();
  });

  test('on Android without the native module asks for a development build', async () => {
    mockSupported.mockReturnValue(false);
    jest.replaceProperty(Platform, 'OS', 'android');
    await render(<WifiScreen />);

    expect(screen.getByText('Wi-Fi scanning needs a development build')).toBeOnTheScreen();
  });

  test('waits for a tap, then scans and lists networks strongest first', async () => {
    const scan = deferred();
    mockScanWifi.mockReturnValue(scan.promise);
    await render(<WifiScreen />);

    expect(screen.getByText('See nearby Wi-Fi networks')).toBeOnTheScreen();
    expect(screen.getByText(WIFI_THROTTLE_NOTE)).toBeOnTheScreen();
    expect(mockScanWifi).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Scan Wi-Fi' }));
    expect(screen.getByText('Scanning for Wi-Fi networks…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Scanning…' })).toBeDisabled();

    scan.resolve({
      status: 'ok',
      networks: [network({ ssid: 'Home', bssid: '1' }), network({ ssid: 'Neighbour', bssid: '2', level: -81 })],
    });

    expect(await screen.findByText('Neighbour')).toBeOnTheScreen();
    expect(screen.getByText('Home')).toBeOnTheScreen();
    expect(screen.getByText(/^2 networks · Updated /)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Scan again' })).toBeOnTheScreen();
    expect(screen.queryByTestId('wifi-cached-note')).toBeNull();
  });

  test('says when Android only gave its last results', async () => {
    mockScanWifi.mockResolvedValue({ status: 'ok', networks: [network()], cached: true });
    await render(<WifiScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Scan Wi-Fi' }));

    expect(await screen.findByText(WIFI_CACHED_NOTE)).toBeOnTheScreen();
  });

  test('shows an empty state when no networks are found', async () => {
    mockScanWifi.mockResolvedValue({ status: 'ok', networks: [] });
    await render(<WifiScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Scan Wi-Fi' }));

    expect(await screen.findByText('No Wi-Fi networks found')).toBeOnTheScreen();
  });

  test('pull to refresh scans again', async () => {
    mockScanWifi.mockResolvedValue({ status: 'ok', networks: [network()] });
    await render(<WifiScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Scan Wi-Fi' }));
    await screen.findByText('Home');

    mockScanWifi.mockResolvedValue({ status: 'ok', networks: [network({ ssid: 'Office', bssid: '9' })] });
    await pullToRefresh();

    expect(await screen.findByText('Office')).toBeOnTheScreen();
    expect(mockScanWifi).toHaveBeenCalledTimes(2);
  });

  test('permission denied offers Settings and a retry', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    mockScanWifi.mockResolvedValue({ status: 'permission-denied', message: WIFI_PERMISSION_BLOCKED_MESSAGE });
    await render(<WifiScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Scan Wi-Fi' }));

    expect(await screen.findByText('Location permission needed')).toBeOnTheScreen();
    expect(screen.getByText(WIFI_PERMISSION_BLOCKED_MESSAGE)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Open settings' }));
    expect(openSettings).toHaveBeenCalledTimes(1);

    mockScanWifi.mockResolvedValue({ status: 'ok', networks: [network()] });
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Home')).toBeOnTheScreen();
    expect(screen.queryByText('Location permission needed')).toBeNull();
  });

  test('location turned off offers the Location settings', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const sendIntent = jest.spyOn(Linking, 'sendIntent').mockResolvedValue(undefined);
    mockScanWifi.mockResolvedValue({ status: 'error', message: WIFI_LOCATION_OFF_MESSAGE });
    await render(<WifiScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Scan Wi-Fi' }));

    expect(await screen.findByText('Location is turned off')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Open location settings' }));
    expect(sendIntent).toHaveBeenCalledWith('android.settings.LOCATION_SOURCE_SETTINGS');
  });

  test('a failed scan shows the reason, and a crash in the scanner is treated the same', async () => {
    mockScanWifi.mockRejectedValue(new Error('native crash'));
    await render(<WifiScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Scan Wi-Fi' }));

    expect(await screen.findByText("Couldn't scan for Wi-Fi")).toBeOnTheScreen();
    expect(screen.getByText(WIFI_SCAN_FAILED_MESSAGE)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  test('a failed refresh keeps the earlier results with a notice', async () => {
    mockScanWifi.mockResolvedValue({ status: 'ok', networks: [network()] });
    await render(<WifiScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Scan Wi-Fi' }));
    await screen.findByText('Home');

    mockScanWifi.mockResolvedValue({ status: 'error', message: WIFI_SCAN_FAILED_MESSAGE });
    await fireEvent.press(screen.getByRole('button', { name: 'Scan again' }));

    expect(await screen.findByText('Showing earlier results')).toBeOnTheScreen();
    expect(screen.getByText('Home')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Scan again' })).toBeEnabled());
  });

  test('ignores a second tap while a scan is running', async () => {
    const scan = deferred();
    mockScanWifi.mockReturnValue(scan.promise);
    await render(<WifiScreen />);

    const button = screen.getByRole('button', { name: 'Scan Wi-Fi' });
    await fireEvent.press(button);
    await pullToRefresh();
    expect(mockScanWifi).toHaveBeenCalledTimes(1);

    scan.resolve({ status: 'ok', networks: [] });
    expect(await screen.findByText('No Wi-Fi networks found')).toBeOnTheScreen();
  });
});
