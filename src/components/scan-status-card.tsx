import type { ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/state-view';
import { glow, Neon, Spacing } from '@/constants/theme';
import { useScan } from '@/context/scan-context';
import type { ScanStatus } from '@/lib/types';

export const PERMISSION_DENIED_FALLBACK =
  "The app isn't allowed to use Bluetooth, so it can't look for nearby devices. You can allow it in Settings.";
export const BLUETOOTH_OFF_FALLBACK = 'Turn on Bluetooth to scan for nearby devices.';
export const UNSUPPORTED_FALLBACK =
  'Bluetooth scanning needs a development build of this app on a real phone. It does not work in Expo Go, a simulator or a web browser.';
export const ERROR_FALLBACK = 'Something went wrong while scanning.';

/** Short plain-language label and colour for a scan status, e.g. for a status pill. */
export function describeScanStatus(status: ScanStatus): { label: string; color: string } {
  switch (status) {
    case 'idle':
      return { label: 'Not scanning', color: Neon.textSecondary };
    case 'requesting-permission':
      return { label: 'Asking for permission…', color: Neon.cyan };
    case 'scanning':
      return { label: 'Allowed and scanning', color: Neon.green };
    case 'permission-denied':
      return { label: 'Permission not given', color: Neon.amber };
    case 'bluetooth-off':
      return { label: 'Bluetooth is off', color: Neon.amber };
    case 'unsupported':
      return { label: 'Not available here', color: Neon.textSecondary };
    case 'error':
      return { label: 'Something went wrong', color: Neon.danger };
  }
}

/** Opens this app's page in the phone's Settings. Does nothing on the web, which has no such page. */
export function openAppSettings(): void {
  if (Platform.OS === 'web') return;
  Linking.openSettings().catch(() => undefined);
}

interface CardAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

/**
 * Reads useScan() and shows what the user needs to do for the current status: allow Bluetooth
 * (permission-denied, with an "Open settings" button), turn Bluetooth on, use a development build
 * (unsupported), an error with retry, or nothing while scanning. Renders null when there is nothing to say.
 */
export function ScanStatusCard(): ReactNode {
  const { status, message, start } = useScan();

  // The hook reports a failed start through status and message, so the promise needs no handling here.
  const retry = () => {
    start().catch(() => undefined);
  };

  switch (status) {
    case 'idle':
    case 'scanning':
      return null;
    case 'requesting-permission':
      return (
        <View style={[styles.card, styles.row]} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={Neon.cyan} testID="scan-status-spinner" />
          <Text style={styles.message}>Asking for Bluetooth permission…</Text>
        </View>
      );
    case 'permission-denied':
      return (
        <Card
          color={Neon.amber}
          title="Bluetooth permission needed"
          message={message ?? PERMISSION_DENIED_FALLBACK}
          actions={[
            ...(Platform.OS === 'web' ? [] : [{ label: 'Open settings', onPress: openAppSettings }]),
            { label: 'Try again', onPress: retry, variant: 'secondary' },
          ]}
        />
      );
    case 'bluetooth-off':
      return (
        <Card
          color={Neon.amber}
          title="Bluetooth is off"
          message={message ?? BLUETOOTH_OFF_FALLBACK}
          actions={[{ label: 'Try again', onPress: retry }]}
        />
      );
    case 'unsupported':
      return (
        <Card
          color={Neon.cyan}
          title="Scanning isn't available here"
          message={message ?? UNSUPPORTED_FALLBACK}
          actions={[]}
        />
      );
    case 'error':
      return (
        <Card
          color={Neon.danger}
          title="Scan stopped"
          message={message ?? ERROR_FALLBACK}
          actions={[{ label: 'Try again', onPress: retry }]}
        />
      );
  }
}

function Card({
  color,
  title,
  message,
  actions,
}: {
  color: string;
  title: string;
  message: string;
  actions: CardAction[];
}) {
  return (
    <View
      style={[styles.card, { borderColor: color }, glow(color, 6)]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite">
      <Text style={[styles.title, { color }]}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actions.length > 0 && (
        <View style={styles.actions}>
          {actions.map((action) => (
            <ActionButton
              key={action.label}
              label={action.label}
              onPress={action.onPress}
              variant={action.variant}
              color={color}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Neon.surface,
    borderColor: Neon.border,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 700,
  },
  message: {
    flexShrink: 1,
    color: Neon.text,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
});
