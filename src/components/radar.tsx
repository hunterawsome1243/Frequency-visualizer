import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { glow, Neon, ProximityColors } from '@/constants/theme';
import { isUsableRssi, PROXIMITY_THRESHOLDS, proximityLabel, rssiToProximity } from '@/lib/proximity';
import { radarPosition, rssiToRadiusFraction } from '@/lib/radar';
import { displayName, type Nicknames } from '@/lib/sort-filter';
import type { Proximity, ScannedDevice } from '@/lib/types';

export interface RadarProps {
  devices: readonly ScannedDevice[];
  nicknames?: Nicknames;
  onSelect(id: string): void;
  /** Width and height of the square radar, in points. Nothing is drawn while it is 0. */
  size: number;
  /** Shows the rotating sweep (default true). Turn it off when no scan is running. */
  sweeping?: boolean;
  testID?: string;
}

/** Rings sit on the proximity thresholds, so a dot inside the "Near" ring reads as near. */
export const RADAR_RINGS: readonly { proximity: Exclude<Proximity, 'unknown'>; fraction: number }[] = [
  { proximity: 'near', fraction: rssiToRadiusFraction(PROXIMITY_THRESHOLDS.near) },
  { proximity: 'medium', fraction: rssiToRadiusFraction(PROXIMITY_THRESHOLDS.medium) },
  { proximity: 'far', fraction: 1 },
];

/** Every dot is a touch target at least this big, whatever its drawn size. */
export const DOT_HIT_SIZE = 44;
/** Space between the outer ring and the edge of the view, so edge dots and their glow are not clipped. */
const EDGE_PADDING = 14;
const SWEEP_DURATION_MS = 4000;
const SWEEP_DEGREES = 50;
const SWEEP_SLICES = 14;
const PULSE_DURATION_MS = 1600;
const MOVE_DURATION_MS = 450;
const TICK_COUNT = 24;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** One sentence for screen readers, e.g. "Radar showing 3 devices: 1 near, 2 far. 1 possible tracker." */
export function radarSummary(devices: readonly ScannedDevice[]): string {
  if (devices.length === 0) return 'Radar showing no devices yet.';
  const counts: Record<Proximity, number> = { near: 0, medium: 0, far: 0, unknown: 0 };
  for (const device of devices) counts[rssiToProximity(device.rssi)] += 1;
  const parts = (['near', 'medium', 'far'] as const)
    .filter((p) => counts[p] > 0)
    .map((p) => `${counts[p]} ${p}`);
  if (counts.unknown > 0) parts.push(`${counts.unknown} with no signal reading`);
  const trackers = devices.filter((device) => device.tracker !== null).length;
  const trackerText = trackers > 0 ? ` ${plural(trackers, 'possible tracker', 'possible trackers')}.` : '';
  return `Radar showing ${plural(devices.length, 'device', 'devices')}: ${parts.join(', ')}.${trackerText}`;
}

/** What a screen reader says for one dot, e.g. "Possible AirTag, Unnamed device, near, -52 dBm". */
export function dotLabel(device: ScannedDevice, nicknames?: Nicknames): string {
  const proximity = rssiToProximity(device.rssi);
  const signal = isUsableRssi(device.rssi) ? `${device.rssi} dBm` : 'no signal reading';
  const parts = [displayName(device, nicknames), proximityLabel(proximity).toLowerCase(), signal];
  if (device.tracker) parts.unshift(device.tracker.label);
  return parts.join(', ');
}

/** Follows the phone's "Reduce motion" setting. */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled);
    });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  return reduceMotion;
}

/** A point on a circle; angle in radians, 0 pointing up and increasing clockwise, like radarPosition. */
function pointAt(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
}

/** A pie slice from angle a1 to a2 (clockwise), as an SVG path. */
function slicePath(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const start = pointAt(cx, cy, r, a1);
  const end = pointAt(cx, cy, r, a2);
  const largeArc = a2 - a1 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

function dotSizeFor(size: number): number {
  return Math.round(Math.min(14, Math.max(8, size * 0.028)));
}

/**
 * Radar-style view of nearby devices. Distance from the centre follows signal strength (strong in the
 * middle), the angle is a stable value from the device id. Likely trackers are larger, red and pulse.
 */
export function Radar({ devices, nicknames, onSelect, size, sweeping = true, testID }: RadarProps): ReactNode {
  const reduceMotion = useReduceMotion();
  const [spin] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  const hasTrackers = devices.some((device) => device.tracker !== null);
  const showSweep = sweeping && !reduceMotion && size > 0;
  const animatePulse = hasTrackers && !reduceMotion && size > 0;

  useEffect(() => {
    if (!showSweep) return;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: SWEEP_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [showSweep, spin]);

  useEffect(() => {
    if (!animatePulse) return;
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: PULSE_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [animatePulse, pulse]);

  if (size <= 0) return <View testID={testID} />;

  const center = size / 2;
  const radius = Math.max(0, center - EDGE_PADDING);
  const dotSize = dotSizeFor(size);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // Trackers last, so they are drawn on top and win a tap where dots overlap. Sorting by id keeps the
  // order stable between updates.
  const ordered = [...devices].sort((a, b) => {
    const aTracker = a.tracker ? 1 : 0;
    const bTracker = b.tracker ? 1 : 0;
    if (aTracker !== bTracker) return aTracker - bTracker;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return (
    <View style={{ width: size, height: size }} testID={testID}>
      <View
        style={StyleSheet.absoluteFill}
        accessible
        accessibilityRole="image"
        accessibilityLabel={radarSummary(devices)}
        testID="radar-summary">
        <RadarGrid size={size} radius={radius} />
      </View>

      {showSweep && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.passThrough, { transform: [{ rotate }] }]}
          testID="radar-sweep">
          <RadarSweep size={size} radius={radius} />
        </Animated.View>
      )}

      {ordered.map((device) => {
        const { x, y } = radarPosition(device.id, device.rssi, center, center, radius);
        return (
          <RadarDot
            key={device.id}
            device={device}
            x={x}
            y={y}
            dotSize={dotSize}
            label={dotLabel(device, nicknames)}
            onSelect={onSelect}
            pulse={pulse}
            reduceMotion={reduceMotion}
          />
        );
      })}
    </View>
  );
}

/** Background, rings with labels, crosshair and tick marks. Static, so it only redraws when the size changes. */
function RadarGrid({ size, radius }: { size: number; radius: number }) {
  const c = size / 2;
  const labelSize = Math.max(9, Math.min(12, Math.round(size * 0.03)));
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => (i / TICK_COUNT) * Math.PI * 2);

  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="radarGlow" cx={c} cy={c} r={radius} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={Neon.cyan} stopOpacity={0.14} />
          <Stop offset="0.7" stopColor={Neon.cyan} stopOpacity={0.05} />
          <Stop offset="1" stopColor={Neon.cyan} stopOpacity={0.02} />
        </RadialGradient>
      </Defs>

      <Circle cx={c} cy={c} r={radius} fill="url(#radarGlow)" />

      <Line x1={c - radius} y1={c} x2={c + radius} y2={c} stroke={Neon.grid} strokeWidth={1} />
      <Line x1={c} y1={c - radius} x2={c} y2={c + radius} stroke={Neon.grid} strokeWidth={1} />

      <G>
        {ticks.map((angle, i) => {
          const long = i % 6 === 0;
          const outer = pointAt(c, c, radius, angle);
          const inner = pointAt(c, c, radius - (long ? 8 : 4), angle);
          return (
            <Line
              key={angle}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={Neon.cyan}
              strokeOpacity={long ? 0.6 : 0.35}
              strokeWidth={1}
            />
          );
        })}
      </G>

      {RADAR_RINGS.map(({ proximity, fraction }) => {
        const r = radius * fraction;
        const outer = proximity === 'far';
        return (
          <G key={proximity}>
            <Circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={outer ? Neon.cyan : Neon.grid}
              strokeOpacity={outer ? 0.55 : 1}
              strokeWidth={outer ? 1.5 : 1}
              strokeDasharray={outer ? undefined : [4, 4]}
            />
            <SvgText
              x={c + 5}
              y={c - r + labelSize + 3}
              fill={ProximityColors[proximity]}
              fillOpacity={0.75}
              fontSize={labelSize}
              fontWeight="600">
              {proximityLabel(proximity)}
            </SvgText>
          </G>
        );
      })}

      {/* You are here: the phone sits in the middle. */}
      <Circle cx={c} cy={c} r={6} fill="none" stroke={Neon.cyan} strokeOpacity={0.6} strokeWidth={1} />
      <Circle cx={c} cy={c} r={2.5} fill={Neon.cyan} />
    </Svg>
  );
}

/** The sweep wedge, drawn pointing up; the wrapping view rotates it. Slices fade towards the trailing edge. */
function RadarSweep({ size, radius }: { size: number; radius: number }) {
  const c = size / 2;
  const span = (SWEEP_DEGREES * Math.PI) / 180;
  const step = span / SWEEP_SLICES;
  const slices = Array.from({ length: SWEEP_SLICES }, (_, i) => {
    const a1 = -span + i * step;
    // A small overlap hides hairline seams between neighbouring slices.
    const a2 = Math.min(0, a1 + step * 1.15);
    return { key: i, d: slicePath(c, c, radius, a1, a2), opacity: 0.22 * ((i + 1) / SWEEP_SLICES) ** 1.6 };
  });
  const tip = pointAt(c, c, radius, 0);

  return (
    <Svg width={size} height={size}>
      {slices.map((slice) => (
        <Path key={slice.key} d={slice.d} fill={Neon.cyan} fillOpacity={slice.opacity} />
      ))}
      <Line x1={c} y1={c} x2={tip.x} y2={tip.y} stroke={Neon.cyan} strokeOpacity={0.85} strokeWidth={1.5} />
    </Svg>
  );
}

interface RadarDotProps {
  device: ScannedDevice;
  x: number;
  y: number;
  dotSize: number;
  label: string;
  onSelect(id: string): void;
  pulse: Animated.Value;
  reduceMotion: boolean;
}

function RadarDot({ device, x, y, dotSize, label, onSelect, pulse, reduceMotion }: RadarDotProps) {
  const half = DOT_HIT_SIZE / 2;
  const [position] = useState(() => new Animated.ValueXY({ x: x - half, y: y - half }));
  /** Where the dot was last sent, so a dot that has not moved starts no animation. */
  const lastTarget = useRef({ x: x - half, y: y - half });
  const isTracker = device.tracker !== null;
  const color = isTracker ? Neon.danger : ProximityColors[rssiToProximity(device.rssi)];
  const size = isTracker ? Math.round(dotSize * 1.5) : dotSize;

  // Glide to the new spot when the signal changes, instead of jumping.
  useEffect(() => {
    const target = { x: x - half, y: y - half };
    const last = lastTarget.current;
    lastTarget.current = target;
    if (reduceMotion) {
      position.setValue(target);
      return;
    }
    if (last.x === target.x && last.y === target.y) return;
    const move = Animated.timing(position, {
      toValue: target,
      duration: MOVE_DURATION_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
      isInteraction: false,
    });
    move.start();
    return () => move.stop();
  }, [x, y, half, reduceMotion, position]);

  const pulseStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
  };

  return (
    <Animated.View
      style={[styles.dotSlot, { transform: position.getTranslateTransform() }]}
      testID={`radar-dot-slot-${device.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Opens details for this device"
        onPress={() => onSelect(device.id)}
        testID={`radar-dot-${device.id}`}
        style={({ pressed }) => [styles.dotHit, pressed && styles.pressed]}>
        <View
          style={[
            styles.halo,
            { width: size * 2.2, height: size * 2.2, borderRadius: size * 1.1, backgroundColor: color },
          ]}
        />
        {isTracker && (
          <>
            {!reduceMotion && (
              <Animated.View
                testID="radar-tracker-pulse"
                style={[
                  styles.ring,
                  { width: size * 1.4, height: size * 1.4, borderRadius: size * 0.7, borderColor: color },
                  pulseStyle,
                ]}
              />
            )}
            <View
              testID="radar-tracker-ring"
              style={[
                styles.ring,
                { width: size * 1.9, height: size * 1.9, borderRadius: size * 0.95, borderColor: color },
              ]}
            />
          </>
        )}
        <View
          style={[
            { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
            glow(color, isTracker ? 10 : 6),
          ]}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  passThrough: {
    pointerEvents: 'none',
  },
  dotSlot: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: DOT_HIT_SIZE,
    height: DOT_HIT_SIZE,
  },
  dotHit: {
    width: DOT_HIT_SIZE,
    height: DOT_HIT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    opacity: 0.18,
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  pressed: {
    opacity: 0.6,
  },
});
