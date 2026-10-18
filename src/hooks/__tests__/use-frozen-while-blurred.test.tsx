import { renderHook } from '@testing-library/react-native';

import { useFrozenWhileBlurred } from '@/hooks/use-frozen-while-blurred';

let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

beforeEach(() => {
  mockFocused = true;
});

test('follows the value while focused, holds it while blurred, and catches up on focus', async () => {
  const { result, rerender } = await renderHook((props: { value: string }) => useFrozenWhileBlurred(props.value), {
    initialProps: { value: 'a' },
  });
  expect(result.current).toBe('a');
  await rerender({ value: 'b' });
  expect(result.current).toBe('b');

  mockFocused = false;
  await rerender({ value: 'b' });
  await rerender({ value: 'c' });
  expect(result.current).toBe('b');

  mockFocused = true;
  await rerender({ value: 'd' });
  expect(result.current).toBe('d');

  // A second blur freezes the newer value, not the first one.
  mockFocused = false;
  await rerender({ value: 'd' });
  await rerender({ value: 'e' });
  expect(result.current).toBe('d');
});
