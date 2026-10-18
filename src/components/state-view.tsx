import type { ReactNode } from 'react';

export interface StateViewProps {
  title: string;
  message?: string;
  /** Shows a spinner above the title. */
  loading?: boolean;
  action?: { label: string; onPress: () => void };
  /** Tints the title, e.g. Neon.danger for errors. */
  tone?: 'info' | 'warning' | 'error';
}

/** Centered empty / loading / error message used by every screen. */
export function StateView(props: StateViewProps): ReactNode {
  throw new Error('not implemented');
}
