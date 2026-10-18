import { render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { SortFilterBar } from '@/components/sort-filter-bar';
import type { DeviceFilter, SortBy } from '@/lib/types';

async function renderBar(
  overrides: { sortBy?: SortBy; filter?: DeviceFilter; counts?: Partial<Record<DeviceFilter, number>> } = {},
) {
  const onSortByChange = jest.fn();
  const onFilterChange = jest.fn();
  await render(
    <SortFilterBar
      sortBy={overrides.sortBy ?? 'signal'}
      filter={overrides.filter ?? 'all'}
      onSortByChange={onSortByChange}
      onFilterChange={onFilterChange}
      counts={overrides.counts}
    />,
  );
  return { onSortByChange, onFilterChange };
}

test('shows the sort and filter choices with the current ones checked', async () => {
  await renderBar({ sortBy: 'name', filter: 'trackers' });
  expect(screen.getByRole('radio', { name: 'Name' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Signal' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'Trackers' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'All' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'Named' })).not.toBeChecked();
});

test('labels each group of chips for screen readers', async () => {
  await renderBar();
  expect(screen.getByLabelText('Sort')).toHaveProp('accessibilityRole', 'radiogroup');
  expect(screen.getByLabelText('Show')).toHaveProp('accessibilityRole', 'radiogroup');
});

test('reports the chosen sort and filter', async () => {
  const user = userEvent.setup();
  const { onSortByChange, onFilterChange } = await renderBar();
  await user.press(screen.getByRole('radio', { name: 'Name' }));
  expect(onSortByChange).toHaveBeenCalledWith('name');
  await user.press(screen.getByRole('radio', { name: 'Named' }));
  expect(onFilterChange).toHaveBeenCalledWith('named');
  await user.press(screen.getByRole('radio', { name: 'Trackers' }));
  expect(onFilterChange).toHaveBeenLastCalledWith('trackers');
});

test('shows device counts on the filter chips when given', async () => {
  await renderBar({ counts: { all: 12, trackers: 1, named: 5 } });
  expect(screen.getByRole('radio', { name: 'All, 12 devices' })).toHaveTextContent('All 12');
  expect(screen.getByRole('radio', { name: 'Trackers, 1 device' })).toHaveTextContent('Trackers 1');
  expect(screen.getByRole('radio', { name: 'Named, 5 devices' })).toBeOnTheScreen();
});

test('works as a controlled component', async () => {
  function Controlled() {
    const [sortBy, setSortBy] = useState<SortBy>('signal');
    const [filter, setFilter] = useState<DeviceFilter>('all');
    return (
      <SortFilterBar sortBy={sortBy} filter={filter} onSortByChange={setSortBy} onFilterChange={setFilter} />
    );
  }
  const user = userEvent.setup();
  await render(<Controlled />);
  await user.press(screen.getByRole('radio', { name: 'Name' }));
  await user.press(screen.getByRole('radio', { name: 'Trackers' }));
  expect(screen.getByRole('radio', { name: 'Name' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Trackers' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'All' })).not.toBeChecked();
});
