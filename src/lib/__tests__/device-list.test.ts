import {
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_STALE_MS,
  type DeviceMap,
  pruneStale,
  upsertAdvertisement,
} from '@/lib/device-list';
import { detectTracker } from '@/lib/trackers';
import type { Advertisement, TrackerMatch } from '@/lib/types';

// The real detector is built separately; these tests only check that it is the default.
jest.mock('@/lib/trackers', () => ({ detectTracker: jest.fn(() => null) }));

const LIKELY_AIRTAG: TrackerMatch = {
  type: 'airtag',
  label: 'Likely AirTag',
  confidence: 'likely',
  reason: 'Test: specific pattern.',
};
const POSSIBLE_FIND_MY: TrackerMatch = {
  type: 'find-my',
  label: 'Possible Find My device',
  confidence: 'possible',
  reason: 'Test: weak hint.',
};
const POSSIBLE_TILE: TrackerMatch = {
  type: 'tile',
  label: 'Possible Tile',
  confidence: 'possible',
  reason: 'Test: weak hint.',
};

const noTracker = () => null;

function ad(overrides: Partial<Advertisement> = {}): Advertisement {
  return {
    id: 'AA:BB:CC:DD:EE:FF',
    name: null,
    localName: null,
    rssi: -60,
    manufacturerData: null,
    serviceUUIDs: null,
    serviceData: null,
    txPowerLevel: null,
    isConnectable: null,
    ...overrides,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

describe('upsertAdvertisement', () => {
  it('adds a new device', () => {
    const advertisement = ad({ localName: 'Buds', rssi: -55 });
    const devices = upsertAdvertisement({}, advertisement, 1000, { detect: noTracker });
    expect(devices[advertisement.id]).toEqual({
      id: advertisement.id,
      name: 'Buds',
      rssi: -55,
      firstSeen: 1000,
      lastSeen: 1000,
      rssiHistory: [{ t: 1000, rssi: -55 }],
      advertisement,
      tracker: null,
    });
  });

  it('keeps firstSeen and updates lastSeen, rssi and the stored advertisement', () => {
    let devices = upsertAdvertisement({}, ad({ rssi: -70 }), 1000, { detect: noTracker });
    const latest = ad({ rssi: -50, txPowerLevel: 4 });
    devices = upsertAdvertisement(devices, latest, 2500, { detect: noTracker });
    const device = devices[latest.id];
    expect(device.firstSeen).toBe(1000);
    expect(device.lastSeen).toBe(2500);
    expect(device.rssi).toBe(-50);
    expect(device.advertisement).toBe(latest);
    expect(device.rssiHistory).toEqual([
      { t: 1000, rssi: -70 },
      { t: 2500, rssi: -50 },
    ]);
  });

  it('keeps other devices as they were', () => {
    let devices = upsertAdvertisement({}, ad({ id: 'one' }), 1, { detect: noTracker });
    const one = devices.one;
    devices = upsertAdvertisement(devices, ad({ id: 'two' }), 2, { detect: noTracker });
    expect(Object.keys(devices).sort()).toEqual(['one', 'two']);
    expect(devices.one).toBe(one);
  });

  it('does not mutate the map, the device or its history', () => {
    const first = deepFreeze(upsertAdvertisement({}, ad({ rssi: -70 }), 1000, { detect: noTracker }));
    const snapshot = JSON.parse(JSON.stringify(first));
    const second = upsertAdvertisement(first, ad({ rssi: -40, localName: 'New' }), 2000, {
      detect: () => LIKELY_AIRTAG,
    });
    expect(second).not.toBe(first);
    expect(second['AA:BB:CC:DD:EE:FF']).not.toBe(first['AA:BB:CC:DD:EE:FF']);
    expect(JSON.parse(JSON.stringify(first))).toEqual(snapshot);
    expect(first['AA:BB:CC:DD:EE:FF'].rssiHistory).toHaveLength(1);
  });

  describe('names', () => {
    it('prefers the local name over the device name', () => {
      const devices = upsertAdvertisement({}, ad({ name: 'Device', localName: 'Local' }), 1, {
        detect: noTracker,
      });
      expect(devices['AA:BB:CC:DD:EE:FF'].name).toBe('Local');
    });

    it('falls back to the device name, then null', () => {
      expect(upsertAdvertisement({}, ad({ name: 'Device' }), 1, { detect: noTracker })['AA:BB:CC:DD:EE:FF'].name).toBe(
        'Device',
      );
      expect(upsertAdvertisement({}, ad(), 1, { detect: noTracker })['AA:BB:CC:DD:EE:FF'].name).toBeNull();
    });

    it('treats blank names as missing and trims names', () => {
      const devices = upsertAdvertisement({}, ad({ localName: '   ', name: ' Watch ' }), 1, {
        detect: noTracker,
      });
      expect(devices['AA:BB:CC:DD:EE:FF'].name).toBe('Watch');
    });

    it('keeps the previous name when a new advertisement has none', () => {
      let devices = upsertAdvertisement({}, ad({ localName: 'Headphones' }), 1, { detect: noTracker });
      devices = upsertAdvertisement(devices, ad({ localName: null, name: null }), 2, { detect: noTracker });
      expect(devices['AA:BB:CC:DD:EE:FF'].name).toBe('Headphones');
      devices = upsertAdvertisement(devices, ad({ localName: '' }), 3, { detect: noTracker });
      expect(devices['AA:BB:CC:DD:EE:FF'].name).toBe('Headphones');
    });

    it('takes a new name when one is advertised', () => {
      let devices = upsertAdvertisement({}, ad({ localName: 'Old' }), 1, { detect: noTracker });
      devices = upsertAdvertisement(devices, ad({ name: 'New' }), 2, { detect: noTracker });
      expect(devices['AA:BB:CC:DD:EE:FF'].name).toBe('New');
    });
  });

  describe('RSSI history', () => {
    it.each([null, NaN, 127, Infinity, -Infinity])('skips history for %p and sets rssi to null', (rssi) => {
      let devices = upsertAdvertisement({}, ad({ rssi: -70 }), 1, { detect: noTracker });
      devices = upsertAdvertisement(devices, ad({ rssi }), 2, { detect: noTracker });
      const device = devices['AA:BB:CC:DD:EE:FF'];
      expect(device.rssi).toBeNull();
      expect(device.lastSeen).toBe(2);
      expect(device.rssiHistory).toEqual([{ t: 1, rssi: -70 }]);
    });

    it('starts with an empty history when the first advertisement has no RSSI', () => {
      const devices = upsertAdvertisement({}, ad({ rssi: null }), 1, { detect: noTracker });
      expect(devices['AA:BB:CC:DD:EE:FF'].rssiHistory).toEqual([]);
    });

    it('keeps readings of 0 dBm', () => {
      const devices = upsertAdvertisement({}, ad({ rssi: 0 }), 1, { detect: noTracker });
      expect(devices['AA:BB:CC:DD:EE:FF'].rssiHistory).toEqual([{ t: 1, rssi: 0 }]);
    });

    it(`caps history at ${DEFAULT_HISTORY_LIMIT} samples by default, dropping the oldest`, () => {
      let devices: DeviceMap = {};
      for (let i = 0; i < DEFAULT_HISTORY_LIMIT + 15; i++) {
        devices = upsertAdvertisement(devices, ad({ rssi: -50 - (i % 40) }), i, { detect: noTracker });
      }
      const history = devices['AA:BB:CC:DD:EE:FF'].rssiHistory;
      expect(history).toHaveLength(DEFAULT_HISTORY_LIMIT);
      expect(history[0].t).toBe(15);
      expect(history[history.length - 1].t).toBe(DEFAULT_HISTORY_LIMIT + 14);
    });

    it('honours a custom history limit', () => {
      let devices: DeviceMap = {};
      for (let i = 0; i < 5; i++) {
        devices = upsertAdvertisement(devices, ad({ rssi: -60 - i }), i, { historyLimit: 3, detect: noTracker });
      }
      expect(devices['AA:BB:CC:DD:EE:FF'].rssiHistory).toEqual([
        { t: 2, rssi: -62 },
        { t: 3, rssi: -63 },
        { t: 4, rssi: -64 },
      ]);
    });

    it('trims an existing history when the limit shrinks', () => {
      let devices: DeviceMap = {};
      for (let i = 0; i < 5; i++) {
        devices = upsertAdvertisement(devices, ad({ rssi: -60 }), i, { detect: noTracker });
      }
      devices = upsertAdvertisement(devices, ad({ rssi: null }), 5, { historyLimit: 2, detect: noTracker });
      expect(devices['AA:BB:CC:DD:EE:FF'].rssiHistory.map((s) => s.t)).toEqual([3, 4]);
    });

    it('keeps no history with a limit of 0', () => {
      const devices = upsertAdvertisement({}, ad(), 1, { historyLimit: 0, detect: noTracker });
      expect(devices['AA:BB:CC:DD:EE:FF'].rssiHistory).toEqual([]);
    });
  });

  describe('tracker detection', () => {
    it('stores a match from the detector', () => {
      const detect = jest.fn(() => LIKELY_AIRTAG);
      const advertisement = ad();
      const devices = upsertAdvertisement({}, advertisement, 1, { detect });
      expect(detect).toHaveBeenCalledWith(advertisement);
      expect(devices['AA:BB:CC:DD:EE:FF'].tracker).toBe(LIKELY_AIRTAG);
    });

    it('keeps an earlier match when the newest advertisement does not match', () => {
      let devices = upsertAdvertisement({}, ad(), 1, { detect: () => LIKELY_AIRTAG });
      devices = upsertAdvertisement(devices, ad(), 2, { detect: noTracker });
      expect(devices['AA:BB:CC:DD:EE:FF'].tracker).toBe(LIKELY_AIRTAG);
    });

    it('re-runs detection on every advertisement', () => {
      const detect = jest.fn(noTracker);
      let devices = upsertAdvertisement({}, ad(), 1, { detect });
      devices = upsertAdvertisement(devices, ad(), 2, { detect });
      expect(detect).toHaveBeenCalledTimes(2);
    });

    it('picks up a match that appears later', () => {
      let devices = upsertAdvertisement({}, ad(), 1, { detect: noTracker });
      expect(devices['AA:BB:CC:DD:EE:FF'].tracker).toBeNull();
      devices = upsertAdvertisement(devices, ad(), 2, { detect: () => POSSIBLE_TILE });
      expect(devices['AA:BB:CC:DD:EE:FF'].tracker).toBe(POSSIBLE_TILE);
    });

    it('upgrades a possible match to a likely one', () => {
      let devices = upsertAdvertisement({}, ad(), 1, { detect: () => POSSIBLE_FIND_MY });
      devices = upsertAdvertisement(devices, ad(), 2, { detect: () => LIKELY_AIRTAG });
      expect(devices['AA:BB:CC:DD:EE:FF'].tracker).toBe(LIKELY_AIRTAG);
    });

    it('does not downgrade a likely match to a possible one', () => {
      let devices = upsertAdvertisement({}, ad(), 1, { detect: () => LIKELY_AIRTAG });
      devices = upsertAdvertisement(devices, ad(), 2, { detect: () => POSSIBLE_FIND_MY });
      expect(devices['AA:BB:CC:DD:EE:FF'].tracker).toBe(LIKELY_AIRTAG);
    });

    it('uses the newest match when both are equally confident', () => {
      let devices = upsertAdvertisement({}, ad(), 1, { detect: () => POSSIBLE_FIND_MY });
      devices = upsertAdvertisement(devices, ad(), 2, { detect: () => POSSIBLE_TILE });
      expect(devices['AA:BB:CC:DD:EE:FF'].tracker).toBe(POSSIBLE_TILE);
    });

    it('uses detectTracker from ./trackers by default', () => {
      const mocked = jest.mocked(detectTracker);
      mocked.mockClear();
      mocked.mockReturnValueOnce(POSSIBLE_TILE);
      const advertisement = ad();
      const devices = upsertAdvertisement({}, advertisement, 1);
      expect(mocked).toHaveBeenCalledWith(advertisement);
      expect(devices['AA:BB:CC:DD:EE:FF'].tracker).toBe(POSSIBLE_TILE);
    });
  });

  it('handles ids that clash with Object.prototype names', () => {
    const id: string = 'constructor';
    const devices = upsertAdvertisement({}, ad({ id, rssi: -50 }), 7, { detect: noTracker });
    expect(devices[id].firstSeen).toBe(7);
    expect(devices[id].rssiHistory).toEqual([{ t: 7, rssi: -50 }]);
  });
});

describe('pruneStale', () => {
  const build = (lastSeenById: Record<string, number>): DeviceMap => {
    let devices: DeviceMap = {};
    for (const [id, lastSeen] of Object.entries(lastSeenById)) {
      devices = upsertAdvertisement(devices, ad({ id }), lastSeen, { detect: noTracker });
    }
    return devices;
  };

  it('drops devices not heard from for longer than maxAgeMs', () => {
    const devices = build({ fresh: 9_000, old: 1_000, edge: 5_000 });
    const pruned = pruneStale(devices, 10_000, 5_000);
    expect(Object.keys(pruned).sort()).toEqual(['edge', 'fresh']);
    expect(pruned.fresh).toBe(devices.fresh);
  });

  it('keeps a device exactly at the cutoff and drops one just past it', () => {
    const devices = build({ edge: 5_000, past: 4_999 });
    expect(Object.keys(pruneStale(devices, 10_000, 5_000))).toEqual(['edge']);
  });

  it(`uses ${DEFAULT_STALE_MS} ms by default`, () => {
    const devices = build({ keep: 0, drop: -1 });
    expect(Object.keys(pruneStale(devices, DEFAULT_STALE_MS))).toEqual(['keep']);
  });

  it('returns the same object when nothing is removed', () => {
    const devices = build({ a: 9_000, b: 9_500 });
    expect(pruneStale(devices, 10_000, 5_000)).toBe(devices);
  });

  it('returns the same object for an empty map', () => {
    const devices: DeviceMap = {};
    expect(pruneStale(devices, 10_000)).toBe(devices);
  });

  it('does not mutate the input', () => {
    const devices = deepFreeze(build({ fresh: 9_000, old: 1_000 }));
    const pruned = pruneStale(devices, 10_000, 5_000);
    expect(pruned).not.toBe(devices);
    expect(Object.keys(devices).sort()).toEqual(['fresh', 'old']);
  });

  it('can remove everything', () => {
    const devices = build({ a: 1, b: 2 });
    expect(pruneStale(devices, 100_000, 1_000)).toEqual({});
  });
});
