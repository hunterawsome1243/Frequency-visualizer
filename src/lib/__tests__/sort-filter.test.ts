import { displayName, filterDevices, sortDevices } from '@/lib/sort-filter';
import type { ScannedDevice, TrackerMatch } from '@/lib/types';

const TRACKER: TrackerMatch = {
  type: 'airtag',
  label: 'Possible AirTag',
  confidence: 'possible',
  reason: 'Test match.',
};

function device(
  id: string,
  overrides: { name?: string | null; rssi?: number | null; tracker?: TrackerMatch | null } = {},
): ScannedDevice {
  const name = overrides.name ?? null;
  const rssi = overrides.rssi === undefined ? -70 : overrides.rssi;
  return {
    id,
    name,
    rssi,
    firstSeen: 0,
    lastSeen: 0,
    rssiHistory: [],
    advertisement: {
      id,
      name,
      localName: null,
      rssi,
      manufacturerData: null,
      serviceUUIDs: null,
      serviceData: null,
      txPowerLevel: null,
      isConnectable: null,
    },
    tracker: overrides.tracker ?? null,
  };
}

const ids = (devices: readonly ScannedDevice[]) => devices.map((d) => d.id);

describe('displayName', () => {
  it('prefers the nickname', () => {
    expect(displayName(device('a', { name: 'JBL Flip' }), { a: 'My speaker' })).toBe('My speaker');
  });

  it('falls back to the advertised name', () => {
    expect(displayName(device('a', { name: 'JBL Flip' }))).toBe('JBL Flip');
    expect(displayName(device('a', { name: 'JBL Flip' }), { b: 'Other' })).toBe('JBL Flip');
  });

  it('says "Unnamed device" when there is neither', () => {
    expect(displayName(device('a'))).toBe('Unnamed device');
    expect(displayName(device('a'), {})).toBe('Unnamed device');
  });

  it('ignores blank nicknames and names', () => {
    expect(displayName(device('a', { name: 'Watch' }), { a: '   ' })).toBe('Watch');
    expect(displayName(device('a', { name: '  ' }))).toBe('Unnamed device');
    expect(displayName(device('a', { name: '' }), { a: '' })).toBe('Unnamed device');
  });

  it('trims surrounding spaces', () => {
    expect(displayName(device('a', { name: ' Watch ' }))).toBe('Watch');
    expect(displayName(device('a'), { a: ' Keys ' })).toBe('Keys');
  });
});

describe('sortDevices by signal', () => {
  it('puts the strongest first and missing RSSI last', () => {
    const list = [
      device('weak', { rssi: -90 }),
      device('none', { rssi: null }),
      device('strong', { rssi: -40 }),
      device('mid', { rssi: -65 }),
    ];
    expect(ids(sortDevices(list, 'signal'))).toEqual(['strong', 'mid', 'weak', 'none']);
  });

  it('treats NaN and 127 like missing RSSI', () => {
    const list = [
      device('nan', { rssi: NaN }),
      device('na', { rssi: 127 }),
      device('real', { rssi: -95 }),
    ];
    expect(ids(sortDevices(list, 'signal'))).toEqual(['real', 'na', 'nan']);
  });

  it('breaks ties by id', () => {
    const list = [
      device('c', { rssi: -50 }),
      device('a', { rssi: -50 }),
      device('b', { rssi: -50 }),
      device('z', { rssi: null }),
      device('y', { rssi: null }),
    ];
    expect(ids(sortDevices(list, 'signal'))).toEqual(['a', 'b', 'c', 'y', 'z']);
    expect(ids(sortDevices([...list].reverse(), 'signal'))).toEqual(['a', 'b', 'c', 'y', 'z']);
  });

  it('puts trackers first by default', () => {
    const list = [
      device('loud', { rssi: -30 }),
      device('tracker-weak', { rssi: -95, tracker: TRACKER }),
      device('tracker-strong', { rssi: -60, tracker: TRACKER }),
      device('quiet', { rssi: -80 }),
    ];
    expect(ids(sortDevices(list, 'signal'))).toEqual(['tracker-strong', 'tracker-weak', 'loud', 'quiet']);
  });

  it('mixes trackers in when trackersFirst is false', () => {
    const list = [
      device('loud', { rssi: -30 }),
      device('tracker', { rssi: -95, tracker: TRACKER }),
      device('quiet', { rssi: -80 }),
    ];
    expect(ids(sortDevices(list, 'signal', { trackersFirst: false }))).toEqual(['loud', 'quiet', 'tracker']);
  });
});

describe('sortDevices by name', () => {
  it('sorts case-insensitively with unnamed devices last', () => {
    const list = [
      device('1', { name: 'charlie' }),
      device('2'),
      device('3', { name: 'Bravo' }),
      device('4', { name: 'alpha' }),
    ];
    expect(ids(sortDevices(list, 'name'))).toEqual(['4', '3', '1', '2']);
  });

  it('does not sort a device literally named "Unnamed device" as unnamed', () => {
    const list = [device('1'), device('2', { name: 'Unnamed device' }), device('3', { name: 'Zed' })];
    expect(ids(sortDevices(list, 'name'))).toEqual(['2', '3', '1']);
  });

  it('breaks ties by id, including names that differ only in case', () => {
    const list = [
      device('b', { name: 'Speaker' }),
      device('a', { name: 'speaker' }),
      device('d'),
      device('c'),
    ];
    expect(ids(sortDevices(list, 'name'))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(sortDevices([...list].reverse(), 'name'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('uses nicknames', () => {
    const list = [device('1', { name: 'Alpha' }), device('2', { name: 'Bravo' }), device('3')];
    const nicknames = { 2: 'aardvark', 3: 'Car keys' };
    expect(ids(sortDevices(list, 'name', { nicknames }))).toEqual(['2', '1', '3']);
  });

  it('puts trackers first unless turned off', () => {
    const list = [device('1', { name: 'Alpha' }), device('2', { name: 'Zulu', tracker: TRACKER })];
    expect(ids(sortDevices(list, 'name'))).toEqual(['2', '1']);
    expect(ids(sortDevices(list, 'name', { trackersFirst: false }))).toEqual(['1', '2']);
  });
});

describe('sortDevices in general', () => {
  it('returns a new array and leaves the input alone', () => {
    const list = Object.freeze([device('b', { rssi: -90 }), device('a', { rssi: -40 })]);
    const sorted = sortDevices(list, 'signal');
    expect(sorted).not.toBe(list);
    expect(ids(list)).toEqual(['b', 'a']);
    expect(ids(sorted)).toEqual(['a', 'b']);
  });

  it('handles an empty list', () => {
    expect(sortDevices([], 'signal')).toEqual([]);
    expect(sortDevices([], 'name')).toEqual([]);
  });
});

describe('filterDevices', () => {
  const list = [
    device('tracker', { tracker: TRACKER }),
    device('named', { name: 'Headphones' }),
    device('nicknamed'),
    device('blank', { name: '   ' }),
    device('plain'),
  ];
  const nicknames = { nicknamed: 'My keys', plain: '  ' };

  it('keeps everything for "all" in a new array', () => {
    const result = filterDevices(list, 'all');
    expect(result).not.toBe(list);
    expect(ids(result)).toEqual(ids(list));
  });

  it('keeps only tracker matches for "trackers"', () => {
    expect(ids(filterDevices(list, 'trackers'))).toEqual(['tracker']);
  });

  it('keeps devices with a name or nickname for "named"', () => {
    expect(ids(filterDevices(list, 'named'))).toEqual(['named']);
    expect(ids(filterDevices(list, 'named', nicknames))).toEqual(['named', 'nicknamed']);
  });

  it('handles an empty list', () => {
    expect(filterDevices([], 'all')).toEqual([]);
    expect(filterDevices([], 'trackers')).toEqual([]);
    expect(filterDevices([], 'named')).toEqual([]);
  });
});
