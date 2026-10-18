import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { glow, Neon, Spacing } from '@/constants/theme';
import type { TrackerMatch } from '@/lib/types';

/** Small warning pill, e.g. "⚠ Possible AirTag". Renders null when tracker is null. */
export function TrackerBadge(props: { tracker: TrackerMatch | null; compact?: boolean }): ReactNode {
  const { tracker, compact = false } = props;
  if (!tracker) return null;

  return (
    <View
      style={[styles.pill, compact && styles.pillCompact]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Warning: ${tracker.label}`}>
      <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={1}>
        {`⚠ ${tracker.label}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Neon.danger,
    backgroundColor: 'rgba(255, 77, 109, 0.14)',
    ...glow(Neon.danger, 6),
  },
  pillCompact: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  label: {
    color: Neon.danger,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  labelCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
});
