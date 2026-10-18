import {
  buildChartPath,
  CHART_MAX_SAMPLES,
  CHART_RSSI_RANGE,
  formatDuration,
  formatTimeAgo,
  recentSamples,
  rssiToFraction,
  rssiToY,
} from '@/lib/chart';
import type { RssiSample } from '@/lib/types';

const RANGE = { min: -100, max: -30 };

function samples(...values: [t: number, rssi: number][]): RssiSample[] {
  return values.map(([t, rssi]) => ({ t, rssi }));
}

describe('rssiToFraction', () => {
  it('covers -100 to -30 dBm by default', () => {
    expect(CHART_RSSI_RANGE).toEqual({ min: -100, max: -30 });
  });

  it.each([
    [-30, 1],
    [-65, 0.5],
    [-100, 0],
    [-20, 1],
    [-120, 0],
  ])('maps %p dBm to %p', (rssi, expected) => {
    expect(rssiToFraction(rssi, RANGE)).toBeCloseTo(expected);
  });

  it.each([null, undefined, NaN, 127])('gives 0 for the unusable reading %p', (rssi) => {
    expect(rssiToFraction(rssi)).toBe(0);
  });

  it('gives 0 for an empty range instead of dividing by zero', () => {
    expect(rssiToFraction(-50, { min: -50, max: -50 })).toBe(0);
  });
});

describe('rssiToY', () => {
  it('puts strong readings at the top and weak ones at the bottom', () => {
    expect(rssiToY(-30, 100, RANGE)).toBe(0);
    expect(rssiToY(-100, 100, RANGE)).toBe(100);
    expect(rssiToY(-65, 100, RANGE)).toBeCloseTo(50);
  });

  it('keeps inside the top and bottom insets', () => {
    const insets = { top: 10, bottom: 20 };
    expect(rssiToY(-30, 100, RANGE, insets)).toBe(10);
    expect(rssiToY(-100, 100, RANGE, insets)).toBe(80);
    expect(rssiToY(-10, 100, RANGE, insets)).toBe(10);
    expect(rssiToY(-130, 100, RANGE, insets)).toBe(80);
  });
});

describe('recentSamples', () => {
  it('keeps the newest samples, oldest first', () => {
    const history = samples([1, -50], [2, -51], [3, -52], [4, -53]);
    expect(recentSamples(history, 2)).toEqual(samples([3, -52], [4, -53]));
  });

  it('drops unusable readings and times', () => {
    const history = samples([1, -50], [2, NaN], [3, 127], [NaN, -60], [5, -70]);
    expect(recentSamples(history)).toEqual(samples([1, -50], [5, -70]));
  });

  it('caps at CHART_MAX_SAMPLES by default', () => {
    const total = CHART_MAX_SAMPLES + 40;
    const history = Array.from({ length: total }, (_, i) => ({ t: i, rssi: -60 }));
    const recent = recentSamples(history);
    expect(recent).toHaveLength(CHART_MAX_SAMPLES);
    expect(recent[0].t).toBe(total - CHART_MAX_SAMPLES);
  });

  it('gives nothing for a limit of 0', () => {
    expect(recentSamples(samples([1, -50]), 0)).toEqual([]);
  });
});

describe('buildChartPath', () => {
  it('gives an empty path for no samples', () => {
    expect(buildChartPath([], 200, 100, RANGE)).toEqual({ path: '', points: [] });
  });

  it('gives an empty path before the chart has a size', () => {
    const history = samples([0, -50], [1000, -60]);
    expect(buildChartPath(history, 0, 100, RANGE)).toEqual({ path: '', points: [] });
    expect(buildChartPath(history, 200, 0, RANGE)).toEqual({ path: '', points: [] });
    expect(buildChartPath(history, NaN, 100, RANGE)).toEqual({ path: '', points: [] });
  });

  it('puts a single sample at the right edge', () => {
    const { path, points } = buildChartPath(samples([5000, -65]), 200, 100, RANGE);
    expect(points).toEqual([{ x: 200, y: 50, t: 5000, rssi: -65 }]);
    expect(path).toBe('M200 50');
  });

  it('spreads samples across the width by time', () => {
    const history = samples([0, -30], [1000, -65], [4000, -100]);
    const { path, points } = buildChartPath(history, 200, 100, RANGE);
    expect(points.map((p) => p.x)).toEqual([0, 50, 200]);
    expect(points.map((p) => p.y)).toEqual([0, 50, 100]);
    expect(path).toBe('M0 0 L50 50 L200 100');
  });

  it('spaces samples evenly when they share one time', () => {
    const history = samples([1000, -50], [1000, -50], [1000, -50]);
    const { points } = buildChartPath(history, 100, 100, RANGE);
    expect(points.map((p) => p.x)).toEqual([0, 50, 100]);
  });

  it('respects the insets', () => {
    const history = samples([0, -30], [1000, -100]);
    const { path } = buildChartPath(history, 200, 100, RANGE, {
      insets: { top: 10, right: 20, bottom: 10, left: 40 },
    });
    expect(path).toBe('M40 10 L180 90');
  });

  it('clamps readings outside the range to the edges', () => {
    const history = samples([0, -10], [1000, -120]);
    const { points } = buildChartPath(history, 100, 100, RANGE);
    expect(points.map((p) => p.y)).toEqual([0, 100]);
  });

  it('only draws the newest samples', () => {
    const total = CHART_MAX_SAMPLES + 20;
    const history = Array.from({ length: total }, (_, i) => ({ t: i * 1000, rssi: -60 }));
    const { points } = buildChartPath(history, 300, 100, RANGE);
    expect(points).toHaveLength(CHART_MAX_SAMPLES);
    expect(points[0]).toMatchObject({ x: 0, t: 20_000 });
    expect(points[points.length - 1]).toMatchObject({ x: 300, t: (total - 1) * 1000 });

    expect(buildChartPath(history, 300, 100, RANGE, { maxSamples: 2 }).points).toHaveLength(2);
  });

  it('rounds coordinates to keep the path short', () => {
    const history = samples([0, -50], [3000, -50], [9000, -50]);
    const { path } = buildChartPath(history, 100, 90, RANGE);
    expect(path).toBe('M0 25.71 L33.33 25.71 L100 25.71');
  });

  it('uses the default range', () => {
    const { points } = buildChartPath(samples([0, -30], [1, -100]), 100, 100);
    expect(points.map((p) => p.y)).toEqual([0, 100]);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '1 second'],
    [1000, '1 second'],
    [1999, '1 second'],
    [45_000, '45 seconds'],
    [60_000, '1 minute'],
    [150_000, '2 minutes'],
    [3_600_000, '1 hour'],
    [7_300_000, '2 hours'],
    [86_400_000, '1 day'],
    [3 * 86_400_000, '3 days'],
  ])('formats %p ms as %p', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('formatTimeAgo', () => {
  const NOW = 1_000_000;

  it('says "just now" for the last few seconds and for times in the future', () => {
    expect(formatTimeAgo(NOW, NOW)).toBe('just now');
    expect(formatTimeAgo(NOW - 4999, NOW)).toBe('just now');
    expect(formatTimeAgo(NOW + 10_000, NOW)).toBe('just now');
    expect(formatTimeAgo(NaN, NOW)).toBe('just now');
  });

  it('says how long ago', () => {
    expect(formatTimeAgo(NOW - 5000, NOW)).toBe('5 seconds ago');
    expect(formatTimeAgo(NOW - 61_000, NOW)).toBe('1 minute ago');
    expect(formatTimeAgo(NOW - 2 * 3_600_000, NOW)).toBe('2 hours ago');
  });
});
