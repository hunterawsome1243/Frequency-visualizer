import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { glow, Neon, Spacing } from '@/constants/theme';
import { useScan } from '@/context/scan-context';

export const SCAN_UNSUPPORTED_HINT = "Scanning isn't available here";

/** Start/stop scan toggle that reads useScan(). Disabled with a short hint when the status is "unsupported". */
export function ScanButton(): ReactNode {
  const { status, message, isScanning, start, stop } = useScan();
  const unsupported = status === 'unsupported';
  const starting = !isScanning && status === 'requesting-permission';
  const disabled = unsupported || starting;
  const color = isScanning ? Neon.magenta : Neon.cyan;
  const label = isScanning ? 'Stop scan' : starting ? 'Starting…' : 'Start scan';

  const onPress = () => {
    if (isScanning) {
      stop();
    } else {
      // The hook reports a failed start through status and message, so the promise needs no handling here.
      start().catch(() => undefined);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={unsupported ? (message ?? SCAN_UNSUPPORTED_HINT) : undefined}
        accessibilityState={{ disabled, busy: starting }}
        disabled={disabled}
        onPress={onPress}
        hitSlop={Spacing.one}
        style={({ pressed }) => [
          styles.button,
          { borderColor: disabled ? Neon.border : color },
          !disabled && glow(color, 10),
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}>
        {starting ? (
          <ActivityIndicator size="small" color={Neon.cyan} />
        ) : (
          <View
            style={[
              styles.dot,
              { backgroundColor: disabled ? Neon.textSecondary : color },
              !disabled && glow(color, 6),
            ]}
          />
        )}
        <Text style={[styles.label, { color: disabled ? Neon.textSecondary : color }]}>{label}</Text>
      </Pressable>
      {unsupported && <Text style={styles.hint}>{SCAN_UNSUPPORTED_HINT}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  button: {
    minHeight: 48,
    minWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: Neon.surfaceRaised,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  hint: {
    color: Neon.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.6,
  },
});
