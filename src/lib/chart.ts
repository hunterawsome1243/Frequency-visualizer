// Pure geometry for the signal-strength chart and the small signal bars, plus the time labels they show.
import { isUsableRssi } from './proximity';
import type { RssiSample } from './types';

/** The dBm span a chart or signal bar covers: `max` (strong) at the top, `min` (weak) at the bottom. */
export interface ChartRange {
  min: number;
  max: number;
}

/** Same span as the radar: -100 dBm (very weak) to -30 dBm (right next to the phone). */
export const CHART_RSSI_RANGE: ChartRange = { min: -100, max: -30 };

/** How many of the newest samples the chart draws: about two minutes at one sample per second. */
export const CHART_MAX_SAMPLES = 120;

/** Space kept free around the plotted line, e.g. for axis labels or so the end dot is not clipped. */
export interface ChartInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartPoint {
  x: number;
  y: number;
  t: number;
  rssi: number;
}

export interface ChartGeometry {
  /** SVG path data such as "M0 10 L5 12", or '' when there is nothing to draw. */
  path: string;
  /** One point per drawn sample, oldest first. */
  points: ChartPoint[];
}

export interface ChartOptions {
  insets?: Partial<ChartInsets>;
  /** Defaults to CHART_MAX_SAMPLES. */
  maxSamples?: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function resolveInsets(insets?: Partial<ChartInsets>): ChartInsets {
  const pick = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  return {
    top: pick(insets?.top),
    right: pick(insets?.right),
    bottom: pick(insets?.bottom),
    left: pick(insets?.left),
  };
}

/** Rounds to 2 decimals so path strings stay short, and never prints "-0". */
function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded === 0 ? 0 : rounded);
}

/** 1 at range.max or stronger, 0 at range.min or weaker. Unusable readings (null, NaN, 127) give 0. */
export function rssiToFraction(rssi: number | null | undefined, range: ChartRange = CHART_RSSI_RANGE): number {
  if (!isUsableRssi(rssi)) return 0;
  const span = range.max - range.min;
  if (!(span > 0)) return 0;
  return clamp((rssi - range.min) / span, 0, 1);
}

/** y coordinate for an RSSI in a chart of this height: range.max at the top inset, range.min at the bottom one. */
export function rssiToY(
  rssi: number,
  height: number,
  range: ChartRange = CHART_RSSI_RANGE,
  insets?: Partial<ChartInsets>,
): number {
  const { top, bottom } = resolveInsets(insets);
  const plotHeight = Math.max(0, height - top - bottom);
  return top + (1 - rssiToFraction(rssi, range)) * plotHeight;
}

/** The newest `maxSamples` samples with a usable RSSI and time, oldest first. */
export function recentSamples(
  samples: readonly RssiSample[],
  maxSamples: number = CHART_MAX_SAMPLES,
): RssiSample[] {
  const limit = Math.max(0, Math.floor(maxSamples));
  const usable = samples.filter((sample) => isUsableRssi(sample.rssi) && Number.isFinite(sample.t));
  return limit === 0 ? [] : usable.slice(Math.max(0, usable.length - limit));
}

/**
 * Lays the newest samples out across a width x height box. x follows time (oldest at the left inset,
 * newest at the right one; evenly spaced if they all share one time), y follows rssiToY. A single
 * sample sits at the right edge and gives a path with only a move, so draw it as a dot.
 */
export function buildChartPath(
  samples: readonly RssiSample[],
  width: number,
  height: number,
  range: ChartRange = CHART_RSSI_RANGE,
  options?: ChartOptions,
): ChartGeometry {
  if (!(width > 0) || !(height > 0)) return { path: '', points: [] };
  const recent = recentSamples(samples, options?.maxSamples ?? CHART_MAX_SAMPLES);
  if (recent.length === 0) return { path: '', points: [] };

  const insets = resolveInsets(options?.insets);
  const plotWidth = Math.max(0, width - insets.left - insets.right);
  let first = Infinity;
  let last = -Infinity;
  for (const sample of recent) {
    first = Math.min(first, sample.t);
    last = Math.max(last, sample.t);
  }
  const span = last - first;

  const points = recent.map((sample, index): ChartPoint => {
    let fraction: number;
    if (recent.length === 1) fraction = 1;
    else if (span > 0) fraction = (sample.t - first) / span;
    else fraction = index / (recent.length - 1);
    return {
      x: insets.left + clamp(fraction, 0, 1) * plotWidth,
      y: rssiToY(sample.rssi, height, range, insets),
      t: sample.t,
      rssi: sample.rssi,
    };
  });

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${formatNumber(point.x)} ${formatNumber(point.y)}`)
    .join(' ');
  return { path, points };
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/** "1 second", "45 seconds", "2 minutes", "3 hours", "2 days". Never less than 1 second. */
export function formatDuration(ms: number): string {
  const seconds = Number.isFinite(ms) ? Math.max(1, Math.floor(ms / 1000)) : 1;
  if (seconds < 60) return plural(seconds, 'second');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return plural(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, 'hour');
  return plural(Math.floor(hours / 24), 'day');
}

/** How long ago `t` was: "just now" under 5 seconds (or for a time in the future), else e.g. "12 seconds ago". */
export function formatTimeAgo(t: number, now: number): string {
  const elapsed = now - t;
  if (!Number.isFinite(elapsed) || elapsed < 5000) return 'just now';
  return `${formatDuration(elapsed)} ago`;
}
