import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';

import RadarScreen, { RADAR_CAPTION } from '@/app/(tabs)/index';
import { DOT_HIT_SIZE, Radar, RADAR_RINGS, dotLabel, radarSummary } from '@/components/radar';
import { useNicknames } from '@/context/nicknames-context';
import { useScan } from '@/context/scan-context';
import type { BleScanState } from '@/hooks/use-ble-scan';
import { PROXIMITY_THRESHOLDS } from '@/lib/proximity';
import { radarPosition, rssiToRadiusFraction } from '@/lib/radar';
import type { ScannedDevice, TrackerMatch } from '@/lib/types';

const mockPush = jest.fn();
let mockFocused = true;

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useIsFocused: () => mockFocused }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/context/scan-context', () => ({ useScan: jest.fn() }));
jest.mock('@/context/nicknames-context', () => ({ useNicknames: jest.fn() }));
// Other parts of the screen, with their own tests.
jest.mock('@/components/scan-status-card', () => ({ ScanStatusCard: () => null }));
jest.mock('@/components/scan-button', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ScanButton: () => <Text>Scan button</Text> };
});

const mockUseScan = jest.mocked(useScan);
const mockUseNicknames = jest.mocked(useNicknames);

const AIRTAG: TrackerMatch = {
  type: 'airtag',
  label: 'Possible AirTag',
  confidence: 'likely',
  reason: 'It sends the pattern Apple uses for AirTags.',
};

function device(id: string, rssi: number | null, overrides: Partial<ScannedDevice> = {}): ScannedDevice {
  return {
    id,
    name: null,
    rssi,
    firstSeen: 0,
    lastSeen: 0,
    rssiHistory: rssi === null ? [] : [{ t: 0, rssi }],
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
    tracker: null,
    ...overrides,
  };
}

/** The dot's top-left corner, read from the translate transform of its slot. */
function slotOffset(id: string): { x: number; y: number } {
  const style = StyleSheet.flatten(screen.getByTestId(`radar-dot-slot-${id}`).props.style);
  const transform = style.transform as { translateX?: number; translateY?: number }[];
  return {
    x: transform.find((t) => t.translateX !== undefined)?.translateX ?? NaN,
    y: transform.find((t) => t.translateY !== undefined)?.translateY ?? NaN,
  };
}

beforeEach(() => {
  mockPush.mockReset();
  mockFocused = true;
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
});

describe('radarSummary', () => {
  test('counts devices by proximity and mentions possible trackers', () => {
    const devices = [
      device('a', -50),
      device('b', -70, { tracker: AIRTAG }),
      device('c', -90),
      device('d', -95),
      device('e', null),
    ];

    expect(radarSummary(devices)).toBe(
      'Radar showing 5 devices: 1 near, 1 medium, 2 far, 1 with no signal reading. 1 possible tracker.',
    );
  });

  test('uses singular words for one device and says so when empty', () => {
    expect(radarSummary([device('a', -40)])).toBe('Radar showing 1 device: 1 near.');
    expect(radarSummary([])).toBe('Radar showing no devices yet.');
  });
});

describe('dotLabel', () => {
  test('starts with the tracker label and prefers a nickname', () => {
    const tracker = device('t1', -58, { tracker: AIRTAG });
    expect(dotLabel(tracker)).toBe('Possible AirTag, Unnamed device, near, -58 dBm');

    const named = device('n1', -85, { name: 'Pixel Buds' });
    expect(dotLabel(named, { n1: 'My earbuds' })).toBe('My earbuds, far, -85 dBm');
    expect(dotLabel(device('x', null))).toBe('Unnamed device, unknown, no signal reading');
  });
});

describe('RADAR_RINGS', () => {
  test('sit on the near and medium thresholds, with far at the edge', () => {
    expect(RADAR_RINGS.map((ring) => ring.proximity)).toEqual(['near', 'medium', 'far']);
    expect(RADAR_RINGS[0].fraction).toBeCloseTo(rssiToRadiusFraction(PROXIMITY_THRESHOLDS.near));
    expect(RADAR_RINGS[1].fraction).toBeCloseTo(rssiToRadiusFraction(PROXIMITY_THRESHOLDS.medium));
    expect(RADAR_RINGS[2].fraction).toBe(1);
  });
});

describe('Radar', () => {
  test('draws one tappable dot per device and reports taps by id', async () => {
    const onSelect = jest.fn();
    const devices = [device('a', -50, { name: 'Headphones' }), device('b', -88)];
    await render(<Radar devices={devices} onSelect={onSelect} size={300} />);

    const dots = screen.getAllByRole('button');
    expect(dots).toHaveLength(2);

    await fireEvent.press(screen.getByRole('button', { name: 'Headphones, near, -50 dBm' }));
    expect(onSelect).toHaveBeenCalledWith('a');

    await fireEvent.press(screen.getByRole('button', { name: 'Unnamed device, far, -88 dBm' }));
    expect(onSelect).toHaveBeenLastCalledWith('b');
  });

  test('uses nicknames in the dot labels', async () => {
    await render(
      <Radar devices={[device('a', -65)]} nicknames={{ a: 'My watch' }} onSelect={jest.fn()} size={300} />,
    );

    expect(screen.getByRole('button', { name: 'My watch, medium, -65 dBm' })).toBeOnTheScreen();
  });

  test('places each dot at its radar position with a generous touch target', async () => {
    const size = 320;
    const devices = [device('strong', -35), device('weak', -95)];
    await render(<Radar devices={devices} onSelect={jest.fn()} size={size} />);

    const dot = screen.getByTestId('radar-dot-strong');
    expect(dot).toHaveStyle({ width: DOT_HIT_SIZE, height: DOT_HIT_SIZE });

    for (const d of devices) {
      const centre = size / 2;
      const expected = radarPosition(d.id, d.rssi, centre, centre, centre - 14);
      const offset = slotOffset(d.id);
      expect(offset.x + DOT_HIT_SIZE / 2).toBeCloseTo(expected.x);
      expect(offset.y + DOT_HIT_SIZE / 2).toBeCloseTo(expected.y);
    }

    // The strong signal sits closer to the centre than the weak one.
    const distance = (id: string) => {
      const { x, y } = slotOffset(id);
      return Math.hypot(x + DOT_HIT_SIZE / 2 - size / 2, y + DOT_HIT_SIZE / 2 - size / 2);
    };
    expect(distance('strong')).toBeLessThan(distance('weak'));
  });

  test('moves a dot when its signal changes', async () => {
    // With Reduce motion on the dot jumps straight to its new spot; otherwise the native driver glides it there.
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    const onSelect = jest.fn();
    await render(<Radar devices={[device('a', -90)]} onSelect={onSelect} size={300} />);
    await waitFor(() => expect(screen.queryByTestId('radar-sweep')).toBeNull());
    const before = slotOffset('a');

    await screen.rerender(<Radar devices={[device('a', -40)]} onSelect={onSelect} size={300} />);

    const expected = radarPosition('a', -40, 150, 150, 150 - 14);
    await waitFor(() => expect(slotOffset('a').x + DOT_HIT_SIZE / 2).toBeCloseTo(expected.x));
    expect(slotOffset('a').y + DOT_HIT_SIZE / 2).toBeCloseTo(expected.y);
    expect(slotOffset('a')).not.toEqual(before);
  });

  test('glides a dot to its new spot with the native driver, and only when it moves', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    try {
      const onSelect = jest.fn();
      // No sweep, so every timing call after mount is a dot moving.
      await render(<Radar devices={[device('a', -90)]} onSelect={onSelect} size={300} sweeping={false} />);
      const base = timing.mock.calls.length;

      await screen.rerender(<Radar devices={[device('a', -40)]} onSelect={onSelect} size={300} sweeping={false} />);
      expect(timing).toHaveBeenCalledTimes(base + 1);
      const [, config] = timing.mock.calls[base];
      const target = radarPosition('a', -40, 150, 150, 150 - 14);
      const toValue = config.toValue as { x: number; y: number };
      expect(toValue.x).toBeCloseTo(target.x - DOT_HIT_SIZE / 2);
      expect(toValue.y).toBeCloseTo(target.y - DOT_HIT_SIZE / 2);
      expect(config.useNativeDriver).toBe(true);
      const move = timing.mock.results[base].value as Animated.CompositeAnimation;
      const stop = jest.spyOn(move, 'stop');

      // Same signal: the dot stays put, so no new animation starts.
      await screen.rerender(
        <Radar devices={[device('a', -40, { lastSeen: 1 })]} onSelect={onSelect} size={300} sweeping={false} />,
      );
      expect(timing).toHaveBeenCalledTimes(base + 1);

      await screen.unmount();
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      timing.mockRestore();
    }
  });

  test('marks trackers with a ring and a pulse, and announces them in the summary', async () => {
    const devices = [device('plain', -60), device('tag', -70, { tracker: AIRTAG })];
    await render(<Radar devices={devices} onSelect={jest.fn()} size={300} />);

    expect(screen.getByRole('button', { name: /^Possible AirTag, / })).toBeOnTheScreen();
    expect(screen.getAllByTestId('radar-tracker-ring')).toHaveLength(1);
    expect(screen.getAllByTestId('radar-tracker-pulse')).toHaveLength(1);
    expect(screen.getByRole('image')).toHaveAccessibleName(
      'Radar showing 2 devices: 1 near, 1 medium. 1 possible tracker.',
    );
  });

  test('shows the sweep only while sweeping', async () => {
    await render(<Radar devices={[]} onSelect={jest.fn()} size={300} />);
    expect(screen.getByTestId('radar-sweep')).toBeOnTheScreen();

    await screen.rerender(<Radar devices={[]} onSelect={jest.fn()} size={300} sweeping={false} />);
    expect(screen.queryByTestId('radar-sweep')).toBeNull();
  });

  test('stops the sweep and the pulse when Reduce motion is on', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    await render(
      <Radar devices={[device('tag', -70, { tracker: AIRTAG })]} onSelect={jest.fn()} size={300} />,
    );

    await waitFor(() => expect(screen.queryByTestId('radar-sweep')).toBeNull());
    expect(screen.queryByTestId('radar-tracker-pulse')).toBeNull();
    expect(screen.getByTestId('radar-tracker-ring')).toBeOnTheScreen();
  });

  test('draws nothing before it has a size', async () => {
    await render(<Radar devices={[device('a', -50)]} onSelect={jest.fn()} size={0} testID="radar" />);

    expect(screen.getByTestId('radar')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Radar tab', () => {
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
    mockUseNicknames.mockReturnValue({ nicknames: {}, loaded: true, setNickname: jest.fn() });
  });

  async function layoutRadar(width = 360, height = 480) {
    await fireEvent(screen.getByTestId('radar-area'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });
  }

  test('shows an empty state before the first scan', async () => {
    mockScan();
    await render(<RadarScreen />);

    expect(screen.getByText('Nothing on the radar yet')).toBeOnTheScreen();
    expect(screen.getByText('No devices')).toBeOnTheScreen();
    expect(screen.getByText('Scan button')).toBeOnTheScreen();
    expect(screen.getByText(RADAR_CAPTION)).toBeOnTheScreen();
  });

  test('shows the legend', async () => {
    mockScan();
    await render(<RadarScreen />);

    for (const label of ['Near', 'Medium', 'Far', 'Possible tracker']) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
  });

  test('says it is looking while a scan has found nothing yet', async () => {
    mockScan({ status: 'scanning', isScanning: true });
    await render(<RadarScreen />);
    await layoutRadar();

    expect(screen.getByText('Looking for devices…')).toBeOnTheScreen();
    expect(screen.queryByText('Nothing on the radar yet')).toBeNull();
    expect(screen.getByTestId('radar-sweep')).toBeOnTheScreen();
  });

  test('counts devices and possible trackers, sized to fit the space', async () => {
    mockScan({
      status: 'scanning',
      isScanning: true,
      devices: [device('a', -50), device('b', -70), device('tag', -60, { tracker: AIRTAG })],
    });
    await render(<RadarScreen />);
    await layoutRadar(360, 480);

    expect(screen.getByTestId('radar-counts')).toHaveTextContent('3 devices · 1 possible tracker');
    expect(screen.getByTestId('radar')).toHaveStyle({ width: 360, height: 360 });
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  test('opens the device screen when a dot is tapped', async () => {
    mockScan({
      status: 'scanning',
      isScanning: true,
      devices: [device('AA:BB', -50, { name: 'Speaker' })],
    });
    await render(<RadarScreen />);
    await layoutRadar();

    await fireEvent.press(screen.getByRole('button', { name: 'Speaker, near, -50 dBm' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/device/[id]', params: { id: 'AA:BB' } });
  });

  test('while hidden behind another screen it keeps its last picture and stops the sweep', async () => {
    mockScan({ status: 'scanning', isScanning: true, devices: [device('a', -50)] });
    await render(<RadarScreen />);
    await layoutRadar();
    expect(screen.getByTestId('radar-sweep')).toBeOnTheScreen();

    mockFocused = false;
    await screen.rerender(<RadarScreen />);
    mockScan({ status: 'scanning', isScanning: true, devices: [device('a', -50), device('b', -60)] });
    await screen.rerender(<RadarScreen />);
    expect(screen.getByTestId('radar-counts')).toHaveTextContent('1 device');
    expect(screen.queryByTestId('radar-dot-b')).toBeNull();
    expect(screen.queryByTestId('radar-sweep')).toBeNull();

    mockFocused = true;
    await screen.rerender(<RadarScreen />);
    expect(screen.getByTestId('radar-counts')).toHaveTextContent('2 devices');
    expect(screen.getByTestId('radar-dot-b')).toBeOnTheScreen();
    expect(screen.getByTestId('radar-sweep')).toBeOnTheScreen();
  });

  test('keeps the last devices on a still radar after the scan stops', async () => {
    mockScan({ status: 'idle', isScanning: false, devices: [device('a', -50)] });
    await render(<RadarScreen />);
    await layoutRadar();

    expect(screen.queryByText('Nothing on the radar yet')).toBeNull();
    expect(screen.getByTestId('radar-counts')).toHaveTextContent('1 device');
    expect(screen.queryByTestId('radar-sweep')).toBeNull();
  });
});
