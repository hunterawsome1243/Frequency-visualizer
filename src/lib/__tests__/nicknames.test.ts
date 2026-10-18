import {
  cleanNickname,
  createMemoryStorage,
  createNicknameStore,
  type KeyValueStorage,
  MAX_NICKNAME_LENGTH,
  NICKNAMES_STORAGE_KEY,
  parseNicknames,
} from '@/lib/nicknames';

function storageWith(raw: string) {
  return createMemoryStorage({ [NICKNAMES_STORAGE_KEY]: raw });
}

describe('createMemoryStorage', () => {
  test('returns null for missing keys and keeps what is set', async () => {
    const storage = createMemoryStorage({ a: '1' });
    await expect(storage.getItem('a')).resolves.toBe('1');
    await expect(storage.getItem('b')).resolves.toBeNull();
    await storage.setItem('b', '2');
    await expect(storage.getItem('b')).resolves.toBe('2');
  });

  test('does not share data between instances', async () => {
    const first = createMemoryStorage();
    await first.setItem('a', '1');
    await expect(createMemoryStorage().getItem('a')).resolves.toBeNull();
  });
});

describe('load', () => {
  test('gives {} when nothing is saved', async () => {
    await expect(createNicknameStore(createMemoryStorage()).load()).resolves.toEqual({});
  });

  test('reads the saved map', async () => {
    const store = createNicknameStore(storageWith(JSON.stringify({ 'AA:BB': 'my headphones' })));
    await expect(store.load()).resolves.toEqual({ 'AA:BB': 'my headphones' });
  });

  test.each(['not json', '[]', '"text"', '42', 'null', 'true'])('gives {} for corrupt data %p', async (raw) => {
    await expect(createNicknameStore(storageWith(raw)).load()).resolves.toEqual({});
  });

  test('drops entries that are not non-empty strings', async () => {
    const raw = JSON.stringify({ good: 'Car keys', number: 5, empty: '   ', nested: { a: 'b' }, nil: null, '': 'x' });
    await expect(createNicknameStore(storageWith(raw)).load()).resolves.toEqual({ good: 'Car keys' });
  });

  test('trims and caps saved names', async () => {
    const raw = JSON.stringify({ a: `  ${'x'.repeat(MAX_NICKNAME_LENGTH + 10)}  ` });
    const loaded = await createNicknameStore(storageWith(raw)).load();
    expect(loaded.a).toHaveLength(MAX_NICKNAME_LENGTH);
  });

  test('a "__proto__" key does not change the prototype', async () => {
    const loaded = await createNicknameStore(storageWith('{"__proto__":"x","a":"Phone"}')).load();
    expect(Object.getPrototypeOf(loaded)).toBe(Object.prototype);
    expect(loaded.a).toBe('Phone');
  });

  test('gives {} when storage fails to read', async () => {
    const failing: KeyValueStorage = {
      getItem: () => Promise.reject(new Error('disk error')),
      setItem: () => Promise.resolve(),
    };
    await expect(createNicknameStore(failing).load()).resolves.toEqual({});
  });
});

describe('set', () => {
  test('saves a trimmed name as JSON under one key and returns the updated map', async () => {
    const storage = createMemoryStorage();
    const store = createNicknameStore(storage);

    await expect(store.set('AA:BB', '  my headphones ')).resolves.toEqual({ 'AA:BB': 'my headphones' });
    await expect(store.set('CC:DD', 'Car keys')).resolves.toEqual({
      'AA:BB': 'my headphones',
      'CC:DD': 'Car keys',
    });

    const raw = await storage.getItem(NICKNAMES_STORAGE_KEY);
    expect(JSON.parse(raw ?? '')).toEqual({ 'AA:BB': 'my headphones', 'CC:DD': 'Car keys' });
    // A new store on the same storage sees the names: they survive an app restart.
    await expect(createNicknameStore(storage).load()).resolves.toEqual({
      'AA:BB': 'my headphones',
      'CC:DD': 'Car keys',
    });
  });

  test('an empty or blank name removes the nickname', async () => {
    const store = createNicknameStore(storageWith(JSON.stringify({ a: 'Phone', b: 'Watch' })));
    await expect(store.set('a', '   ')).resolves.toEqual({ b: 'Watch' });
    await expect(store.set('b', '')).resolves.toEqual({});
    await expect(store.load()).resolves.toEqual({});
  });

  test('removing a name that is not there does not write', async () => {
    const storage = createMemoryStorage();
    const setItem = jest.spyOn(storage, 'setItem');
    await expect(createNicknameStore(storage).set('toString', '')).resolves.toEqual({});
    expect(setItem).not.toHaveBeenCalled();
  });

  test('caps names at MAX_NICKNAME_LENGTH characters', async () => {
    const store = createNicknameStore(createMemoryStorage());
    const result = await store.set('a', 'y'.repeat(100));
    expect(result.a).toBe('y'.repeat(MAX_NICKNAME_LENGTH));
  });

  test('replaces corrupt saved data instead of failing', async () => {
    const store = createNicknameStore(storageWith('{broken'));
    await expect(store.set('a', 'Phone')).resolves.toEqual({ a: 'Phone' });
  });

  test('quick edits in a row all end up saved', async () => {
    const storage = createMemoryStorage();
    const store = createNicknameStore(storage);
    await Promise.all([store.set('a', 'One'), store.set('b', 'Two'), store.set('c', 'Three')]);
    await expect(store.load()).resolves.toEqual({ a: 'One', b: 'Two', c: 'Three' });
  });

  test('rejects and keeps saved names when the read fails, and later edits still work', async () => {
    const storage = storageWith(JSON.stringify({ a: 'Phone' }));
    const getItem = jest.spyOn(storage, 'getItem').mockRejectedValueOnce(new Error('disk error'));
    const store = createNicknameStore(storage);

    await expect(store.set('b', 'Watch')).rejects.toThrow('disk error');
    getItem.mockRestore();
    await expect(store.load()).resolves.toEqual({ a: 'Phone' });
    await expect(store.set('b', 'Watch')).resolves.toEqual({ a: 'Phone', b: 'Watch' });
  });

  test('ignores an empty device id', async () => {
    const storage = createMemoryStorage();
    await expect(createNicknameStore(storage).set('', 'Phone')).resolves.toEqual({});
    await expect(storage.getItem(NICKNAMES_STORAGE_KEY)).resolves.toBeNull();
  });
});

describe('cleanNickname', () => {
  test('trims and keeps short names', () => {
    expect(cleanNickname('  Bike lock ')).toBe('Bike lock');
  });

  test('does not split an emoji when cutting', () => {
    const name = `${'a'.repeat(MAX_NICKNAME_LENGTH - 1)}🎧🎧`;
    expect(cleanNickname(name)).toBe(`${'a'.repeat(MAX_NICKNAME_LENGTH - 1)}🎧`);
  });
});

describe('parseNicknames', () => {
  test('gives {} for null and empty strings', () => {
    expect(parseNicknames(null)).toEqual({});
    expect(parseNicknames('')).toEqual({});
  });
});
