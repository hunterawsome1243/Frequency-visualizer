import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NicknameEditor } from '@/components/nickname-editor';
import { RssiChart } from '@/components/rssi-chart';
import { ScanButton } from '@/components/scan-button';
import { StateView } from '@/components/state-view';
import { TrackerBadge } from '@/components/tracker-badge';
import { Fonts, MaxContentWidth, Neon, ProximityColors, Spacing } from '@/constants/theme';
import { useNicknames } from '@/context/nicknames-context';
import { useScan } from '@/context/scan-context';
import { base64ToBytes, bytesToHex } from '@/lib/base64';
import { formatTimeAgo } from '@/lib/chart';
import { isUsableRssi, proximityLabel, rssiToProximity } from '@/lib/proximity';
import { displayName } from '@/lib/sort-filter';
import type { ScannedDevice, TrackerMatch } from '@/lib/types';

/** Ticks every intervalMs, so "last seen" times keep counting up even when no new readings arrive. */
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {props.title}
      </Text>
      {props.children}
    </View>
  );
}

function Bullet(props: { children: ReactNode }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletDot} />
      <Text style={[styles.body, styles.bulletText]}>{props.children}</Text>
    </View>
  );
}

function DetailRow(props: { label: string; value: string; mono?: boolean }) {
  const { label, value, mono = false } = props;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, mono && styles.mono]} selectable>
        {value}
      </Text>
    </View>
  );
}

function TrackerSection({ tracker }: { tracker: TrackerMatch }) {
  return (
    <View style={[styles.section, styles.trackerSection]}>
      <TrackerBadge tracker={tracker} />
      <Text style={[styles.body, styles.strong]}>{tracker.reason}</Text>
      <Text style={styles.body}>
        This is a best guess from the Bluetooth signal, not a sure match. Your own things, or other
        people&apos;s nearby, can show up here too.
      </Text>
      <Text style={styles.subheading}>If you&apos;re worried</Text>
      <Bullet>Check your bags, pockets, coat and car for an item you don&apos;t know.</Bullet>
      <Bullet>On iPhone, Find My may alert you if an unknown AirTag is moving with you.</Bullet>
      <Bullet>On Android, turn on Settings &gt; Safety &amp; emergency &gt; Unknown tracker alerts.</Bullet>
      <Bullet>If you feel unsafe, contact the police.</Bullet>
    </View>
  );
}

function TechnicalDetails({ device, now }: { device: ScannedDevice; now: number }) {
  const ad = device.advertisement;
  const manufacturerHex = bytesToHex(base64ToBytes(ad.manufacturerData));
  const serviceDataKeys = ad.serviceData ? Object.keys(ad.serviceData) : [];
  const connectable = ad.isConnectable === null ? 'Unknown' : ad.isConnectable ? 'Yes' : 'No';

  return (
    <Section title="Technical details">
      <DetailRow label="ID" value={device.id} mono />
      <DetailRow label="Advertised name" value={ad.name?.trim() || 'None'} />
      <DetailRow label="Local name" value={ad.localName?.trim() || 'None'} />
      {/* Like RSSI, 127 means "not available" for TX power. */}
      <DetailRow
        label="TX power"
        value={isUsableRssi(ad.txPowerLevel) ? `${ad.txPowerLevel} dBm` : 'Not advertised'}
      />
      <DetailRow label="Connectable" value={connectable} />
      <DetailRow label="Manufacturer data" value={manufacturerHex || 'None'} mono={manufacturerHex !== ''} />
      <DetailRow
        label="Service UUIDs"
        value={ad.serviceUUIDs && ad.serviceUUIDs.length > 0 ? ad.serviceUUIDs.join('\n') : 'None'}
        mono={!!ad.serviceUUIDs && ad.serviceUUIDs.length > 0}
      />
      <DetailRow
        label="Service data"
        value={serviceDataKeys.length > 0 ? serviceDataKeys.join('\n') : 'None'}
        mono={serviceDataKeys.length > 0}
      />
      <DetailRow label="First seen" value={formatTimeAgo(device.firstSeen, now)} />
      <DetailRow label="Last seen" value={formatTimeAgo(device.lastSeen, now)} />
    </Section>
  );
}

export default function DeviceDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { devices, isScanning } = useScan();
  const { nicknames } = useNicknames();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const device = devices.find((candidate) => candidate.id === id);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/devices');
  };

  if (!device) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: 'Device details' }} />
        <StateView
          title="This device is out of range"
          message={
            "Your phone hasn't heard from it recently. It may have moved away or switched off, or it may " +
            'now be using a new Bluetooth address, which many devices change often for privacy.'
          }
          action={{ label: 'Back', onPress: goBack }}
        />
      </View>
    );
  }

  const name = displayName(device, nicknames);
  const proximity = rssiToProximity(device.rssi);
  const color = ProximityColors[proximity];
  const rssi = isUsableRssi(device.rssi) ? Math.round(device.rssi) : null;

  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.five }]}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          <View
            style={[styles.section, styles.hero]}
            accessible
            accessibilityLabel={
              rssi !== null
                ? `Signal ${rssi} dBm. Estimated distance: ${proximityLabel(proximity)}.`
                : 'No signal reading yet.'
            }>
            <View style={styles.reading}>
              <Text style={[styles.rssi, { color, textShadowColor: color }]}>{rssi ?? '—'}</Text>
              <Text style={styles.unit}>dBm</Text>
            </View>
            <Text style={styles.proximityCaption}>
              Estimated distance: <Text style={[styles.proximity, { color }]}>{proximityLabel(proximity)}</Text>
            </Text>
            <Text style={styles.note}>Signal strength is a rough guide to distance, not a measurement.</Text>
          </View>

          {isScanning ? null : (
            <View style={[styles.section, styles.paused]}>
              <Text style={styles.body}>Scanning is stopped, so these readings are not updating.</Text>
              <ScanButton />
            </View>
          )}

          {device.tracker ? <TrackerSection tracker={device.tracker} /> : null}

          <Section title="Signal over time">
            <RssiChart samples={device.rssiHistory} now={now} />
            <Text style={styles.note}>
              Higher is stronger. Dashed lines mark where near turns to medium, and medium to far.
            </Text>
          </Section>

          <Section title="Nickname">
            <NicknameEditor deviceId={device.id} />
          </Section>

          <TechnicalDetails device={device} now={now} />

          <Text style={styles.footer}>Everything on this screen stays on your phone. Nothing is uploaded.</Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Neon.background,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: Spacing.three,
  },
  inner: {
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  section: {
    backgroundColor: Neon.surface,
    borderColor: Neon.border,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionTitle: {
    color: Neon.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 700,
    marginBottom: Spacing.one,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: Spacing.four,
  },
  reading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  rssi: {
    fontFamily: Fonts.mono,
    fontSize: 56,
    lineHeight: 64,
    fontWeight: 700,
    textShadowRadius: 12,
  },
  unit: {
    color: Neon.textSecondary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 600,
  },
  proximityCaption: {
    color: Neon.textSecondary,
    fontSize: 16,
    lineHeight: 24,
  },
  proximity: {
    fontWeight: 700,
  },
  note: {
    color: Neon.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  paused: {
    alignItems: 'center',
    borderColor: Neon.amber,
  },
  trackerSection: {
    borderColor: Neon.danger,
    borderLeftWidth: 4,
  },
  subheading: {
    color: Neon.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: 700,
    marginTop: Spacing.one,
  },
  body: {
    color: Neon.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  strong: {
    color: Neon.text,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: Neon.danger,
  },
  bulletText: {
    flex: 1,
  },
  detailRow: {
    gap: Spacing.half,
    paddingVertical: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Neon.border,
  },
  detailLabel: {
    color: Neon.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    color: Neon.text,
    fontSize: 15,
    lineHeight: 22,
  },
  mono: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    lineHeight: 20,
  },
  footer: {
    color: Neon.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingVertical: Spacing.two,
  },
});
