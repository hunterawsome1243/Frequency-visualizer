import {
  isUsableRssi,
  PROXIMITY_THRESHOLDS,
  proximityLabel,
  rssiToProximity,
} from '@/lib/proximity';

describe('rssiToProximity', () => {
  it('uses the documented thresholds', () => {
    expect(PROXIMITY_THRESHOLDS).toEqual({ near: -60, medium: -80 });
  });

  it.each([
    [-30, 'near'],
    [-59, 'near'],
    [-60, 'near'],
    [-60.5, 'medium'],
    [-61, 'medium'],
    [-79, 'medium'],
    [-80, 'medium'],
    [-80.1, 'far'],
    [-81, 'far'],
    [-100, 'far'],
    [-127, 'far'],
  ] as const)('maps %p dBm to %p', (rssi, expected) => {
    expect(rssiToProximity(rssi)).toBe(expected);
  });

  it('treats strong positive readings as near', () => {
    expect(rssiToProximity(0)).toBe('near');
    expect(rssiToProximity(20)).toBe('near');
  });

  it.each([null, undefined, NaN, 127, Infinity, -Infinity])('gives unknown for %p', (rssi) => {
    expect(rssiToProximity(rssi)).toBe('unknown');
  });
});

describe('isUsableRssi', () => {
  it('accepts finite readings other than 127', () => {
    expect(isUsableRssi(-70)).toBe(true);
    expect(isUsableRssi(0)).toBe(true);
    expect(isUsableRssi(126)).toBe(true);
  });

  it('rejects missing, NaN, infinite and 127', () => {
    expect(isUsableRssi(null)).toBe(false);
    expect(isUsableRssi(undefined)).toBe(false);
    expect(isUsableRssi(NaN)).toBe(false);
    expect(isUsableRssi(Infinity)).toBe(false);
    expect(isUsableRssi(127)).toBe(false);
  });
});

describe('proximityLabel', () => {
  it.each([
    ['near', 'Near'],
    ['medium', 'Medium'],
    ['far', 'Far'],
    ['unknown', 'Unknown'],
  ] as const)('labels %p as %p', (proximity, label) => {
    expect(proximityLabel(proximity)).toBe(label);
  });
});
