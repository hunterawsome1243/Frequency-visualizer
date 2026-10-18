import type { ReactNode } from 'react';

import type { KeyValueStorage } from '@/lib/nicknames';
import type { Nicknames } from '@/lib/sort-filter';

export interface NicknamesState {
  nicknames: Nicknames;
  loaded: boolean;
  setNickname(deviceId: string, name: string): Promise<void>;
}

/** Loads nicknames from AsyncStorage (or the storage passed in, for tests) and shares them. */
export function NicknamesProvider(props: { children: ReactNode; storage?: KeyValueStorage }): ReactNode {
  throw new Error('not implemented');
}

/** Throws if used outside NicknamesProvider. */
export function useNicknames(): NicknamesState {
  throw new Error('not implemented');
}
