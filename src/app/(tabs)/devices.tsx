import { useRouter } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeviceRow } from '@/components/device-row';
import { ScanButton } from '@/components/scan-button';
import { ScanStatusCard } from '@/components/scan-status-card';
import { SortFilterBar } from '@/components/sort-filter-bar';
import { StateView } from '@/components/state-view';
import { MaxContentWidth, Neon, Spacing } from '@/constants/theme';
import { useNicknames } from '@/context/nicknames-context';
import { useScan } from '@/context/scan-context';
import { filterDevices, sortDevices } from '@/lib/sort-filter';
import type { DeviceFilter, ScanStatus, SortBy } from '@/lib/types';

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function EmptyState(props: { status: ScanStatus; hasDevices: boolean; onShowAll: () => void }): ReactNode {
  const { status, hasDevices, onShowAll } = props;
  if (hasDevices) {
    return (
      <StateView
        title="No devices match this filter"
        message="None of the devices found so far fit this filter."
        action={{ label: 'Show all', onPress: onShowAll }}
      />
    );
  }
  if (status === 'scanning') {
    return (
      <StateView
        loading
        title="Looking for devices…"
        message="Nearby Bluetooth devices show up here as soon as your phone hears them."
      />
    );
  }
  if (status === 'idle') {
    return (
      <StateView
        title="Tap Start scan to look for nearby Bluetooth devices"
        message="Scanning stays on your phone. Nothing is uploaded."
      />
    );
  }
  // Permission, Bluetooth-off and error states are explained by the status card above.
  return <StateView title="No devices yet" message="Nearby devices will show up here once scanning is running." />;
}

export default function DevicesScreen() {
  const { devices, status } = useScan();
  const { nicknames } = useNicknames();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sortBy, setSortBy] = useState<SortBy>('signal');
  const [filter, setFilter] = useState<DeviceFilter>('all');

  const visible = useMemo(
    () => sortDevices(filterDevices(devices, filter, nicknames), sortBy, { nicknames }),
    [devices, filter, nicknames, sortBy],
  );
  const trackerCount = devices.filter((device) => device.tracker !== null).length;
  const namedCount = filterDevices(devices, 'named', nicknames).length;

  const openDevice = (id: string) => {
    // The object form encodes the id, so ids with ":" (Android MAC addresses) are safe.
    router.push({ pathname: '/device/[id]', params: { id } });
  };

  // Same padding as the About tab: iOS insets a native tab's scroll view by itself, Android needs the top inset.
  const platformPadding = Platform.select({
    ios: { paddingTop: Spacing.three, paddingBottom: Spacing.five },
    // paddingLeft/Right win over the list's paddingHorizontal, so they include it.
    android: {
      paddingTop: insets.top + Spacing.three,
      paddingLeft: insets.left + Spacing.three,
      paddingRight: insets.right + Spacing.three,
      paddingBottom: Spacing.five,
    },
    default: { paddingTop: Spacing.six + Spacing.four, paddingBottom: Spacing.five },
  });

  const header = (
    <View style={styles.header}>
      <View style={styles.intro}>
        <Text style={styles.title} accessibilityRole="header">
          Nearby devices
        </Text>
        <Text style={styles.lead}>
          Bluetooth devices your phone can hear right now. Trackers are listed first.
        </Text>
      </View>
      <ScanStatusCard />
      <ScanButton />
      {devices.length > 0 ? (
        <Text style={styles.summary}>
          {filter === 'all'
            ? `${plural(devices.length, 'device')} found`
            : `Showing ${visible.length} of ${plural(devices.length, 'device')}`}
          {trackerCount > 0 ? (
            <Text style={styles.summaryWarning}>{` · ${plural(trackerCount, 'possible tracker')}`}</Text>
          ) : null}
        </Text>
      ) : null}
      <SortFilterBar
        sortBy={sortBy}
        filter={filter}
        onSortByChange={setSortBy}
        onFilterChange={setFilter}
        counts={{ all: devices.length, trackers: trackerCount, named: namedCount }}
      />
    </View>
  );

  return (
    <FlatList
      style={styles.list}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, platformPadding]}
      data={visible}
      keyExtractor={(device) => device.id}
      renderItem={({ item }) => <DeviceRow device={item} nicknames={nicknames} onPress={openDevice} />}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.headerSpacing}
      ListEmptyComponent={
        <View style={styles.empty}>
          <EmptyState status={status} hasDevices={devices.length > 0} onShowAll={() => setFilter('all')} />
        </View>
      }
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: Neon.background,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
  },
  header: {
    gap: Spacing.three,
  },
  headerSpacing: {
    marginBottom: Spacing.three,
  },
  intro: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  title: {
    color: Neon.text,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: 700,
  },
  lead: {
    color: Neon.textSecondary,
    fontSize: 16,
    lineHeight: 24,
  },
  summary: {
    color: Neon.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 600,
  },
  summaryWarning: {
    color: Neon.danger,
  },
  separator: {
    height: Spacing.two,
  },
  empty: {
    flex: 1,
  },
});
