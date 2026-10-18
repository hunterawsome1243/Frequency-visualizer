import { render, screen } from '@testing-library/react-native';

import { ThemedText } from '@/components/themed-text';

test('renders its text', async () => {
  await render(<ThemedText>Hello radar</ThemedText>);
  expect(screen.getByText('Hello radar')).toBeTruthy();
});
