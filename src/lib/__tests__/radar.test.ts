import { idToAngle, RADAR_RSSI_RANGE, radarPosition, rssiToRadiusFraction } from '@/lib/radar';

const TWO_PI = Math.PI * 2;

describe('rssiToRadiusFraction', () => {
  it('maps the strongest RSSI to the centre and the weakest to the edge', () => {
    expect(rssiToRadiusFraction(RADAR_RSSI_RANGE.strongest)).toBe(0);
    expect(rssiToRadiusFraction(RADAR_RSSI_RANGE.weakest)).toBe(1);
  });

  it('is linear in between', () => {
    expect(rssiToRadiusFraction(-65)).toBeCloseTo(0.5);
    expect(rssiToRadiusFraction(-44)).toBeCloseTo(0.2);
  });

  it('gets larger as the signal gets weaker', () => {
    expect(rssiToRadiusFraction(-50)).toBeLessThan(rssiToRadiusFraction(-70));
    expect(rssiToRadiusFraction(-70)).toBeLessThan(rssiToRadiusFraction(-90));
  });

  it('clamps readings outside the range', () => {
    expect(rssiToRadiusFraction(-10)).toBe(0);
    expect(rssiToRadiusFraction(0)).toBe(0);
    expect(rssiToRadiusFraction(-120)).toBe(1);
    expect(rssiToRadiusFraction(-1000)).toBe(1);
  });

  it.each([null, undefined, NaN, 127, Infinity, -Infinity])('puts %p at the edge', (rssi) => {
    expect(rssiToRadiusFraction(rssi)).toBe(1);
  });
});

describe('idToAngle', () => {
  it('is stable for the same id', () => {
    const id = 'AA:BB:CC:DD:EE:FF';
    expect(idToAngle(id)).toBe(idToAngle(id));
    expect(idToAngle(['AA', 'BB', 'CC', 'DD', 'EE', 'FF'].join(':'))).toBe(idToAngle(id));
  });

  it('stays within [0, 2π)', () => {
    const ids = ['', 'a', 'A', '0', ' ', '\u0000', '🙂', 'x'.repeat(500)];
    for (let i = 0; i < 1000; i++) ids.push(`device-${i}`);
    for (const id of ids) {
      const angle = idToAngle(id);
      expect(Number.isFinite(angle)).toBe(true);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(TWO_PI);
    }
  });

  it('gives different angles for different ids', () => {
    expect(idToAngle('AA:BB:CC:DD:EE:01')).not.toBe(idToAngle('AA:BB:CC:DD:EE:02'));
    expect(idToAngle('a')).not.toBe(idToAngle('b'));
  });

  it('spreads ids that differ by one character around the radar', () => {
    const angles = Array.from({ length: 16 }, (_, i) =>
      idToAngle(`AA:BB:CC:DD:EE:${i.toString(16).padStart(2, '0').toUpperCase()}`),
    );
    expect(new Set(angles).size).toBe(angles.length);
    // Every quarter of the circle gets at least one of these sixteen neighbouring addresses.
    const quarters = new Set(angles.map((angle) => Math.floor(angle / (Math.PI / 2))));
    expect(quarters.size).toBe(4);
  });

  it('spreads many ids roughly evenly', () => {
    const buckets = new Array(8).fill(0);
    const count = 4000;
    for (let i = 0; i < count; i++) {
      buckets[Math.floor((idToAngle(`id-${i}`) / TWO_PI) * 8)] += 1;
    }
    for (const bucket of buckets) {
      expect(bucket).toBeGreaterThan((count / 8) * 0.8);
      expect(bucket).toBeLessThan((count / 8) * 1.2);
    }
  });
});

describe('radarPosition', () => {
  const findIdNear = (target: number) => {
    let best = '';
    let bestDiff = Infinity;
    for (let i = 0; i < 20000; i++) {
      const id = `probe-${i}`;
      const diff = Math.abs(idToAngle(id) - target);
      if (diff < bestDiff) {
        best = id;
        bestDiff = diff;
      }
    }
    return best;
  };

  it('puts the strongest signal in the centre', () => {
    const { x, y } = radarPosition('any', RADAR_RSSI_RANGE.strongest, 100, 120, 80);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(120);
  });

  it('puts devices at fraction × radius from the centre, at the id angle', () => {
    const id = 'AA:BB:CC:DD:EE:FF';
    const { x, y } = radarPosition(id, -65, 50, 50, 40);
    const angle = idToAngle(id);
    expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(20);
    expect(x).toBeCloseTo(50 + 20 * Math.sin(angle));
    expect(y).toBeCloseTo(50 - 20 * Math.cos(angle));
  });

  it('puts missing RSSI on the edge', () => {
    const { x, y } = radarPosition('device', null, 0, 0, 100);
    expect(Math.hypot(x, y)).toBeCloseTo(100);
  });

  it('never leaves the radar for out-of-range readings', () => {
    const { x, y } = radarPosition('device', -500, 10, 10, 30);
    expect(Math.hypot(x - 10, y - 10)).toBeLessThanOrEqual(30 + 1e-9);
  });

  it('points angle 0 up and turns clockwise', () => {
    const up = radarPosition(findIdNear(0), -100, 0, 0, 100);
    expect(up.y).toBeLessThan(-99);
    expect(Math.abs(up.x)).toBeLessThan(2);

    const right = radarPosition(findIdNear(Math.PI / 2), -100, 0, 0, 100);
    expect(right.x).toBeGreaterThan(99);
    expect(Math.abs(right.y)).toBeLessThan(2);

    const down = radarPosition(findIdNear(Math.PI), -100, 0, 0, 100);
    expect(down.y).toBeGreaterThan(99);

    const left = radarPosition(findIdNear((3 * Math.PI) / 2), -100, 0, 0, 100);
    expect(left.x).toBeLessThan(-99);
  });

  it('keeps the same bearing as the signal changes', () => {
    const id = 'stable-device';
    const near = radarPosition(id, -40, 0, 0, 100);
    const far = radarPosition(id, -90, 0, 0, 100);
    expect(Math.atan2(near.x, -near.y)).toBeCloseTo(Math.atan2(far.x, -far.y));
  });
});
