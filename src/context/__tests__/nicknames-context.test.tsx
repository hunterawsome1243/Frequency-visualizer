import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { NicknamesProvider, useNicknames } from '@/context/nicknames-context';
import { createMemoryStorage, type KeyValueStorage, NICKNAMES_STORAGE_KEY } from '@/lib/nicknames';

function renderNicknames(storage?: KeyValueStorage) {
  return renderHook(() => useNicknames(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <NicknamesProvider storage={storage}>{children}</NicknamesProvider>
    ),
  });
}

async function savedIn(storage: KeyValueStorage) {
  return JSON.parse((await storage.getItem(NICKNAMES_STORAGE_KEY)) ?? '{}');
}

test('loads the saved nicknames', async () => {
  const storage = createMemoryStorage({ [NICKNAMES_STORAGE_KEY]: JSON.stringify({ 'AA:BB': 'my headphones' }) });
  const { result } = await renderNicknames(storage);

  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.nicknames).toEqual({ 'AA:BB': 'my headphones' });
});

test('starts empty and not loaded, then loaded with nothing saved', async () => {
  let finishRead: (value: string | null) => void = () => undefined;
  const storage: KeyValueStorage = {
    getItem: () => new Promise((resolve) => (finishRead = resolve)),
    setItem: async () => undefined,
  };
  const { result } = await renderNicknames(storage);
  expect(result.current.loaded).toBe(false);
  expect(result.current.nicknames).toEqual({});

  await act(async () => finishRead(null));
  expect(result.current.loaded).toBe(true);
  expect(result.current.nicknames).toEqual({});
});

test('setNickname shows the name at once and saves it', async () => {
  const storage = createMemoryStorage();
  let finishWrite: () => void = () => undefined;
  const realSetItem = storage.setItem;
  storage.setItem = (key, value) =>
    new Promise<void>((resolve) => {
      finishWrite = () => realSetItem(key, value).then(resolve);
    });
  const { result } = await renderNicknames(storage);
  await waitFor(() => expect(result.current.loaded).toBe(true));

  let saving: Promise<void> = Promise.resolve();
  await act(async () => {
    saving = result.current.setNickname('AA:BB', '  my headphones  ');
  });
  // Shown before the write finishes.
  expect(result.current.nicknames).toEqual({ 'AA:BB': 'my headphones' });
  expect(await storage.getItem(NICKNAMES_STORAGE_KEY)).toBeNull();

  await act(async () => {
    finishWrite();
    await saving;
  });
  expect(result.current.nicknames).toEqual({ 'AA:BB': 'my headphones' });
  expect(await savedIn(storage)).toEqual({ 'AA:BB': 'my headphones' });
});

test('an empty name removes the nickname', async () => {
  const storage = createMemoryStorage({ [NICKNAMES_STORAGE_KEY]: JSON.stringify({ a: 'Phone', b: 'Watch' }) });
  const { result } = await renderNicknames(storage);
  await waitFor(() => expect(result.current.loaded).toBe(true));

  await act(() => result.current.setNickname('a', ' '));

  expect(result.current.nicknames).toEqual({ b: 'Watch' });
  expect(await savedIn(storage)).toEqual({ b: 'Watch' });
});

test('names survive a restart: a new provider on the same storage sees them', async () => {
  const storage = createMemoryStorage();
  const first = await renderNicknames(storage);
  await waitFor(() => expect(first.result.current.loaded).toBe(true));
  await act(() => first.result.current.setNickname('a', 'Bike lock'));
  await first.unmount();

  const second = await renderNicknames(storage);
  await waitFor(() => expect(second.result.current.loaded).toBe(true));
  expect(second.result.current.nicknames).toEqual({ a: 'Bike lock' });
});

test('goes back to the saved names when a save fails', async () => {
  const storage = createMemoryStorage({ [NICKNAMES_STORAGE_KEY]: JSON.stringify({ a: 'Phone' }) });
  storage.setItem = () => Promise.reject(new Error('disk full'));
  const { result } = await renderNicknames(storage);
  await waitFor(() => expect(result.current.loaded).toBe(true));

  await act(() => result.current.setNickname('b', 'Watch'));

  expect(result.current.nicknames).toEqual({ a: 'Phone' });
});

test('an edit made before loading finishes is not undone by the load', async () => {
  let finishFirstRead: (value: string | null) => void = () => undefined;
  const storage = createMemoryStorage({ [NICKNAMES_STORAGE_KEY]: JSON.stringify({ a: 'Phone' }) });
  const realGetItem = storage.getItem;
  let reads = 0;
  storage.getItem = (key) => {
    reads += 1;
    if (reads === 1) return new Promise((resolve) => (finishFirstRead = resolve));
    return realGetItem(key);
  };
  const { result } = await renderNicknames(storage);

  await act(() => result.current.setNickname('b', 'Watch'));
  await act(async () => finishFirstRead(JSON.stringify({ a: 'Phone' })));

  expect(result.current.loaded).toBe(true);
  expect(result.current.nicknames).toEqual({ a: 'Phone', b: 'Watch' });
});

test('keeps the same value object between renders when nothing changed', async () => {
  const { result, rerender } = await renderNicknames(createMemoryStorage());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  const before = result.current;
  await rerender({});
  expect(result.current).toBe(before);
});

test('works without a storage prop (falls back when AsyncStorage is unavailable)', async () => {
  const { result } = await renderNicknames();
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.nicknames).toEqual({});
});

test('useNicknames() outside the provider throws a clear error', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await expect(renderHook(() => useNicknames())).rejects.toThrow(
    'useNicknames() must be used inside <NicknamesProvider>.',
  );
  jest.restoreAllMocks();
});
