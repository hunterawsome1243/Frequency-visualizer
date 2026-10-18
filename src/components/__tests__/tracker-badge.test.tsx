import { render, screen } from '@testing-library/react-native';

import { TrackerBadge } from '@/components/tracker-badge';
import { Neon } from '@/constants/theme';
import type { TrackerMatch } from '@/lib/types';

const AIRTAG: TrackerMatch = {
  type: 'airtag',
  label: 'Possible AirTag',
  confidence: 'possible',
  reason: 'Apple Find My data was seen.',
};

test('shows a warning with the tracker label', async () => {
  await render(<TrackerBadge tracker={AIRTAG} />);
  expect(screen.getByText('⚠ Possible AirTag')).toHaveStyle({ color: Neon.danger });
  expect(screen.getByLabelText('Warning: Possible AirTag')).toBeOnTheScreen();
});

test('has a smaller compact variant for list rows', async () => {
  await render(<TrackerBadge tracker={AIRTAG} compact />);
  expect(screen.getByText('⚠ Possible AirTag')).toHaveStyle({ fontSize: 12 });
});

test('renders nothing without a tracker', async () => {
  await render(<TrackerBadge tracker={null} />);
  expect(screen.queryByText(/⚠/)).not.toBeOnTheScreen();
  expect(screen.toJSON()).toBeNull();
});
