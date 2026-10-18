import { render, screen } from '@testing-library/react-native';

import { RssiChart } from '@/components/rssi-chart';
import type { RssiSample } from '@/lib/types';

const hidden = { includeHiddenElements: true };

test('waits for a second reading before drawing a line', async () => {
  await render(<RssiChart samples={[{ t: 1000, rssi: -60 }]} />);
  expect(screen.getByRole('image')).toHaveAccessibleName('Signal strength chart. Waiting for more readings.');
  expect(screen.getByText('Waiting for more readings')).toBeOnTheScreen();
});

test('describes the readings for screen readers', async () => {
  const samples: RssiSample[] = [
    { t: 1000, rssi: -50 },
    { t: 2000, rssi: -80 },
    { t: 3000, rssi: -60 },
  ];
  await render(<RssiChart samples={samples} />);
  expect(screen.getByRole('image')).toHaveAccessibleName(
    'Signal strength chart of the last 3 readings, between -80 and -50 dBm. Latest -60 dBm.',
  );
  expect(screen.queryByText('Waiting for more readings')).toBeNull();
});

test('labels the time axis from the oldest to the newest reading', async () => {
  const samples: RssiSample[] = [
    { t: 10_000, rssi: -60 },
    { t: 30_000, rssi: -62 },
  ];
  await render(<RssiChart samples={samples} />);
  // Without a clock, the newest reading counts as now.
  expect(screen.getByText('20 seconds ago', hidden)).toBeTruthy();
  expect(screen.getByText('just now', hidden)).toBeTruthy();

  await screen.rerender(<RssiChart samples={samples} now={32_000} />);
  expect(screen.getByText('22 seconds ago', hidden)).toBeTruthy();
});
