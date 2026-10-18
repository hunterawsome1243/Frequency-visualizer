import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TrackerBadge } from '@/components/tracker-badge';
import { Fonts, Neon, ProximityColors, Spacing } from '@/constants/theme';
import { rssiToFraction } from '@/lib/chart';
import { isUsableRssi, proximityLabel, rssiToProximity } from '@/lib/proximity';
import { displayName, type Nicknames } from '@/lib/sort-filter';
import type { ScannedDevice } from '@/lib/types';

export interface DeviceRowProps {
  device: ScannedDevice;
  /** Nicknames by device id; a nickname is shown instead of the advertised name. */
  nicknames?: Nicknames;
  onPress?: (deviceId: string) => void;
}

/** One device in the list: name, id, signal, rough proximity and a tracker warning if there is one. */
export function DeviceRow({ device, nicknames, onPress }: DeviceRowProps): ReactNode {
  const name = displayName(device, nicknames);
  const proximity = rssiToProximity(device.rssi);
  const color = ProximityColors[proximity];
  const rssiText = isUsableRssi(device.rssi) ? `${Math.round(device.rssi)} dBm` : 'No signal reading';
  const fraction = rssiToFraction(device.rssi);
  const { tracker } = device;

  const accessibilityLabel = [
    tracker ? `Warning: ${tracker.label}` : null,
    name,
    rssiText,
    `proximity ${proximityLabel(proximity)}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress ? () => onPress(device.id) : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Shows details and signal over time"
      style={({ pressed }) => [styles.row, tracker && styles.trackerRow, pressed && styles.pressed]}>
      <View style={styles.main}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.id} numberOfLines={1}>
          {device.id}
        </Text>
        <TrackerBadge tracker={tracker} compact />
      </View>

      <View style={styles.signal}>
        <Text style={styles.rssi}>{rssiText}</Text>
        <Text style={[styles.proximity, { color }]}>{proximityLabel(proximity)}</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.round(fraction * 100)}%`, backgroundColor: color }]} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: Neon.border,
    borderLeftColor: Neon.border,
    backgroundColor: Neon.surface,
  },
  trackerRow: {
    borderLeftColor: Neon.danger,
  },
  pressed: {
    backgroundColor: Neon.surfaceRaised,
  },
  main: {
    flex: 1,
    gap: Spacing.one,
  },
  name: {
    color: Neon.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 600,
  },
  id: {
    color: Neon.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 16,
  },
  signal: {
    alignItems: 'flex-end',
    gap: Spacing.one,
    minWidth: 76,
  },
  rssi: {
    color: Neon.text,
    fontFamily: Fonts.mono,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 600,
  },
  proximity: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  barTrack: {
    width: 64,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: Neon.border,
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
});
