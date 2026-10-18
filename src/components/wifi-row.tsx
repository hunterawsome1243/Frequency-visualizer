import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Fonts, Neon, ProximityColors, Spacing } from '@/constants/theme';
import { isUsableRssi, rssiToProximity } from '@/lib/proximity';
import type { Proximity, WifiNetwork } from '@/lib/types';
import { wifiBars, type WifiSecurity, wifiSecurity } from '@/lib/wifi';

// Kept for callers that imported the helpers from here before they moved to src/lib/wifi.
export { wifiBars, type WifiSecurity, wifiSecurity };

const STRENGTH_WORDS: Record<Proximity, string> = {
  near: 'strong',
  medium: 'medium',
  far: 'weak',
  unknown: 'unknown',
};

function describeNetwork(network: WifiNetwork, security: WifiSecurity): string {
  const proximity = rssiToProximity(network.level);
  const parts = [
    network.ssid,
    network.band === 'unknown' ? 'unknown band' : network.band,
    network.channel === null ? 'channel unknown' : `channel ${network.channel}`,
    security.secured ? `secured with ${security.label}` : `${security.label.toLowerCase()} network, no password`,
    isUsableRssi(network.level)
      ? `signal ${network.level} dBm, ${STRENGTH_WORDS[proximity]}`
      : 'no signal reading',
  ];
  return parts.join(', ');
}

/** One Wi-Fi network: name, band, channel, security and signal strength coloured like the radar. */
export function WifiRow({ network, testID }: { network: WifiNetwork; testID?: string }): ReactNode {
  const security = wifiSecurity(network.capabilities);
  const proximity = rssiToProximity(network.level);
  const color = ProximityColors[proximity];
  const bars = wifiBars(network.level);
  const details = [
    network.band === 'unknown' ? 'Unknown band' : network.band,
    network.channel === null ? 'Channel unknown' : `Channel ${network.channel}`,
  ].join(' · ');

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={describeNetwork(network, security)}
      testID={testID}>
      <SignalBars bars={bars} color={color} />

      <View style={styles.main}>
        <Text style={styles.ssid} numberOfLines={1}>
          {network.ssid}
        </Text>
        <Text style={styles.details} numberOfLines={1}>
          {details}
        </Text>
        {network.bssid !== '' && (
          <Text style={styles.bssid} numberOfLines={1}>
            {network.bssid}
          </Text>
        )}
      </View>

      <View style={styles.side}>
        <Text style={[styles.level, { color }]}>
          {isUsableRssi(network.level) ? `${network.level} dBm` : '— dBm'}
        </Text>
        <View style={styles.security}>
          {security.secured && <LockIcon color={Neon.textSecondary} />}
          <Text style={[styles.securityText, security.label === 'Open' && { color: Neon.amber }]}>
            {security.label}
          </Text>
        </View>
      </View>
    </View>
  );
}

function SignalBars({ bars, color }: { bars: number; color: string }) {
  return (
    <View style={styles.bars} testID="wifi-signal-bars">
      {[1, 2, 3, 4].map((bar) => (
        <View
          key={bar}
          style={[
            styles.bar,
            { height: 4 + bar * 4, backgroundColor: bar <= bars ? color : Neon.border },
          ]}
        />
      ))}
    </View>
  );
}

function LockIcon({ color }: { color: string }) {
  return (
    <Svg width={10} height={12} viewBox="0 0 10 12" testID="wifi-lock-icon">
      <Path
        d="M2.5 5.5 V3.75 A2.5 2.5 0 0 1 7.5 3.75 V5.5"
        stroke={color}
        strokeWidth={1.4}
        fill="none"
      />
      <Rect x={1} y={5.5} width={8} height={6} rx={1.5} fill={color} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    backgroundColor: Neon.surface,
    borderColor: Neon.border,
    borderWidth: 1,
    borderRadius: Spacing.three,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    width: 22,
    height: 20,
  },
  bar: {
    width: 4,
    borderRadius: 1,
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  ssid: {
    color: Neon.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 700,
  },
  details: {
    color: Neon.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  bssid: {
    color: Neon.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 16,
    opacity: 0.8,
  },
  side: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  level: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  security: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  securityText: {
    color: Neon.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 600,
  },
});
