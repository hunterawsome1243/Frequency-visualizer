import { render, screen, userEvent } from '@testing-library/react-native';

import { DeviceRow } from '@/components/device-row';
import { Neon, ProximityColors } from '@/constants/theme';
import type { ScannedDevice, TrackerMatch } from '@/lib/types';

const TILE: TrackerMatch = {
  type: 'tile',
  label: 'Likely Tile tracker',
  confidence: 'likely',
  reason: 'Tile service data was seen.',
};

function device(
  overrides: { id?: string; name?: string | null; rssi?: number | null; tracker?: TrackerMatch | null } = {},
): ScannedDevice {
  const id = overrides.id ?? 'AA:BB:CC:DD:EE:FF';
  const name = overrides.name === undefined ? 'Headphones' : overrides.name;
  const rssi = overrides.rssi === undefined ? -55 : overrides.rssi;
  return {
    id,
    name,
    rssi,
    firstSeen: 0,
    lastSeen: 0,
    rssiHistory: [],
    advertisement: {
      id,
      name,
      localName: null,
      rssi,
      manufacturerData: null,
      serviceUUIDs: null,
      serviceData: null,
      txPowerLevel: null,
      isConnectable: null,
    },
    tracker: overrides.tracker ?? null,
  };
}

test('shows the name, id, signal and proximity', async () => {
  await render(<DeviceRow device={device()} />);
  expect(screen.getByText('Headphones')).toBeOnTheScreen();
  expect(screen.getByText('AA:BB:CC:DD:EE:FF')).toBeOnTheScreen();
  expect(screen.getByText('-55 dBm')).toBeOnTheScreen();
  expect(screen.getByText('Near')).toHaveStyle({ color: ProximityColors.near });
});

test('prefers the nickname over the advertised name', async () => {
  await render(
    <DeviceRow device={device()} nicknames={{ 'AA:BB:CC:DD:EE:FF': 'My headphones', other: 'Nope' }} />,
  );
  expect(screen.getByText('My headphones')).toBeOnTheScreen();
  expect(screen.queryByText('Headphones')).not.toBeOnTheScreen();
});

test('handles a device with no name and no reading', async () => {
  await render(<DeviceRow device={device({ name: null, rssi: null })} />);
  expect(screen.getByText('Unnamed device')).toBeOnTheScreen();
  expect(screen.getByText('No signal reading')).toBeOnTheScreen();
  expect(screen.getByText('Unknown')).toHaveStyle({ color: ProximityColors.unknown });
});

test('colours the proximity label by signal', async () => {
  await render(<DeviceRow device={device({ rssi: -90 })} />);
  expect(screen.getByText('Far')).toHaveStyle({ color: ProximityColors.far });
});

test('marks trackers with a badge and a danger border', async () => {
  await render(<DeviceRow device={device({ tracker: TILE })} />);
  expect(screen.getByText('⚠ Likely Tile tracker')).toBeOnTheScreen();
  expect(screen.getByRole('button')).toHaveStyle({ borderLeftColor: Neon.danger });
});

test('ordinary devices have no badge or danger border', async () => {
  await render(<DeviceRow device={device()} />);
  expect(screen.queryByText(/⚠/)).not.toBeOnTheScreen();
  expect(screen.getByRole('button')).not.toHaveStyle({ borderLeftColor: Neon.danger });
});

test('describes itself to screen readers', async () => {
  await render(<DeviceRow device={device({ tracker: TILE })} />);
  expect(
    screen.getByRole('button', {
      name: 'Warning: Likely Tile tracker, Headphones, -55 dBm, proximity Near',
    }),
  ).toBeOnTheScreen();
});

test('calls onPress with the device id', async () => {
  const onPress = jest.fn();
  const user = userEvent.setup();
  await render(<DeviceRow device={device({ id: '11:22' })} onPress={onPress} />);
  await user.press(screen.getByRole('button', { name: /Headphones/ }));
  expect(onPress).toHaveBeenCalledWith('11:22');
});
