import { act, renderHook } from '@testing-library/react-native';

import { useBleScan } from '@/hooks/use-ble-scan';
import { createFakeScanner, type FakeScanner } from '@/lib/scanner';
import type { Advertisement } from '@/lib/types';

// No jest.mock here: advertisements go through the real device list, tracker detection and base64
// decoding, so a wiring mistake between those layers shows up even when each layer's own tests pass.

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

function ad(id: string, overrides: Partial<Advertisement> = {}): Advertisement {
  return {
    id,
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

/** Apple Find My, separated from its owner: status byte 0x10 (AirTag) plus the rest of the 25-byte key. */
const AIRTAG_AWAY = b64(`4c 00 12 19 10 ${'00 '.repeat(24)}`);
/** The short "near owner" form of the same AirTag. */
const AIRTAG_NEAR = b64('4c 00 12 02 10 03');
const SMARTTAG_SERVICE = '0000fd5a-0000-1000-8000-00805f9b34fb';

let clock = 0;

async function emit(fake: FakeScanner, ...ads: Advertisement[]) {
  await act(async () => {
    for (const each of ads) fake.emit(each);
  });
}

async function advance(ms: number) {
  await act(async () => {
    clock += ms;
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  clock = 1_000;
});

afterEach(() => {
  jest.useRealTimers();
});

test('an AirTag and a SmartTag advertisement come out of the hook flagged as trackers', async () => {
  const fake = createFakeScanner();
  const { result } = await renderHook(() => useBleScan(fake, { now: () => clock }));
  await act(() => result.current.start());

  await emit(fake, ad('T1', { rssi: -58, manufacturerData: AIRTAG_AWAY }));
  clock += 1_000;
  // The near-owner packet only matches "possible", which must not replace the earlier "likely".
  await emit(
    fake,
    ad('T1', { rssi: -62, manufacturerData: AIRTAG_NEAR }),
    ad('S1', { serviceUUIDs: [SMARTTAG_SERVICE] }),
  );
  await advance(500);

  const byId = Object.fromEntries(result.current.devices.map((device) => [device.id, device]));
  expect(byId.T1.tracker).toMatchObject({ type: 'airtag', confidence: 'likely', label: 'Likely AirTag' });
  expect(byId.T1.rssiHistory).toHaveLength(2);
  expect(byId.S1.tracker?.label).toBe('Likely Samsung SmartTag');
});

test('restarting a scan keeps a device and its history until it is heard again', async () => {
  const fake = createFakeScanner();
  const { result } = await renderHook(() => useBleScan(fake, { now: () => clock }));
  await act(() => result.current.start());

  await emit(fake, ad('A', { rssi: -50 }));
  clock += 1_000;
  await emit(fake, ad('A', { rssi: -55 }));
  await advance(500);
  await act(async () => result.current.stop());

  clock += 40_000;
  await act(() => result.current.start());
  await advance(500);
  expect(result.current.devices).toHaveLength(1);
  expect(result.current.devices[0].rssiHistory).toEqual([
    { t: 1_000, rssi: -50 },
    { t: 2_000, rssi: -55 },
  ]);

  await emit(fake, ad('A', { rssi: -52 }));
  await advance(500);
  expect(result.current.devices[0].firstSeen).toBe(1_000);
  expect(result.current.devices[0].rssiHistory).toHaveLength(3);
});
