import { useIsFocused, useRouter } from 'expo-router';
import { useState } from 'react';
import { type LayoutChangeEvent, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radar } from '@/components/radar';
import { ScanButton } from '@/components/scan-button';
import { ScanStatusCard } from '@/components/scan-status-card';
import { StateView } from '@/components/state-view';
import { BottomTabInset, glow, MaxContentWidth, Neon, ProximityColors, Spacing } from '@/constants/theme';
import { useNicknames } from '@/context/nicknames-context';
import { useScan } from '@/context/scan-context';
import { useFrozenWhileBlurred } from '@/hooks/use-frozen-while-blurred';
import { blePermissionNote } from '@/lib/scanner';

/** Keeps the radar from getting huge on tablets and wide browser windows. */
const MAX_RADAR_SIZE = 560;
/** With large text the screen scrolls rather than squeezing the radar below this height. */
const MIN_RADAR_AREA_HEIGHT = 220;

export const RADAR_CAPTION =
  'Closer to the centre = stronger signal. Signal strength is only a rough guide to distance.';

const EMPTY_MESSAGE =
  'Tap Start scan to look for Bluetooth devices around you. The radar shows Bluetooth Low Energy devices ' +
  "that are sending signals right now. The app can't see other kinds of radio signals, and nothing is " +
  'uploaded.';

const LEGEND = [
  { label: 'Near', color: ProximityColors.near, tracker: false },
  { label: 'Medium', color: ProximityColors.medium, tracker: false },
  { label: 'Far', color: ProximityColors.far, tracker: false },
  { label: 'Possible tracker', color: Neon.danger, tracker: true },
] as const;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export default function RadarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scan = useScan();
  const { status, isScanning } = scan;
  const focused = useIsFocused();
  // Tabs stay mounted: while another tab or the detail screen is showing, keep the last picture
  // instead of redrawing (and animating) every dot on each update.
  const devices = useFrozenWhileBlurred(scan.devices);
  const { nicknames } = useNicknames();
  const [area, setArea] = useState({ width: 0, height: 0 });

  const trackerCount = devices.filter((device) => device.tracker !== null).length;
  const size = Math.max(0, Math.floor(Math.min(area.width, area.height, MAX_RADAR_SIZE)));
  const showEmpty = status === 'idle' && devices.length === 0;
  const permissionNote = blePermissionNote();
  const emptyMessage = permissionNote ? `${EMPTY_MESSAGE} ${permissionNote}` : EMPTY_MESSAGE;

  // The radar fills the space between the header and the button, and the screen only scrolls when that
  // space gets too small (large text, small phones). iOS draws the tab bar over the screen, so it needs
  // room at the bottom; Android already lays the screen out above it. The scroll view does not add the
  // insets itself (contentInsetAdjustmentBehavior "never"), so they are not counted twice.
  const platformPadding = Platform.select({
    ios: { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + BottomTabInset + Spacing.two },
    android: {
      paddingTop: insets.top + Spacing.two,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: Spacing.three,
    },
    // The web tab bar floats over the top of the page.
    default: { paddingTop: Spacing.six + Spacing.four, paddingBottom: Spacing.four },
  });

  const onRadarAreaLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArea((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  const openDevice = (id: string) => {
    router.push({ pathname: '/device/[id]', params: { id } });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, platformPadding]}
      contentInsetAdjustmentBehavior="never"
      alwaysBounceVertical={false}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Radar
          </Text>
          <Text style={styles.counts} testID="radar-counts">
            {devices.length === 0 ? (
              isScanning ? (
                'Looking for devices…'
              ) : (
                'No devices'
              )
            ) : (
              <>
                {plural(devices.length, 'device', 'devices')}
                {trackerCount > 0 && (
                  <>
                    {' · '}
                    <Text style={styles.trackerCount}>
                      {plural(trackerCount, 'possible tracker', 'possible trackers')}
                    </Text>
                  </>
                )}
              </>
            )}
          </Text>
        </View>

        <ScanStatusCard />

        <View style={styles.radarArea} onLayout={onRadarAreaLayout} testID="radar-area">
          {showEmpty ? (
            <StateView
              title="Nothing on the radar yet"
              message={emptyMessage}
              style={styles.empty}
              testID="radar-empty"
            />
          ) : (
            <Radar
              devices={devices}
              nicknames={nicknames}
              onSelect={openDevice}
              size={size}
              sweeping={isScanning && focused}
              testID="radar"
            />
          )}
        </View>

        <View style={styles.legend} testID="radar-legend">
          {LEGEND.map((item) => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.legendMark, item.tracker && { borderColor: item.color }]}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: item.color },
                    item.tracker && styles.legendTrackerDot,
                    glow(item.color, 4),
                  ]}
                />
              </View>
              <Text style={styles.legendLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.caption}>{RADAR_CAPTION}</Text>

        <ScanButton />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Neon.background,
  },
  content: {
    flexGrow: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  inner: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  title: {
    color: Neon.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
  },
  counts: {
    color: Neon.textSecondary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 600,
  },
  trackerCount: {
    color: Neon.danger,
    fontWeight: 700,
  },
  radarArea: {
    flex: 1,
    minHeight: MIN_RADAR_AREA_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignSelf: 'stretch',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: Spacing.three,
    rowGap: Spacing.one,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
  },
  legendMark: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  legendTrackerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    color: Neon.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  caption: {
    color: Neon.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
