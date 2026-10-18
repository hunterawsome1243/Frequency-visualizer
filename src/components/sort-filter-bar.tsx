import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Neon, Spacing } from '@/constants/theme';
import type { DeviceFilter, SortBy } from '@/lib/types';

export interface SortFilterBarProps {
  sortBy: SortBy;
  filter: DeviceFilter;
  onSortByChange: (sortBy: SortBy) => void;
  onFilterChange: (filter: DeviceFilter) => void;
  /** Optional device counts shown on the filter chips, e.g. "Trackers 2". */
  counts?: Partial<Record<DeviceFilter, number>>;
}

interface Option<T extends string> {
  value: T;
  label: string;
  /** Colour of the chip when it is selected. */
  accent: string;
}

const SORT_OPTIONS: readonly Option<SortBy>[] = [
  { value: 'signal', label: 'Signal', accent: Neon.cyan },
  { value: 'name', label: 'Name', accent: Neon.cyan },
];

const FILTER_OPTIONS: readonly Option<DeviceFilter>[] = [
  { value: 'all', label: 'All', accent: Neon.cyan },
  { value: 'trackers', label: 'Trackers', accent: Neon.danger },
  { value: 'named', label: 'Named', accent: Neon.cyan },
];

function Chip(props: { label: string; count?: number; accent: string; selected: boolean; onPress: () => void }) {
  const { label, count, accent, selected, onPress } = props;
  const hasCount = typeof count === 'number';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={hasCount ? `${label}, ${count} ${count === 1 ? 'device' : 'devices'}` : label}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        selected && { borderColor: accent, backgroundColor: `${accent}22` },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.chipLabel, selected && { color: accent }]}>
        {label}
        {hasCount ? <Text style={styles.chipCount}>{` ${count}`}</Text> : null}
      </Text>
    </Pressable>
  );
}

function ChipGroup<T extends string>(props: {
  title: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  counts?: Partial<Record<T, number>>;
}) {
  const { title, options, value, onChange, counts } = props;
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={title}>
      <Text style={styles.groupTitle} importantForAccessibility="no" accessibilityElementsHidden>
        {title}
      </Text>
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          count={counts?.[option.value]}
          accent={option.accent}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}

/** Chips to sort the device list by signal or name, and to show all, only trackers or only named devices. */
export function SortFilterBar(props: SortFilterBarProps): ReactNode {
  const { sortBy, filter, onSortByChange, onFilterChange, counts } = props;
  return (
    <View style={styles.bar}>
      <ChipGroup title="Sort" options={SORT_OPTIONS} value={sortBy} onChange={onSortByChange} />
      <ChipGroup title="Show" options={FILTER_OPTIONS} value={filter} onChange={onFilterChange} counts={counts} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.four,
    rowGap: Spacing.two,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  groupTitle: {
    color: Neon.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + Spacing.half,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Neon.border,
    backgroundColor: Neon.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  chipLabel: {
    color: Neon.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 600,
  },
  chipCount: {
    fontWeight: 400,
  },
});
