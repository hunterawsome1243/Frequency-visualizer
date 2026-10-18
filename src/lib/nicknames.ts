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

export function createNicknameStore(storage: KeyValueStorage): NicknameStore {
  throw new Error('not implemented');
}

/** In-memory KeyValueStorage for tests. */
export function createMemoryStorage(initial?: Record<string, string>): KeyValueStorage {
  throw new Error('not implemented');
}
