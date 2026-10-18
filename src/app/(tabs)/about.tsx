import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BLUETOOTH_OFF_FALLBACK,
  describeScanStatus,
  ERROR_FALLBACK,
  openAppSettings,
  PERMISSION_DENIED_FALLBACK,
  UNSUPPORTED_FALLBACK,
} from '@/components/scan-status-card';
import { ActionButton } from '@/components/state-view';
import { glow, MaxContentWidth, Neon, Spacing } from '@/constants/theme';
import { useScan } from '@/context/scan-context';
import type { ScanStatus } from '@/lib/types';

const STATUS_FALLBACKS: Partial<Record<ScanStatus, string>> = {
  'permission-denied': PERMISSION_DENIED_FALLBACK,
  'bluetooth-off': BLUETOOTH_OFF_FALLBACK,
  unsupported: UNSUPPORTED_FALLBACK,
  error: ERROR_FALLBACK,
};

export default function AboutScreen() {
  const insets = useSafeAreaInsets();

  // iOS insets the first scroll view of a native tab by itself; Android only adds the bottom inset.
  const platformPadding = Platform.select({
    ios: { paddingTop: Spacing.three, paddingBottom: Spacing.five },
    android: {
      paddingTop: insets.top + Spacing.three,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: Spacing.five,
    },
    // The web tab bar floats over the top of the page.
    default: { paddingTop: Spacing.six + Spacing.four, paddingBottom: Spacing.five },
  });

  return (
    <ScrollView
      style={styles.scrollView}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, platformPadding]}>
      <View style={styles.inner}>
        <View style={styles.intro}>
          <Text style={styles.title} accessibilityRole="header">
            About & permissions
          </Text>
          <Text style={styles.lead}>
            Frequency Visualizer shows the wireless signals your phone&apos;s own radios can pick up.
            Here is what that covers, what it doesn&apos;t, and why the app asks for permission.
          </Text>
        </View>

        <PermissionSection />

        <Section title="What it can detect" accent={Neon.green}>
          <Bullet color={Neon.green}>
            <Strong>Bluetooth Low Energy devices that are advertising,</Strong> such as headphones,
            watches, fitness bands, smart home gadgets and item trackers like AirTag or Tile.
          </Bullet>
          <Bullet color={Neon.green}>
            <Strong>How strong each signal is</Strong> (RSSI, in dBm). A stronger signal usually means
            the device is closer.
          </Bullet>
          <Bullet color={Neon.green}>
            <Strong>On Android: nearby Wi-Fi networks,</Strong> with their signal strength and channel.
          </Bullet>
        </Section>

        <Section title="What it can't detect" accent={Neon.magenta}>
          <Bullet color={Neon.magenta}>
            <Strong>The electromagnetic spectrum.</Strong> Phones can&apos;t measure the
            electromagnetic spectrum. The app can&apos;t see radio stations, mobile networks,
            microwave ovens or power lines. It only shows the Bluetooth and Wi-Fi signals that the
            phone&apos;s own radios decode.
          </Bullet>
          <Bullet color={Neon.magenta}>
            <Strong>Devices that aren&apos;t advertising.</Strong> A device that is off, asleep or not
            sending Bluetooth Low Energy signals right now won&apos;t show up. Many devices go quiet
            once they are connected to a phone.
          </Bullet>
          <Bullet color={Neon.magenta}>
            <Strong>Exact distance.</Strong> Signal strength is only a rough guide. Walls, bodies,
            pockets and each device&apos;s own power all change it, so &quot;near&quot;,
            &quot;medium&quot; and &quot;far&quot; are estimates.
          </Bullet>
          <Bullet color={Neon.magenta}>
            <Strong>Trackers, for certain.</Strong> Tracker detection is best effort. It looks for
            known patterns in Bluetooth data, so it can miss a tracker or flag a harmless device. A
            label like &quot;Possible AirTag&quot; is a hint, not proof.
          </Bullet>
          <Bullet color={Neon.magenta}>
            <Strong>AirTags on iPhone.</Strong> iOS hides the Bluetooth data that marks AirTags and
            other Find My devices from apps, so on an iPhone they usually appear only as unnamed
            devices with no tracker label. Tile, SmartTag, Chipolo and Google Find Hub tags can still
            be flagged. For AirTags, the iPhone&apos;s own Find My alerts are the better check.
          </Bullet>
          <Bullet color={Neon.magenta}>
            <Strong>Wi-Fi on iPhone.</Strong> iOS doesn&apos;t let apps scan for Wi-Fi networks, so
            Wi-Fi scanning only works on Android.
          </Bullet>
        </Section>

        <Section title="Your privacy" accent={Neon.cyan}>
          <Bullet color={Neon.cyan}>
            <Strong>Scans stay on your phone.</Strong> Nothing is uploaded, and there is no account
            or server.
          </Bullet>
          <Bullet color={Neon.cyan}>
            Scanning pauses when you leave the app and starts again when you come back.
          </Bullet>
          <Bullet color={Neon.cyan}>Nicknames you give devices are saved only on this phone.</Bullet>
          <Bullet color={Neon.cyan}>
            The app doesn&apos;t record or share where you are, even when Android asks for location
            access.
          </Bullet>
        </Section>

        <Section title="Worried about a tracker?" accent={Neon.amber}>
          <Bullet color={Neon.amber}>
            If the same unknown device keeps showing up wherever you go, check your bags, pockets,
            coat and car.
          </Bullet>
          <Bullet color={Neon.amber}>
            Your phone&apos;s built-in unknown tracker alerts can help too. If you feel unsafe,
            contact the local police.
          </Bullet>
        </Section>
      </View>
    </ScrollView>
  );
}

function PermissionSection() {
  const { status, message, isScanning, start } = useScan();
  const { label, color } = describeScanStatus(status);
  const denied = status === 'permission-denied';
  const detail = message ?? STATUS_FALLBACKS[status] ?? null;

  // The hook reports a failed start through status and message, so the promise needs no handling here.
  const allowAndScan = () => {
    start().catch(() => undefined);
  };

  return (
    <Section title="Bluetooth permission" accent={Neon.cyan}>
      <View style={styles.statusRow} accessibilityLiveRegion="polite">
        <View style={[styles.statusDot, { backgroundColor: color }, glow(color, 6)]} />
        <Text style={styles.body}>
          Status: <Text style={[styles.strong, { color }]}>{label}</Text>
        </Text>
      </View>

      <Text style={styles.body}>
        The app uses Bluetooth to listen for the short signals nearby devices send out. Your phone
        asks you before the first scan. On Android it may ask for &quot;Nearby devices&quot; and
        location access, because Android treats Bluetooth scans as location information.
      </Text>

      {isScanning ? (
        <Text style={[styles.body, { color: Neon.green }]}>
          Scanning is on. Open the Radar or Devices tab to see what&apos;s nearby.
        </Text>
      ) : (
        <>
          {detail && (
            <Text style={[styles.body, denied && { color: Neon.amber }]}>{detail}</Text>
          )}
          {denied && (
            <Text style={styles.body}>
              To fix this, open Settings and allow Bluetooth (on Android it&apos;s called
              &quot;Nearby devices&quot;; allow precise Location too if it&apos;s listed). Then come back and
              tap &quot;Allow Bluetooth and scan&quot;.
            </Text>
          )}
          <View style={styles.actions}>
            {denied && Platform.OS !== 'web' && (
              <ActionButton label="Open settings" onPress={openAppSettings} color={Neon.amber} />
            )}
            <ActionButton
              label="Allow Bluetooth and scan"
              onPress={allowAndScan}
              variant={denied ? 'secondary' : 'primary'}
              disabled={status === 'requesting-permission' || status === 'unsupported'}
            />
          </View>
        </>
      )}
    </Section>
  );
}

function Section({ title, accent, children }: { title: string; accent: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text
        style={[styles.sectionTitle, { color: accent, textShadowColor: accent }]}
        accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Bullet({ color, children }: { color: string; children: ReactNode }) {
  return (
    <View style={styles.bullet}>
      <View style={[styles.bulletDot, { backgroundColor: color }]} />
      <Text style={[styles.body, styles.bulletText]}>{children}</Text>
    </View>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <Text style={styles.strong}>{children}</Text>;
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: Neon.background,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  inner: {
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
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
  section: {
    backgroundColor: Neon.surface,
    borderColor: Neon.border,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 700,
    textShadowRadius: 8,
    marginBottom: Spacing.one,
  },
  body: {
    color: Neon.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  strong: {
    color: Neon.text,
    fontWeight: 700,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
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
  },
  bulletText: {
    flex: 1,
  },
});
