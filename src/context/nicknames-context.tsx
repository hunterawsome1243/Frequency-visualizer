import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  cleanNickname,
  createMemoryStorage,
  createNicknameStore,
  type KeyValueStorage,
  type NicknameStore,
} from '@/lib/nicknames';
import type { Nicknames } from '@/lib/sort-filter';

export interface NicknamesState {
  nicknames: Nicknames;
  loaded: boolean;
  setNickname(deviceId: string, name: string): Promise<void>;
}

const NicknamesContext = createContext<NicknamesState | null>(null);
NicknamesContext.displayName = 'NicknamesContext';

/**
 * AsyncStorage keeps the names on this phone only. It is loaded lazily because importing it throws
 * when its native module is missing (as in Jest); the names then live in memory for this session.
 */
function defaultStorage(): KeyValueStorage {
  try {
    const asyncStorage =
      require('@react-native-async-storage/async-storage') as typeof import('@react-native-async-storage/async-storage');
    return asyncStorage.default;
  } catch {
    return createMemoryStorage();
  }
}

function withNickname(nicknames: Nicknames, deviceId: string, name: string): Nicknames {
  const cleaned = cleanNickname(name);
  const next: Record<string, string> = { ...nicknames };
  if (cleaned === '') delete next[deviceId];
  else next[deviceId] = cleaned;
  return next;
}

/** Loads nicknames from AsyncStorage (or the storage passed in, for tests) and shares them. */
export function NicknamesProvider(props: { children: ReactNode; storage?: KeyValueStorage }): ReactNode {
  const { storage } = props;
  const store: NicknameStore = useMemo(() => createNicknameStore(storage ?? defaultStorage()), [storage]);
  const [nicknames, setNicknames] = useState<Nicknames>({});
  const [loaded, setLoaded] = useState(false);
  /** Bumped on every edit, so only the newest save result is applied and a slow load cannot undo an edit. */
  const editVersion = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const versionAtLoad = editVersion.current;
    store.load().then((saved) => {
      if (cancelled) return;
      if (editVersion.current === versionAtLoad) setNicknames(saved);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const setNickname = useCallback(
    async (deviceId: string, name: string): Promise<void> => {
      if (deviceId === '') return;
      editVersion.current += 1;
      const version = editVersion.current;
      // Show the change straight away, cleaned the same way the store saves it.
      setNicknames((current) => withNickname(current, deviceId, name));
      let saved: Nicknames;
      try {
        saved = await store.set(deviceId, name);
      } catch {
        // Saving failed: go back to what is really stored so the screen never shows an unsaved name.
        saved = await store.load();
      }
      if (editVersion.current === version) setNicknames(saved);
    },
    [store],
  );

  const value = useMemo<NicknamesState>(
    () => ({ nicknames, loaded, setNickname }),
    [nicknames, loaded, setNickname],
  );

  return <NicknamesContext value={value}>{props.children}</NicknamesContext>;
}

/** Throws if used outside NicknamesProvider. */
export function useNicknames(): NicknamesState {
  const state = useContext(NicknamesContext);
  if (state === null) throw new Error('useNicknames() must be used inside <NicknamesProvider>.');
  return state;
}
