import { useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openAppSettings, openLocationSettings } from '@/components/scan-status-card';
import { ActionButton, StateView } from '@/components/state-view';
import { WifiRow } from '@/components/wifi-row';
import { BottomTabInset, MaxContentWidth, Neon, Spacing } from '@/constants/theme';
import type { WifiNetwork } from '@/lib/types';
import {
  isWifiScanSupported,
  scanWifi,
  WIFI_DEV_BUILD_MESSAGE,
  WIFI_LOCATION_OFF_MESSAGE,
  WIFI_SCAN_FAILED_MESSAGE,
  WIFI_WEB_MESSAGE,
  type WifiScanResult,
} from '@/lib/wifi-scanner';

export const WIFI_THROTTLE_NOTE =
  'Android limits how often apps can scan for Wi-Fi, so results may be a few seconds old.';
export const WIFI_CACHED_NOTE =
  "Android didn't allow a new scan just now, so these are the last results it had. Try again in a minute.";

const IDLE_MESSAGE =
  'Tap Scan Wi-Fi to list the networks around you. Android asks for location access first, because ' +
  "Wi-Fi scans can reveal where you are. The app doesn't save your location.";

type Problem = Exclude<WifiScanResult, { status: 'ok' }>;

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function WifiScreen() {
  const insets = useSafeAreaInsets();
  const [supported] = useState(isWifiScanSupported);

  // Android lays the screen out above the tab bar but not below the status bar; iOS draws its tab bar over
  // the screen; the web tab bar floats over the top of the page.
  const padding: ViewStyle = Platform.select<ViewStyle>({
    ios: { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + BottomTabInset + Spacing.three },
    // paddingLeft/Right win over the list's paddingHorizontal, so they include it.
    android: {
      paddingTop: insets.top + Spacing.three,
      paddingLeft: insets.left + Spacing.three,
      paddingRight: insets.right + Spacing.three,
      paddingBottom: Spacing.five,
    },
    default: { paddingTop: Spacing.six + Spacing.four, paddingBottom: Spacing.five },
  });

  if (!supported) return <WifiUnavailable padding={padding} />;
  return <WifiScanner padding={padding} />;
}

function WifiUnavailable({ padding }: { padding: ViewStyle }) {
  const content =
    Platform.OS === 'ios'
      ? {
          title: "Wi-Fi scanning isn't available on iPhone",
          message: "iOS doesn't let apps scan for nearby Wi-Fi networks. Bluetooth scanning still works.",
        }
      : Platform.OS === 'web'
        ? {
            title: "Wi-Fi scanning isn't available in a browser",
            message: `${WIFI_WEB_MESSAGE} Bluetooth scanning needs the app too.`,
          }
        : {
            title: 'Wi-Fi scanning needs a development build',
            message: `${WIFI_DEV_BUILD_MESSAGE} Install one on your Android phone to see nearby networks.`,
          };

  return (
    <View style={[styles.screen, padding]}>
      <StateView title={content.title} message={content.message} testID="wifi-unavailable" />
    </View>
  );
}

function WifiScanner({ padding }: { padding: ViewStyle }) {
  const [networks, setNetworks] = useState<WifiNetwork[] | null>(null);
  const [cached, setCached] = useState(false);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  /** Guards against a second scan starting while one is running (a tap and a pull at the same time). */
  const busy = useRef(false);

  const scan = async () => {
    if (busy.current) return;
    busy.current = true;
    setScanning(true);
    let result: WifiScanResult;
    try {
      result = await scanWifi();
    } catch {
      result = { status: 'error', message: WIFI_SCAN_FAILED_MESSAGE };
    }
    busy.current = false;
    setScanning(false);
    if (result.status === 'ok') {
      setNetworks(result.networks);
      setCached(result.cached === true);
      setScannedAt(Date.now());
      setProblem(null);
    } else {
      setProblem(result);
    }
  };

  const startScan = () => {
    scan().catch(() => undefined);
  };

  const hasResults = networks !== null;
  const count = networks?.length ?? 0;

  const header = (
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">
        Wi-Fi networks
      </Text>
      <Text style={styles.lead}>
        Nearby Wi-Fi networks your phone can hear, with their signal strength and channel. Scans stay on
        your phone.
      </Text>

      <View style={styles.toolbar}>
        <ActionButton
          label={scanning ? 'Scanning…' : hasResults ? 'Scan again' : 'Scan Wi-Fi'}
          onPress={startScan}
          disabled={scanning}
          testID="wifi-scan-button"
        />
        {hasResults && scannedAt !== null && (
          <Text style={styles.meta} accessibilityLiveRegion="polite">
            {count === 1 ? '1 network' : `${count} networks`} · Updated {formatTime(scannedAt)}
          </Text>
        )}
      </View>

      <Text style={styles.note}>{WIFI_THROTTLE_NOTE}</Text>

      {hasResults && cached && !problem && (
        <Text style={[styles.note, styles.warning]} testID="wifi-cached-note">
          {WIFI_CACHED_NOTE}
        </Text>
      )}

      {hasResults && problem && <ProblemBanner problem={problem} onRetry={startScan} />}
    </View>
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={[styles.content, padding]}
      data={networks ?? []}
      keyExtractor={(item, index) => (item.bssid !== '' ? item.bssid : `${item.ssid}-${index}`)}
      renderItem={({ item }) => <WifiRow network={item} />}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.headerSpacing}
      ListEmptyComponent={
        <EmptyState scanning={scanning} hasResults={hasResults} problem={problem} onRetry={startScan} />
      }
      refreshControl={
        <RefreshControl
          refreshing={scanning && hasResults}
          onRefresh={startScan}
          tintColor={Neon.cyan}
          colors={[Neon.cyan]}
          progressBackgroundColor={Neon.surface}
          progressViewOffset={typeof padding.paddingTop === 'number' ? padding.paddingTop : 0}
        />
      }
      testID="wifi-list"
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

function EmptyState({
  scanning,
  hasResults,
  problem,
  onRetry,
}: {
  scanning: boolean;
  hasResults: boolean;
  problem: Problem | null;
  onRetry: () => void;
}) {
  if (scanning && !hasResults) {
    return (
      <StateView
        loading
        title="Scanning for Wi-Fi networks…"
        message="This can take a few seconds."
        testID="wifi-loading"
      />
    );
  }
  if (problem && !hasResults) return <ProblemState problem={problem} onRetry={onRetry} />;
  if (hasResults) {
    return (
      <StateView
        title="No Wi-Fi networks found"
        message="Make sure Wi-Fi is turned on, then pull down or tap Scan again."
        testID="wifi-empty"
      />
    );
  }
  return (
    <StateView
      title="See nearby Wi-Fi networks"
      message={IDLE_MESSAGE}
      testID="wifi-idle"
    />
  );
}

/** Full-screen message for a failed first scan. */
function ProblemState({ problem, onRetry }: { problem: Problem; onRetry: () => void }) {
  const denied = problem.status === 'permission-denied';
  const locationOff = problem.message === WIFI_LOCATION_OFF_MESSAGE;
  const title = denied
    ? 'Location permission needed'
    : locationOff
      ? 'Location is turned off'
      : problem.status === 'unsupported'
        ? "Wi-Fi scanning isn't available here"
        : "Couldn't scan for Wi-Fi";

  return (
    <View style={styles.problem} testID="wifi-problem">
      <StateView
        title={title}
        message={problem.message}
        tone={problem.status === 'error' && !locationOff ? 'error' : 'warning'}
        style={styles.problemText}
      />
      {problem.status !== 'unsupported' && (
        <ProblemActions denied={denied} locationOff={locationOff} onRetry={onRetry} />
      )}
    </View>
  );
}

/** Smaller notice above the list when a refresh fails but older results are still shown. */
function ProblemBanner({ problem, onRetry }: { problem: Problem; onRetry: () => void }) {
  const denied = problem.status === 'permission-denied';
  const locationOff = problem.message === WIFI_LOCATION_OFF_MESSAGE;
  const color = problem.status === 'error' && !locationOff ? Neon.danger : Neon.amber;

  return (
    <View style={[styles.banner, { borderColor: color }]} accessibilityRole="alert" testID="wifi-problem-banner">
      <Text style={[styles.bannerTitle, { color }]}>Showing earlier results</Text>
      <Text style={styles.bannerText}>{problem.message}</Text>
      {problem.status !== 'unsupported' && (
        <ProblemActions denied={denied} locationOff={locationOff} onRetry={onRetry} />
      )}
    </View>
  );
}

function ProblemActions({
  denied,
  locationOff,
  onRetry,
}: {
  denied: boolean;
  locationOff: boolean;
  onRetry: () => void;
}) {
  return (
    <View style={styles.actions}>
      {denied && <ActionButton label="Open settings" onPress={openAppSettings} color={Neon.amber} />}
      {locationOff && (
        <ActionButton label="Open location settings" onPress={openLocationSettings} color={Neon.amber} />
      )}
      <ActionButton
        label="Try again"
        onPress={onRetry}
        variant={denied || locationOff ? 'secondary' : 'primary'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Neon.background,
    paddingHorizontal: Spacing.three,
  },
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
    gap: Spacing.two,
  },
  headerSpacing: {
    marginBottom: Spacing.three,
  },
  title: {
    color: Neon.text,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: 700,
  },
  lead: {
    color: Neon.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  meta: {
    color: Neon.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 600,
  },
  note: {
    color: Neon.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  warning: {
    color: Neon.amber,
  },
  separator: {
    height: Spacing.two,
  },
  problem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  problemText: {
    flex: 0,
    paddingBottom: 0,
  },
  banner: {
    backgroundColor: Neon.surface,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  bannerTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 700,
  },
  bannerText: {
    color: Neon.text,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
  },
});
