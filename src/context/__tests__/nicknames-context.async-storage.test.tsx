import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { NicknamesProvider, useNicknames } from '@/context/nicknames-context';
import { NICKNAMES_STORAGE_KEY } from '@/lib/nicknames';

// Only AsyncStorage's native module is faked, so the provider goes through the real package and the
// real `require(...).default` it uses on a phone, instead of falling back to memory storage. Jest
// loads the package's CommonJS build, so that is where the native module is replaced.
const mockNativeStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage/lib/commonjs/RCTAsyncStorage', () => ({
  __esModule: true,
  default: {
    multiGet(keys: string[], callback: (errors: null, result: (string | null)[][]) => void) {
      callback(null, keys.map((key) => [key, mockNativeStore.get(key) ?? null]));
    },
    multiSet(pairs: [string, string][], callback: (errors: null) => void) {
      for (const [key, value] of pairs) mockNativeStore.set(key, value);
      callback(null);
    },
  },
}));

function renderNicknames() {
  return renderHook(() => useNicknames(), {
    wrapper: ({ children }: { children: ReactNode }) => <NicknamesProvider>{children}</NicknamesProvider>,
  });
}

beforeEach(() => {
  mockNativeStore.clear();
});

test('without a storage prop, nicknames are saved in AsyncStorage and loaded again next time', async () => {
  const first = await renderNicknames();
  await waitFor(() => expect(first.result.current.loaded).toBe(true));
  await act(() => first.result.current.setNickname('a', 'Bike lock'));
  expect(mockNativeStore.get(NICKNAMES_STORAGE_KEY)).toBe('{"a":"Bike lock"}');
  await first.unmount();

  // Like restarting the app.
  const second = await renderNicknames();
  await waitFor(() => expect(second.result.current.loaded).toBe(true));
  expect(second.result.current.nicknames).toEqual({ a: 'Bike lock' });
});
