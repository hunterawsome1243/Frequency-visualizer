import { Fragment, type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Neon, ProximityColors, Spacing } from '@/constants/theme';
import {
  buildChartPath,
  CHART_MAX_SAMPLES,
  CHART_RSSI_RANGE,
  type ChartInsets,
  formatTimeAgo,
  recentSamples,
  rssiToY,
} from '@/lib/chart';
import { PROXIMITY_THRESHOLDS } from '@/lib/proximity';
import type { Proximity, RssiSample } from '@/lib/types';

export interface RssiChartProps {
  /** Oldest first, as in ScannedDevice.rssiHistory. Only the newest CHART_MAX_SAMPLES are drawn. */
  samples: readonly RssiSample[];
  height?: number;
  /** Clock for the time labels under the chart. Defaults to the newest sample's time. */
  now?: number;
}

/** Left inset leaves room for the dBm labels; the others keep the line's glow and end dot from being clipped. */
const INSETS: ChartInsets = { top: 10, right: 12, bottom: 10, left: 34 };

const THRESHOLD_LINES = [PROXIMITY_THRESHOLDS.near, PROXIMITY_THRESHOLDS.medium];

const ZONES: { proximity: Exclude<Proximity, 'unknown'>; label: string; from: number; to: number }[] = [
  { proximity: 'near', label: 'Near', from: CHART_RSSI_RANGE.max, to: PROXIMITY_THRESHOLDS.near },
  { proximity: 'medium', label: 'Medium', from: PROXIMITY_THRESHOLDS.near, to: PROXIMITY_THRESHOLDS.medium },
  { proximity: 'far', label: 'Far', from: PROXIMITY_THRESHOLDS.medium, to: CHART_RSSI_RANGE.min },
];

function describeChart(samples: readonly RssiSample[]): string {
  if (samples.length < 2) return 'Signal strength chart. Waiting for more readings.';
  let weakest = Infinity;
  let strongest = -Infinity;
  for (const sample of samples) {
    weakest = Math.min(weakest, sample.rssi);
    strongest = Math.max(strongest, sample.rssi);
  }
  const latest = samples[samples.length - 1].rssi;
  return (
    `Signal strength chart of the last ${samples.length} readings, between ${Math.round(weakest)} ` +
    `and ${Math.round(strongest)} dBm. Latest ${Math.round(latest)} dBm.`
  );
}

/** Line chart of recent RSSI readings, with dashed lines where near turns to medium and medium to far. */
export function RssiChart({ samples, height = 160, now }: RssiChartProps): ReactNode {
  const [width, setWidth] = useState(0);
  const recent = recentSamples(samples, CHART_MAX_SAMPLES);
  const { path, points } = buildChartPath(recent, width, height, CHART_RSSI_RANGE, { insets: INSETS });
  const latest = points.length > 0 ? points[points.length - 1] : null;
  const waiting = recent.length < 2;
  const clock = now ?? (recent.length > 0 ? recent[recent.length - 1].t : 0);
  const right = width - INSETS.right;

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  };

  return (
    <View style={styles.container}>
      <View style={styles.plot}>
        {/* Measured inside the border, so the drawing fits it exactly. */}
        <View
          style={{ height }}
          onLayout={onLayout}
          accessible
          accessibilityRole="image"
          accessibilityLabel={describeChart(recent)}>
          {width > 0 ? (
            <Svg width={width} height={height}>
              {/* Zone names sit at the old end, so they never cover the newest reading. */}
              {ZONES.map((zone) => {
                const top = rssiToY(zone.from, height, CHART_RSSI_RANGE, INSETS);
                const bottom = rssiToY(zone.to, height, CHART_RSSI_RANGE, INSETS);
                return (
                  <SvgText
                    key={zone.proximity}
                    x={INSETS.left + 6}
                    y={(top + bottom) / 2 + 4}
                    fill={ProximityColors[zone.proximity]}
                    fillOpacity={0.55}
                    fontSize={10}
                    fontWeight="bold"
                    textAnchor="start">
                    {zone.label.toUpperCase()}
                  </SvgText>
                );
              })}

              {THRESHOLD_LINES.map((rssi) => {
                const y = rssiToY(rssi, height, CHART_RSSI_RANGE, INSETS);
                return (
                  <Fragment key={rssi}>
                    <Line
                      x1={INSETS.left}
                      x2={right}
                      y1={y}
                      y2={y}
                      stroke={Neon.grid}
                      strokeWidth={1}
                      strokeDasharray={[4, 4]}
                    />
                    <SvgText
                      x={INSETS.left - 6}
                      y={y + 3.5}
                      fill={Neon.textSecondary}
                      fontSize={10}
                      textAnchor="end">
                      {String(rssi)}
                    </SvgText>
                  </Fragment>
                );
              })}

              {points.length >= 2 ? (
                <>
                  <Path
                    d={path}
                    stroke={Neon.cyan}
                    strokeOpacity={0.22}
                    strokeWidth={8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <Path
                    d={path}
                    stroke={Neon.cyan}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </>
              ) : null}

              {latest ? (
                <>
                  <Circle cx={latest.x} cy={latest.y} r={8} fill={Neon.cyan} fillOpacity={0.25} />
                  <Circle cx={latest.x} cy={latest.y} r={4} fill={Neon.cyan} />
                </>
              ) : null}
            </Svg>
          ) : null}

          {waiting ? (
            <View style={styles.waiting}>
              <Text style={styles.waitingText}>Waiting for more readings</Text>
            </View>
          ) : null}
        </View>
      </View>

      {waiting ? null : (
        <View style={styles.axis} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text style={styles.axisText}>{formatTimeAgo(recent[0].t, clock)}</Text>
          <Text style={styles.axisText}>{formatTimeAgo(recent[recent.length - 1].t, clock)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  plot: {
    alignSelf: 'stretch',
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: Neon.border,
    backgroundColor: Neon.surface,
    overflow: 'hidden',
  },
  waiting: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  waitingText: {
    color: Neon.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(13, 18, 32, 0.85)',
    overflow: 'hidden',
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: INSETS.left,
    paddingRight: INSETS.right,
  },
  axisText: {
    color: Neon.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
});
