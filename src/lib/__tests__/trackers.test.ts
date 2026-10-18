import { base64ToBytes } from '@/lib/base64';
import { detectTracker, toShortUuid } from '@/lib/trackers';
import type { Advertisement, TrackerMatch, TrackerType } from '@/lib/types';

// ./base64 belongs to another part of the app, so these tests use their own small decoder.
jest.mock('../base64', () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  return {
    base64ToBytes: jest.fn((input: string | null | undefined): Uint8Array => {
      if (typeof input !== 'string') return new Uint8Array(0);
      const clean = input.replace(/=+$/, '');
      if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) return new Uint8Array(0);
      const out: number[] = [];
      let buffer = 0;
      let bits = 0;
      for (const ch of clean) {
        buffer = ((buffer << 6) | alphabet.indexOf(ch)) & 0xffffff;
        bits += 6;
        if (bits >= 8) {
          bits -= 8;
          out.push((buffer >> bits) & 0xff);
        }
      }
      return Uint8Array.from(out);
    }),
  };
});

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** "4c 00 12" -> base64, so fixtures read like a packet capture. */
function b64(hex: string): string {
  const bytes = (hex.match(/[0-9a-f]{2}/gi) ?? []).map((h) => parseInt(h, 16));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(chunk >> 18) & 63] + ALPHABET[(chunk >> 12) & 63];
    out += i + 1 < bytes.length ? ALPHABET[(chunk >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? ALPHABET[chunk & 63] : '=';
  }
  return out;
}

function full(short: string): string {
  return `0000${short}-0000-1000-8000-00805f9b34fb`;
}

function ad(overrides: Partial<Advertisement> = {}): Advertisement {
  return {
    id: 'C4:3A:1F:00:12:34',
    name: null,
    localName: null,
    rssi: -64,
    manufacturerData: null,
    serviceUUIDs: null,
    serviceData: null,
    txPowerLevel: null,
    isConnectable: null,
    ...overrides,
  };
}

// 22 key bytes, 1 byte of key bits and the hint byte, as in furiousMAC/continuity's example.
const KEY = '57 36 4d c7 fb 77 86 6c 40 c9 10 76 60 3c b3 7c 1f 59 f9 23 ab 3a 03 00';
const findMyAway = (status: string) => b64(`4c 00 12 19 ${status} ${KEY}`);
const findMyNear = (status: string) => b64(`4c 00 12 02 ${status} 03`);
// Proximity Pairing: prefix, model (2 bytes), then 22 bytes of status, battery and encrypted data.
const pairing = (prefix: string, model: string) =>
  b64(`4c 00 07 19 ${prefix} ${model} 55 aa 30 01 00 00 45 12 12 12 00 00 00 00 00 00 00 00 00 00 00 00`);
const EID = 'a1 b2 c3 d4 e5 f6 07 18 29 3a 4b 5c 6d 7e 8f 90 01 12 23 34';

function expectMatch(result: TrackerMatch | null, expected: Partial<TrackerMatch>) {
  expect(result).not.toBeNull();
  expect(result).toMatchObject(expected);
}

describe('toShortUuid', () => {
  it.each([
    ['FEED', 0xfeed],
    ['feed', 0xfeed],
    ['0xFEED', 0xfeed],
    ['0000FEED', 0xfeed],
    ['0000feed-0000-1000-8000-00805f9b34fb', 0xfeed],
    ['0000FD5A-0000-1000-8000-00805F9B34FB', 0xfd5a],
    ['  fcb2 ', 0xfcb2],
  ])('reads %p as a 16-bit UUID', (input, expected) => {
    expect(toShortUuid(input)).toBe(expected);
  });

  it.each([
    ['7dfc9000-7d1c-4951-86aa-8d9728f8d66c'],
    ['1234feed-0000-1000-8000-00805f9b34fb'],
    ['FEE'],
    ['FEEDS'],
    [''],
    [null],
    [42],
  ])('returns null for %p', (input) => {
    expect(toShortUuid(input)).toBeNull();
  });
});

describe('detectTracker', () => {
  describe('Apple Find My (type 0x12)', () => {
    it('flags an AirTag away from its owner as likely', () => {
      expect(detectTracker(ad({ manufacturerData: findMyAway('10') }))).toEqual({
        type: 'airtag',
        confidence: 'likely',
        label: 'Likely AirTag',
        reason: 'Apple Find My broadcast that looks like an AirTag away from its owner.',
      });
    });

    it('reads the device kind from bits 4-5 whatever the battery and maintained bits say', () => {
      // 0x54: medium battery (bits 6-7 = 01), AirTag (bits 4-5 = 01), maintained bit 2 set.
      expectMatch(detectTracker(ad({ manufacturerData: findMyAway('54') })), {
        type: 'airtag',
        confidence: 'likely',
      });
      // 0xd0: critically low battery, AirTag.
      expectMatch(detectTracker(ad({ manufacturerData: findMyAway('d0') })), { type: 'airtag' });
    });

    it('flags an AirTag near its owner as possible', () => {
      expectMatch(detectTracker(ad({ manufacturerData: findMyNear('10') })), {
        type: 'airtag',
        confidence: 'possible',
        label: 'Possible AirTag',
        reason: 'Apple Find My broadcast that looks like an AirTag near its owner.',
      });
    });

    it('flags a Find My accessory from another brand', () => {
      expectMatch(detectTracker(ad({ manufacturerData: findMyAway('20') })), {
        type: 'find-my',
        confidence: 'likely',
        label: 'Likely Find My tracker',
        reason: 'Apple Find My broadcast from a tracker made by another brand, away from its owner.',
      });
      expectMatch(detectTracker(ad({ manufacturerData: findMyNear('60') })), {
        type: 'find-my',
        confidence: 'possible',
        label: 'Possible Find My tracker',
      });
    });

    it('flags AirPods away from their owner only as possible', () => {
      expectMatch(detectTracker(ad({ manufacturerData: findMyAway('30') })), {
        type: 'find-my',
        confidence: 'possible',
        label: 'Possible AirPods (Find My)',
      });
    });

    it('ignores AirPods near their owner', () => {
      expect(detectTracker(ad({ manufacturerData: findMyNear('30') }))).toBeNull();
    });

    it('ignores iPhones, iPads and Macs sending Find My while offline', () => {
      expect(detectTracker(ad({ manufacturerData: findMyAway('00') }))).toBeNull();
      expect(detectTracker(ad({ manufacturerData: findMyNear('00') }))).toBeNull();
    });

    it('finds the Find My message after other Continuity messages', () => {
      // Nearby Info (0x10, 5 bytes) first, then a short Find My message.
      const data = b64('4c 00 10 05 01 18 1c 6d 4e 12 02 10 03');
      expectMatch(detectTracker(ad({ manufacturerData: data })), {
        type: 'airtag',
        confidence: 'possible',
      });
    });
  });

  describe('Apple broadcasts that are not trackers', () => {
    it('ignores an iBeacon even when its UUID contains Find My-looking bytes', () => {
      const ibeacon = b64(
        '4c 00 02 15 12 19 10 aa 12 02 10 03 e2 5a 4e 7b 9f 3c 11 22 00 01 00 02 c5',
      );
      expect(detectTracker(ad({ manufacturerData: ibeacon }))).toBeNull();
    });

    it('ignores Nearby Info and Handoff messages', () => {
      expect(detectTracker(ad({ manufacturerData: b64('4c 00 10 05 01 18 1c 6d 4e') }))).toBeNull();
      expect(
        detectTracker(
          ad({ manufacturerData: b64('4c 00 0c 0e 00 a7 5b 2f 86 64 1c 1a 0b 37 92 f0 3e 51') }),
        ),
      ).toBeNull();
    });

    it('ignores AirPods and Beats pairing broadcasts', () => {
      expect(detectTracker(ad({ manufacturerData: pairing('01', '0e 20') }))).toBeNull();
      expect(detectTracker(ad({ manufacturerData: pairing('07', '10 20') }))).toBeNull();
    });

    it('ignores Find My bytes under another company id', () => {
      // Microsoft (0x0006) followed by bytes that would mean "AirTag" for Apple.
      expect(detectTracker(ad({ manufacturerData: b64(`06 00 12 19 10 ${KEY}`) }))).toBeNull();
    });
  });

  describe('Apple AirTag that has not been set up (type 0x07)', () => {
    it('flags the AirTag pairing model as possible', () => {
      expectMatch(detectTracker(ad({ manufacturerData: pairing('05', '00 55') })), {
        type: 'airtag',
        confidence: 'possible',
        label: 'Possible AirTag',
        reason: 'Apple setup broadcast that looks like an AirTag that has not been set up yet.',
      });
    });

    it('flags the Hermes AirTag pairing model', () => {
      expectMatch(detectTracker(ad({ manufacturerData: pairing('05', '00 30') })), {
        type: 'airtag',
      });
    });
  });

  describe('malformed Apple data', () => {
    it.each([
      ['company id only', '4c 00'],
      ['one byte', '4c'],
      ['type with no length', '4c 00 12'],
      ['Find My with no status byte', '4c 00 12 00'],
      ['Find My cut short', '4c 00 12 19 10 57 36 4d'],
      ['Find My with an unknown length', '4c 00 12 05 10 01 02 03 04'],
      ['pairing cut short', '4c 00 07 19 05 00'],
      ['pairing too short to hold a model', '4c 00 07 02 05 00'],
    ])('returns null for %s', (_label, hex) => {
      expect(detectTracker(ad({ manufacturerData: b64(hex) }))).toBeNull();
    });

    it('returns null for manufacturer data that is not base64', () => {
      expect(detectTracker(ad({ manufacturerData: '!!not base64!!' }))).toBeNull();
      expect(detectTracker(ad({ manufacturerData: '' }))).toBeNull();
    });
  });

  describe('cross-brand unwanted-tracking signal (DULT, 0xFCB2)', () => {
    it('flags an Apple-network tracker away from its owner', () => {
      expectMatch(detectTracker(ad({ serviceData: { [full('fcb2')]: b64('01 00') } })), {
        type: 'find-my',
        confidence: 'likely',
        label: 'Likely Find My tracker',
        reason:
          "Sends the shared unwanted-tracking alert signal for Apple's Find My network and says it is away from its owner.",
      });
    });

    it('flags a Google-network tracker near its owner as possible', () => {
      expectMatch(detectTracker(ad({ serviceData: { FCB2: b64('02 01 aa bb') } })), {
        type: 'find-hub',
        confidence: 'possible',
        label: 'Possible Find Hub tracker',
      });
    });

    it('flags a tracker on an unknown network', () => {
      expectMatch(detectTracker(ad({ serviceData: { fcb2: b64('07 00') } })), {
        type: 'unknown-tracker',
        confidence: 'likely',
        label: 'Likely tracker',
        reason: 'Sends the shared unwanted-tracking alert signal and says it is away from its owner.',
      });
    });

    it('is only possible when the near-owner byte is missing', () => {
      expectMatch(detectTracker(ad({ serviceData: { fcb2: b64('01') } })), {
        type: 'find-my',
        confidence: 'possible',
      });
    });

    it('is only possible when the service is listed without data', () => {
      expectMatch(detectTracker(ad({ serviceUUIDs: [full('fcb2')] })), {
        type: 'unknown-tracker',
        confidence: 'possible',
        label: 'Possible tracker',
      });
      expectMatch(detectTracker(ad({ serviceData: { fcb2: '' } })), {
        type: 'unknown-tracker',
        confidence: 'possible',
      });
    });
  });

  describe('Google Find Hub (Eddystone 0xFEAA)', () => {
    it('flags frame type 0x41 (away from owner) as likely', () => {
      expectMatch(detectTracker(ad({ serviceData: { [full('feaa')]: b64(`41 ${EID} 85`) } })), {
        type: 'find-hub',
        confidence: 'likely',
        label: 'Likely Find Hub tracker',
        reason: 'Google Find Hub broadcast from a tracker that says it is away from its owner.',
      });
    });

    it('flags frame type 0x40 as possible', () => {
      expectMatch(detectTracker(ad({ serviceData: { FEAA: b64(`40 ${EID} 04`) } })), {
        type: 'find-hub',
        confidence: 'possible',
      });
    });

    it.each([
      ['UID', '00 e7 00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f'],
      ['URL', '10 e7 03 67 6f 6f 67 6c 65 07'],
      ['TLM', '20 00 0b b8 18 00 00 00 00 2a 00 00 01 f4'],
      ['EID', '30 e7 01 02 03 04 05 06 07 08'],
    ])('ignores an ordinary Eddystone %s beacon', (_label, hex) => {
      expect(detectTracker(ad({ serviceData: { feaa: b64(hex) } }))).toBeNull();
    });

    it('ignores Eddystone listed without data', () => {
      expect(detectTracker(ad({ serviceUUIDs: ['FEAA'] }))).toBeNull();
    });
  });

  describe('Samsung SmartTag (0xFD5A)', () => {
    const tagData = (first: string) => b64(`${first} 3c 12 00 a1 b2 c3 d4 e5 f6 07 18 c3`);

    it.each([['11'], ['12'], ['13']])('flags state byte %p (offline from owner) as likely', (first) => {
      expectMatch(detectTracker(ad({ serviceData: { [full('fd5a')]: tagData(first) } })), {
        type: 'smarttag',
        confidence: 'likely',
        label: 'Likely Samsung SmartTag',
        reason: 'Samsung SmartThings Find broadcast that looks like a SmartTag away from its owner.',
      });
    });

    it.each([['10'], ['14'], ['17']])('flags state byte %p (with owner) as possible', (first) => {
      expectMatch(detectTracker(ad({ serviceData: { FD5A: tagData(first) } })), {
        type: 'smarttag',
        confidence: 'possible',
        label: 'Possible Samsung SmartTag',
      });
    });

    it('flags the service UUID alone as likely', () => {
      expectMatch(detectTracker(ad({ serviceUUIDs: ['FD5A'] })), {
        type: 'smarttag',
        confidence: 'likely',
        reason: 'Samsung SmartThings Find broadcast that looks like a SmartTag.',
      });
    });

    it('does not flag Samsung Find My Mobile (0xFD69) from Galaxy phones and earbuds', () => {
      const data = b64('02 aa bb cc dd ee ff 00 11 22 33 44 55 01');
      expect(detectTracker(ad({ serviceData: { [full('fd69')]: data } }))).toBeNull();
    });
  });

  describe('Tile', () => {
    it('flags 0xFEED in the service list, in any UUID form', () => {
      for (const uuid of [full('feed'), full('FEED').toUpperCase(), 'FEED', 'feed']) {
        expectMatch(detectTracker(ad({ serviceUUIDs: [uuid] })), {
          type: 'tile',
          confidence: 'likely',
          label: 'Likely Tile tracker',
          reason: "Bluetooth broadcast with Tile's tracker service ID.",
        });
      }
    });

    it('flags 0xFEED service data', () => {
      expectMatch(
        detectTracker(ad({ serviceData: { [full('feed')]: b64('02 00 6c 4d 2e 91 a0 33 17 8b') } })),
        { type: 'tile', confidence: 'likely' },
      );
    });

    it('flags other Tile-registered IDs as possible', () => {
      for (const uuid of ['FEEC', full('fd84')]) {
        expectMatch(detectTracker(ad({ serviceUUIDs: [uuid] })), {
          type: 'tile',
          confidence: 'possible',
          label: 'Possible Tile tracker',
        });
      }
    });
  });

  describe('Chipolo', () => {
    it('flags 0xFE33 as likely', () => {
      expectMatch(detectTracker(ad({ serviceUUIDs: [full('fe33')] })), {
        type: 'chipolo',
        confidence: 'likely',
        label: 'Likely Chipolo tracker',
      });
      expectMatch(detectTracker(ad({ serviceData: { FE33: b64('01 01 23 45') } })), {
        type: 'chipolo',
        confidence: 'likely',
      });
    });

    it('flags the other Chipolo-registered ID as possible', () => {
      expectMatch(detectTracker(ad({ serviceUUIDs: ['fe65'] })), {
        type: 'chipolo',
        confidence: 'possible',
      });
    });
  });

  describe('name hints', () => {
    it.each<[string, TrackerType, string]>([
      ['AirTag', 'airtag', 'Possible AirTag'],
      ['Tile', 'tile', 'Possible Tile tracker'],
      ['Tile Mate', 'tile', 'Possible Tile tracker'],
      ['Smart Tag2', 'smarttag', 'Possible Samsung SmartTag'],
      ['Galaxy SmartTag', 'smarttag', 'Possible Samsung SmartTag'],
      ['Chipolo ONE', 'chipolo', 'Possible Chipolo tracker'],
    ])('flags the name %p as possible', (name, type, label) => {
      expectMatch(detectTracker(ad({ localName: name })), { type, confidence: 'possible', label });
    });

    it('uses the device name when there is no local name', () => {
      expectMatch(detectTracker(ad({ name: 'chipolo' })), {
        type: 'chipolo',
        reason: 'Its Bluetooth name mentions Chipolo, but nothing else in the broadcast confirms it.',
      });
    });

    it.each([['Volatile Speaker'], ['Textile Sensor'], ['JBL Flip 6'], ['']])(
      'ignores the name %p',
      (name) => {
        expect(detectTracker(ad({ name, localName: name }))).toBeNull();
      },
    );
  });

  describe('choosing between matches', () => {
    it('prefers a specific pattern over a name hint', () => {
      expectMatch(detectTracker(ad({ localName: 'Tile', serviceUUIDs: ['FEED'] })), {
        type: 'tile',
        confidence: 'likely',
      });
    });

    it('prefers the Apple status byte over the cross-brand signal', () => {
      expectMatch(
        detectTracker(ad({ manufacturerData: findMyAway('10'), serviceData: { fcb2: b64('01 00') } })),
        { type: 'airtag', confidence: 'likely' },
      );
    });

    it('lets a likely match win over an earlier possible one', () => {
      expectMatch(
        detectTracker(ad({ manufacturerData: findMyNear('20'), serviceUUIDs: ['FE33'] })),
        { type: 'chipolo', confidence: 'likely' },
      );
    });

    it('keeps the first possible match when nothing is likely', () => {
      expectMatch(detectTracker(ad({ manufacturerData: findMyNear('10'), localName: 'Chipolo' })), {
        type: 'airtag',
        confidence: 'possible',
      });
    });

    it('falls back to a name hint when the Apple data says it is just a phone', () => {
      expectMatch(detectTracker(ad({ manufacturerData: findMyAway('00'), name: 'AirTag' })), {
        type: 'airtag',
        confidence: 'possible',
      });
    });
  });

  describe('robustness', () => {
    it('returns null for an advertisement with every field empty', () => {
      expect(detectTracker(ad())).toBeNull();
    });

    it('ignores unrelated and custom 128-bit services', () => {
      expect(
        detectTracker(
          ad({
            serviceUUIDs: [full('180f'), '7dfc9000-7d1c-4951-86aa-8d9728f8d66c', 'not-a-uuid'],
            serviceData: { [full('180a')]: b64('01 02'), 'not-a-uuid': b64('41 00') },
          }),
        ),
      ).toBeNull();
    });

    it('survives wrong runtime types without throwing', () => {
      const weird = ad({
        name: 42 as unknown as string,
        localName: {} as unknown as string,
        manufacturerData: 7 as unknown as string,
        serviceUUIDs: 'FEED' as unknown as string[],
        serviceData: { FEAA: null as unknown as string, FD5A: 12 as unknown as string },
      });
      expect(() => detectTracker(weird)).not.toThrow();
      // FD5A is still listed as a key, so the SmartTag check can use it.
      expectMatch(detectTracker(weird), { type: 'smarttag' });
      expect(detectTracker(null as unknown as Advertisement)).toBeNull();
      expect(
        detectTracker(ad({ serviceUUIDs: [null, 5, 'FEED'] as unknown as string[] })),
      ).toMatchObject({ type: 'tile' });
    });

    it('does not throw when the base64 decoder throws', () => {
      const decoder = jest.mocked(base64ToBytes);
      const original = decoder.getMockImplementation();
      decoder.mockImplementation(() => {
        throw new Error('decoder broke');
      });
      try {
        const result = detectTracker(
          ad({ manufacturerData: findMyAway('10'), serviceData: { FD5A: b64('13') }, localName: 'Tile' }),
        );
        expectMatch(result, { type: 'smarttag', confidence: 'likely' });
      } finally {
        if (original) decoder.mockImplementation(original);
      }
    });
  });

  it('never claims certainty in any label and gives one sentence as the reason', () => {
    const samples: Advertisement[] = [
      ad({ manufacturerData: findMyAway('10') }),
      ad({ manufacturerData: findMyNear('20') }),
      ad({ manufacturerData: findMyAway('30') }),
      ad({ manufacturerData: pairing('05', '00 55') }),
      ad({ serviceData: { fcb2: b64('07 01') } }),
      ad({ serviceUUIDs: ['fcb2'] }),
      ad({ serviceData: { feaa: b64(`41 ${EID}`) } }),
      ad({ serviceData: { fd5a: b64('12') } }),
      ad({ serviceUUIDs: ['FEEC'] }),
      ad({ serviceUUIDs: ['FE33'] }),
      ad({ localName: 'AirTag' }),
    ];
    for (const sample of samples) {
      const result = detectTracker(sample);
      expect(result).not.toBeNull();
      expect(result?.label).toMatch(/^(Likely|Possible) /);
      expect(result?.label.toLowerCase()).not.toMatch(/definitely|confirmed|certain/);
      expect(result?.reason).toMatch(/^[A-Z].*\.$/);
      expect(result?.reason.slice(0, -1)).not.toMatch(/\.\s/);
    }
  });
});
