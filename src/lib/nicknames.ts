import type { Nicknames } from './sort-filter';

/** The subset of AsyncStorage the store needs, so tests can pass an in-memory version. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const NICKNAMES_STORAGE_KEY = 'frequency-visualizer/nicknames/v1';
export const MAX_NICKNAME_LENGTH = 40;

export interface NicknameStore {
  /** Loads all nicknames. Corrupt or missing data gives {}. */
  load(): Promise<Nicknames>;
  /** Trims the name; an empty name removes the nickname. Returns the updated map. */
  set(deviceId: string, name: string): Promise<Nicknames>;
}

/** Trims the name and cuts it to MAX_NICKNAME_LENGTH characters, without splitting an emoji in two. */
export function cleanNickname(name: string): string {
  const characters = Array.from(name.trim());
  if (characters.length <= MAX_NICKNAME_LENGTH) return characters.join('');
  return characters.slice(0, MAX_NICKNAME_LENGTH).join('').trimEnd();
}

/** Parses stored JSON, keeping only device id -> non-empty name pairs. Anything else gives {}. */
export function parseNicknames(raw: string | null): Nicknames {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};

  const entries: [string, string][] = [];
  for (const [deviceId, value] of Object.entries(data)) {
    if (deviceId === '' || typeof value !== 'string') continue;
    const name = cleanNickname(value);
    if (name !== '') entries.push([deviceId, name]);
  }
  // fromEntries defines own properties, so a "__proto__" key cannot change the object's prototype.
  return Object.fromEntries(entries);
}

export function createNicknameStore(storage: KeyValueStorage): NicknameStore {
  // Writes run one after another so two quick edits cannot overwrite each other.
  let queue: Promise<unknown> = Promise.resolve();

  async function read(): Promise<Nicknames> {
    return parseNicknames(await storage.getItem(NICKNAMES_STORAGE_KEY));
  }

  return {
    async load() {
      try {
        return await read();
      } catch {
        return {};
      }
    },
    set(deviceId, name) {
      const run = queue.then(async () => {
        // A failed read rejects here instead of writing over the saved names with an empty map.
        const current = await read();
        if (deviceId === '') return current;
        const cleaned = cleanNickname(name);
        const next: Record<string, string> = { ...current };
        if (cleaned === '') {
          if (!Object.prototype.hasOwnProperty.call(next, deviceId)) return current;
          delete next[deviceId];
        } else {
          next[deviceId] = cleaned;
        }
        await storage.setItem(NICKNAMES_STORAGE_KEY, JSON.stringify(next));
        return next as Nicknames;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

/** In-memory KeyValueStorage for tests. */
export function createMemoryStorage(initial?: Record<string, string>): KeyValueStorage {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    async getItem(key) {
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
  };
}
