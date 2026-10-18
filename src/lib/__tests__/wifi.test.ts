import {
  frequencyToBand,
  frequencyToChannel,
  HIDDEN_NETWORK_LABEL,
  type RawWifiEntry,
  toWifiNetworks,
  wifiBars,
  wifiSecurity,
} from '@/lib/wifi';

function entry(overrides: Partial<RawWifiEntry> = {}): RawWifiEntry {
  return {
    SSID: 'Home',
    BSSID: 'aa:bb:cc:dd:ee:ff',
    capabilities: '[WPA2-PSK-CCMP][ESS]',
    frequency: 2437,
    level: -55,
    timestamp: 123,
    ...overrides,
  };
}

describe('frequencyToChannel', () => {
  it.each([
    [2412, 1],
    [2437, 6],
    [2462, 11],
    [2472, 13],
    [2484, 14],
  ])('2.4 GHz: %p MHz is channel %p', (frequency, channel) => {
    expect(frequencyToChannel(frequency)).toBe(channel);
  });

  it.each([
    [5160, 32],
    [5180, 36],
    [5500, 100],
    [5745, 149],
    [5825, 165],
    [5885, 177],
  ])('5 GHz: %p MHz is channel %p', (frequency, channel) => {
    expect(frequencyToChannel(frequency)).toBe(channel);
  });

  it.each([
    [5955, 1],
    [5975, 5],
    [6115, 33],
    [7115, 233],
  ])('6 GHz: %p MHz is channel %p', (frequency, channel) => {
    expect(frequencyToChannel(frequency)).toBe(channel);
  });

  it.each([0, -1, 2407, 2411, 2477, 2483, 2485, 5155, 5890, 5950, 7120, 60480, NaN, Infinity])(
    'gives null outside the known ranges (%p MHz)',
    (frequency) => {
      expect(frequencyToChannel(frequency)).toBeNull();
    },
  );

  it('gives null for frequencies off the 5 MHz channel grid', () => {
    expect(frequencyToChannel(2413)).toBeNull();
    expect(frequencyToChannel(5182)).toBeNull();
    expect(frequencyToChannel(2437.5)).toBeNull();
  });
});

describe('frequencyToBand', () => {
  it.each([
    [2412, '2.4 GHz'],
    [2472, '2.4 GHz'],
    [2484, '2.4 GHz'],
    [5160, '5 GHz'],
    [5885, '5 GHz'],
    [5955, '6 GHz'],
    [7115, '6 GHz'],
  ] as const)('%p MHz is %p', (frequency, band) => {
    expect(frequencyToBand(frequency)).toBe(band);
  });

  it.each([0, 2411, 2473, 2483, 2485, 5159, 5886, 5954, 7116, NaN, -Infinity])(
    'gives unknown for %p MHz',
    (frequency) => {
      expect(frequencyToBand(frequency)).toBe('unknown');
    },
  );
});

describe('toWifiNetworks', () => {
  it('converts raw entries', () => {
    expect(toWifiNetworks([entry({ frequency: 5180, level: -61 })])).toEqual([
      {
        ssid: 'Home',
        bssid: 'aa:bb:cc:dd:ee:ff',
        level: -61,
        frequency: 5180,
        channel: 36,
        band: '5 GHz',
        capabilities: '[WPA2-PSK-CCMP][ESS]',
      },
    ]);
  });

  it('marks unknown frequencies', () => {
    const [network] = toWifiNetworks([entry({ frequency: 60480 })]);
    expect(network.channel).toBeNull();
    expect(network.band).toBe('unknown');
  });

  it.each(['', '   ', '<unknown ssid>', '<UNKNOWN SSID>', '\u0000\u0000\u0000'])(
    'shows %p as a hidden network',
    (ssid) => {
      expect(toWifiNetworks([entry({ SSID: ssid })])[0].ssid).toBe(HIDDEN_NETWORK_LABEL);
    },
  );

  it('shows a missing SSID as a hidden network', () => {
    const raw = entry({ SSID: null as unknown as string });
    expect(toWifiNetworks([raw])[0].ssid).toBe('(hidden network)');
  });

  it('keeps real names exactly as given', () => {
    expect(toWifiNetworks([entry({ SSID: ' Café 5G ' })])[0].ssid).toBe(' Café 5G ');
  });

  it('sorts strongest first', () => {
    const networks = toWifiNetworks([
      entry({ SSID: 'weak', level: -85 }),
      entry({ SSID: 'strong', level: -40 }),
      entry({ SSID: 'mid', level: -67 }),
    ]);
    expect(networks.map((n) => n.ssid)).toEqual(['strong', 'mid', 'weak']);
  });

  it('breaks ties by name, then BSSID, so the order is stable', () => {
    const raw = [
      entry({ SSID: 'b', BSSID: '02', level: -50 }),
      entry({ SSID: 'a', BSSID: '02', level: -50 }),
      entry({ SSID: 'a', BSSID: '01', level: -50 }),
    ];
    const expected = [
      ['a', '01'],
      ['a', '02'],
      ['b', '02'],
    ];
    expect(toWifiNetworks(raw).map((n) => [n.ssid, n.bssid])).toEqual(expected);
    expect(toWifiNetworks([...raw].reverse()).map((n) => [n.ssid, n.bssid])).toEqual(expected);
  });

  it('puts entries without a usable level last', () => {
    const networks = toWifiNetworks([
      entry({ SSID: 'broken', level: NaN }),
      entry({ SSID: 'ok', level: -90 }),
    ]);
    expect(networks.map((n) => n.ssid)).toEqual(['ok', 'broken']);
  });

  it('does not change the input array', () => {
    const raw = Object.freeze([entry({ SSID: 'weak', level: -90 }), entry({ SSID: 'strong', level: -30 })]);
    toWifiNetworks(raw);
    expect(raw.map((e) => e.SSID)).toEqual(['weak', 'strong']);
  });

  it('gives an empty list for no entries', () => {
    expect(toWifiNetworks([])).toEqual([]);
  });
});

describe('wifiSecurity', () => {
  test.each([
    ['[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]', true, 'WPA2'],
    ['[RSN-SAE-CCMP][ESS]', true, 'WPA3'],
    ['[WPA2-PSK-CCMP][RSN-PSK+SAE-CCMP][ESS]', true, 'WPA2/WPA3'],
    ['[WPA-PSK-TKIP][ESS]', true, 'WPA'],
    ['[WPA-PSK-TKIP][WPA2-PSK-CCMP][ESS]', true, 'WPA2'],
    ['[WPA2-EAP-CCMP][ESS]', true, 'WPA2'],
    ['[WEP][ESS]', true, 'WEP'],
    ['[RSN-OWE-CCMP][ESS]', false, 'Enhanced Open'],
    ['[ESS]', false, 'Open'],
    ['', false, 'Open'],
  ])('%s is secured: %s (%s)', (capabilities, secured, label) => {
    expect(wifiSecurity(capabilities)).toEqual({ secured, label });
  });
});

test('wifiBars gives more bars for a stronger signal', () => {
  expect([-40, -55, -60, -67, -70, -78, -90].map(wifiBars)).toEqual([4, 4, 3, 3, 2, 2, 1]);
  expect(wifiBars(Number.NaN)).toBe(0);
});
