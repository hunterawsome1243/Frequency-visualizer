import { fireEvent, render, screen } from '@testing-library/react-native';

import { ActionButton, StateView } from '@/components/state-view';

test('shows the title and message', async () => {
  await render(<StateView title="No devices yet" message="Start a scan to look around." />);

  expect(screen.getByRole('header', { name: 'No devices yet' })).toBeOnTheScreen();
  expect(screen.getByText('Start a scan to look around.')).toBeOnTheScreen();
});

test('shows a spinner only while loading', async () => {
  await render(<StateView title="Scanning" />);
  expect(screen.queryByTestId('state-view-spinner')).toBeNull();

  await render(<StateView title="Scanning" loading />);
  expect(screen.getByTestId('state-view-spinner')).toBeOnTheScreen();
});

test('calls the action when its button is pressed', async () => {
  const onPress = jest.fn();
  await render(<StateView title="Scan stopped" tone="error" action={{ label: 'Try again', onPress }} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

  expect(onPress).toHaveBeenCalledTimes(1);
});

test('renders no button without an action', async () => {
  await render(<StateView title="Nothing nearby" tone="warning" />);

  expect(screen.queryByRole('button')).toBeNull();
});

test('a disabled action button does not respond to presses', async () => {
  const onPress = jest.fn();
  await render(<ActionButton label="Allow Bluetooth and scan" onPress={onPress} disabled />);

  const button = screen.getByRole('button', { name: 'Allow Bluetooth and scan' });
  expect(button).toBeDisabled();
  await fireEvent.press(button);

  expect(onPress).not.toHaveBeenCalled();
});
