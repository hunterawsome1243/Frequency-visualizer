import { base64ToBytes } from './base64';
import type { Advertisement, TrackerMatch, TrackerType } from './types';

/*
 * Best-effort tracker detection from Bluetooth advertisement data. Sources, checked 2026-10-18:
 * - AirGuard by SEEMOO, TU Darmstadt: github.com/seemoo-lab/AirGuard (DeviceManager.kt and
 *   database/models/device/types/*.kt) and github.com/seemoo-lab/AirGuard-iOS (TrackerConstants).
 * - Apple Find My layout: Heinrich et al., "Who Can Find My Devices?" (PETS 2021), summarised in
 *   github.com/furiousMAC/continuity (messages/findmy.md, messages/proximity_pairing.md).
 * - IETF DULT accessory protocol draft (draft-ietf-dult-accessory-protocol), as implemented in
 *   Nordic's nRF Connect SDK: subsys/dult/bt/adv.c and include/dult/dult.h.
 * - Google Find Hub Network accessory spec, as implemented in the nRF Connect SDK:
 *   subsys/bluetooth/fast_pair/fhn/state.c.
 * - Bluetooth SIG member UUID owners, as listed in BlueZ src/shared/util.c.
 * - AirTag pairing model ids: community reverse engineering of Apple Proximity Pairing
 *   (Flipper Zero ble_spam protocols/continuity.c). No official source, so it only gives "possible".
 *
 * Patterns:
 * - Apple manufacturer data is company id 0x004C (bytes 4c 00) followed by Continuity messages,
 *   each [type][length][payload]. Type 0x12 is Find My (offline finding). Payload length 0x19 is
 *   the full public key, sent while separated from the owner; length 0x02 is the short "near
 *   owner" form. The first payload byte is the status byte: bits 4-5 give the device kind
 *   (0 Apple device, 1 AirTag, 2 Find My accessory from another brand, 3 AirPods).
 * - Type 0x07 is Proximity Pairing: [prefix][model hi][model lo]... Model 0x0055 (AirTag) or
 *   0x0030 (Hermes AirTag) is what an AirTag sends before it has been set up.
 * - DULT: service data 0xFCB2 = [network id][near-owner byte, bit 0 set = near owner][...].
 *   Network id 0x01 is Apple Find My, 0x02 Google Find Hub.
 * - Google Find Hub: Eddystone service data 0xFEAA whose frame type is 0x40, or 0x41 when the
 *   tracker is in its "unwanted tracking protection" mode, i.e. away from its owner. Other
 *   Eddystone frames (0x00 UID, 0x10 URL, 0x20 TLM, 0x30 EID) are ordinary beacons.
 * - Samsung SmartTag: service 0xFD5A. The low 3 bits of the first service-data byte are the
 *   owner-connection state: 1, 2 or 3 mean offline from the owner (from minutes to over a day).
 * - Tile: 0xFEED is what AirGuard matches; 0xFEEC and 0xFD84 are also registered to Tile, Inc.
 * - Chipolo: 0xFE33 is what AirGuard matches; 0xFE65 is also registered to Chipolo d.o.o.
 *   The Chipolo ONE Spot and Card Spot use Apple Find My and are caught by the Apple check.
 *
 * Deliberately not flagged (they are everyday personal devices, and the vendors' own
 * unwanted-tracking alerts do not cover them either, so flagging them would mostly be noise):
 * - Apple devices (status kind 0: iPhone, iPad, Mac, Watch) sending Find My while offline.
 * - AirPods near their owner (someone wearing their earbuds). AirPods away from their owner are
 *   flagged as "possible", because Apple's own alerts do include AirPods.
 * - AirPods and Beats Proximity Pairing broadcasts.
 * - Samsung 0xFD69 (Find My Mobile), which Galaxy phones, tablets, watches and earbuds send.
 *
 * Platform note: iOS hides Apple's Find My manufacturer data from apps, so the Apple checks
 * mostly fire on Android. Service-data checks work on both.
 */

type Confidence = TrackerMatch['confidence'];

interface ParsedAdvertisement {
  /** Raw manufacturer data, company id first. Empty when missing or not valid base64. */
  manufacturer: Uint8Array;
  /** 16-bit service UUIDs seen in the UUID list or as service-data keys. */
  services: Set<number>;
  /** Service data by 16-bit UUID. */
  serviceData: Map<number, Uint8Array>;
  names: string[];
}

interface ContinuityMessage {
  type: number;
  payload: Uint8Array;
}

const EMPTY = new Uint8Array(0);

const APPLE_COMPANY_ID_LOW = 0x4c;
const APPLE_COMPANY_ID_HIGH = 0x00;
const APPLE_PROXIMITY_PAIRING = 0x07;
const APPLE_FIND_MY = 0x12;
const FIND_MY_SEPARATED_LENGTH = 0x19;
const FIND_MY_NEAR_OWNER_LENGTH = 0x02;
const AIRTAG_PAIRING_MODELS = [0x0055, 0x0030];

const FIND_MY_KIND_AIRTAG = 1;
const FIND_MY_KIND_ACCESSORY = 2;
const FIND_MY_KIND_AIRPODS = 3;

const UUID_DULT = 0xfcb2;
const UUID_EDDYSTONE = 0xfeaa;
const UUID_SMARTTAG = 0xfd5a;
const UUID_TILE = 0xfeed;
const UUIDS_TILE_OTHER = [0xfeec, 0xfd84];
const UUID_CHIPOLO = 0xfe33;
const UUIDS_CHIPOLO_OTHER = [0xfe65];

const DULT_NETWORK_APPLE = 0x01;
const DULT_NETWORK_GOOGLE = 0x02;
const FIND_HUB_FRAME = 0x40;
const FIND_HUB_FRAME_AWAY = 0x41;

const TYPE_NAMES: Record<TrackerType, string> = {
  airtag: 'AirTag',
  'find-my': 'Find My tracker',
  tile: 'Tile tracker',
  smarttag: 'Samsung SmartTag',
  chipolo: 'Chipolo tracker',
  'find-hub': 'Find Hub tracker',
  'unknown-tracker': 'tracker',
};

const NAME_HINTS: { pattern: RegExp; type: TrackerType; brand: string }[] = [
  { pattern: /air\s?tag/i, type: 'airtag', brand: 'AirTag' },
  // Word start, so "Volatile" or "Textile" do not count.
  { pattern: /\btile/i, type: 'tile', brand: 'Tile' },
  { pattern: /smart\s?tag/i, type: 'smarttag', brand: 'SmartTag' },
  { pattern: /chipolo/i, type: 'chipolo', brand: 'Chipolo' },
];

const SHORT_UUID = /^([0-9a-f]{4})$/;
const UUID_32_BIT = /^0000([0-9a-f]{4})$/;
const UUID_128_BIT = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/;

/**
 * Turns a Bluetooth UUID into its 16-bit number. Accepts "FEED", "0xfeed", "0000FEED" and
 * "0000feed-0000-1000-8000-00805f9b34fb" in any case. Returns null for anything else,
 * including custom 128-bit UUIDs.
 */
export function toShortUuid(uuid: unknown): number | null {
  if (typeof uuid !== 'string') return null;
  const s = uuid.trim().toLowerCase().replace(/^0x/, '');
  const m = SHORT_UUID.exec(s) ?? UUID_32_BIT.exec(s) ?? UUID_128_BIT.exec(s);
  return m ? parseInt(m[1], 16) : null;
}

// From most to least specific; see detectTracker for how the result is picked.
const DETECTORS: ((ad: ParsedAdvertisement) => TrackerMatch | null)[] = [
  detectAppleFindMy,
  detectDult,
  detectFindHub,
  detectSmartTag,
  detectTile,
  detectChipolo,
  detectUnregisteredAirTag,
  detectByName,
];

/**
 * Best-effort guess whether an advertisement comes from a tracker (AirTag / Apple Find My,
 * Tile, Samsung SmartTag, Chipolo, Google Find Hub, or any tracker using the cross-brand
 * unwanted-tracking signal). Returns null when nothing matches. Never claims certainty:
 * labels say "Possible ..." or "Likely ...". Never throws, whatever the data looks like.
 */
export function detectTracker(ad: Advertisement): TrackerMatch | null {
  if (!ad || typeof ad !== 'object') return null;
  let parsed: ParsedAdvertisement;
  try {
    parsed = parseAdvertisement(ad);
  } catch {
    return null;
  }

  // Detectors run from most to least specific. The first "likely" wins; otherwise the first
  // "possible" is kept, so a weak name hint never hides a stronger pattern.
  let fallback: TrackerMatch | null = null;
  for (const detect of DETECTORS) {
    let found: TrackerMatch | null = null;
    try {
      found = detect(parsed);
    } catch {
      found = null;
    }
    if (!found) continue;
    if (found.confidence === 'likely') return found;
    if (!fallback) fallback = found;
  }
  return fallback;
}

function detectAppleFindMy(ad: ParsedAdvertisement): TrackerMatch | null {
  const msg = appleMessages(ad.manufacturer).find(
    (m) =>
      m.type === APPLE_FIND_MY &&
      (m.payload.length === FIND_MY_SEPARATED_LENGTH ||
        m.payload.length === FIND_MY_NEAR_OWNER_LENGTH),
  );
  if (!msg) return null;

  const away = msg.payload.length === FIND_MY_SEPARATED_LENGTH;
  const where = away ? 'away from its owner' : 'near its owner';
  const confidence: Confidence = away ? 'likely' : 'possible';
  const kind = (msg.payload[0] & 0x30) >> 4;

  switch (kind) {
    case FIND_MY_KIND_AIRTAG:
      return match('airtag', confidence, `Apple Find My broadcast that looks like an AirTag ${where}.`);
    case FIND_MY_KIND_ACCESSORY:
      return match(
        'find-my',
        confidence,
        `Apple Find My broadcast from a tracker made by another brand, ${where}.`,
      );
    case FIND_MY_KIND_AIRPODS:
      if (!away) return null;
      return match(
        'find-my',
        'possible',
        "Apple Find My broadcast from AirPods away from their owner, which are usually just someone's earbuds.",
        'AirPods (Find My)',
      );
    default:
      return null;
  }
}

function detectDult(ad: ParsedAdvertisement): TrackerMatch | null {
  const data = ad.serviceData.get(UUID_DULT);
  if (!data || data.length === 0) {
    if (!ad.services.has(UUID_DULT)) return null;
    return match(
      'unknown-tracker',
      'possible',
      'Lists the shared unwanted-tracking alert service that trackers use, but sends none of its details.',
    );
  }

  const network = data[0];
  const type: TrackerType =
    network === DULT_NETWORK_APPLE
      ? 'find-my'
      : network === DULT_NETWORK_GOOGLE
        ? 'find-hub'
        : 'unknown-tracker';
  const networkText =
    network === DULT_NETWORK_APPLE
      ? " for Apple's Find My network"
      : network === DULT_NETWORK_GOOGLE
        ? " for Google's Find Hub network"
        : '';

  if (data.length < 2) {
    return match(type, 'possible', `Sends the shared unwanted-tracking alert signal${networkText}.`);
  }
  const nearOwner = (data[1] & 0x01) === 0x01;
  return match(
    type,
    nearOwner ? 'possible' : 'likely',
    `Sends the shared unwanted-tracking alert signal${networkText} and says it is ${
      nearOwner ? 'near its owner' : 'away from its owner'
    }.`,
  );
}

function detectFindHub(ad: ParsedAdvertisement): TrackerMatch | null {
  const data = ad.serviceData.get(UUID_EDDYSTONE);
  if (!data || data.length === 0) return null;
  if (data[0] === FIND_HUB_FRAME_AWAY) {
    return match(
      'find-hub',
      'likely',
      'Google Find Hub broadcast from a tracker that says it is away from its owner.',
    );
  }
  if (data[0] === FIND_HUB_FRAME) {
    return match(
      'find-hub',
      'possible',
      'Google Find Hub broadcast from a tracker that was near its owner recently.',
    );
  }
  return null;
}

function detectSmartTag(ad: ParsedAdvertisement): TrackerMatch | null {
  if (!ad.services.has(UUID_SMARTTAG)) return null;
  const data = ad.serviceData.get(UUID_SMARTTAG);
  if (!data || data.length === 0) {
    return match('smarttag', 'likely', 'Samsung SmartThings Find broadcast that looks like a SmartTag.');
  }
  const state = data[0] & 0x07;
  if (state >= 1 && state <= 3) {
    return match(
      'smarttag',
      'likely',
      'Samsung SmartThings Find broadcast that looks like a SmartTag away from its owner.',
    );
  }
  return match(
    'smarttag',
    'possible',
    'Samsung SmartThings Find broadcast that looks like a SmartTag near its owner.',
  );
}

function detectTile(ad: ParsedAdvertisement): TrackerMatch | null {
  if (ad.services.has(UUID_TILE)) {
    return match('tile', 'likely', "Bluetooth broadcast with Tile's tracker service ID.");
  }
  if (UUIDS_TILE_OTHER.some((u) => ad.services.has(u))) {
    return match(
      'tile',
      'possible',
      'Uses a Bluetooth service ID registered to Tile, so it may be a Tile tracker.',
    );
  }
  return null;
}

function detectChipolo(ad: ParsedAdvertisement): TrackerMatch | null {
  if (ad.services.has(UUID_CHIPOLO)) {
    return match('chipolo', 'likely', "Bluetooth broadcast with Chipolo's tracker service ID.");
  }
  if (UUIDS_CHIPOLO_OTHER.some((u) => ad.services.has(u))) {
    return match(
      'chipolo',
      'possible',
      'Uses a Bluetooth service ID registered to Chipolo, so it may be a Chipolo tracker.',
    );
  }
  return null;
}

function detectUnregisteredAirTag(ad: ParsedAdvertisement): TrackerMatch | null {
  const msg = appleMessages(ad.manufacturer).find(
    (m) => m.type === APPLE_PROXIMITY_PAIRING && m.payload.length >= 3,
  );
  if (!msg) return null;
  const model = (msg.payload[1] << 8) | msg.payload[2];
  if (!AIRTAG_PAIRING_MODELS.includes(model)) return null;
  return match(
    'airtag',
    'possible',
    'Apple setup broadcast that looks like an AirTag that has not been set up yet.',
  );
}

function detectByName(ad: ParsedAdvertisement): TrackerMatch | null {
  for (const hint of NAME_HINTS) {
    if (ad.names.some((n) => hint.pattern.test(n))) {
      return match(
        hint.type,
        'possible',
        `Its Bluetooth name mentions ${hint.brand}, but nothing else in the broadcast confirms it.`,
      );
    }
  }
  return null;
}

function match(type: TrackerType, confidence: Confidence, reason: string, name?: string): TrackerMatch {
  const prefix = confidence === 'likely' ? 'Likely' : 'Possible';
  return { type, confidence, label: `${prefix} ${name ?? TYPE_NAMES[type]}`, reason };
}

function parseAdvertisement(ad: Advertisement): ParsedAdvertisement {
  const services = new Set<number>();
  const serviceData = new Map<number, Uint8Array>();

  if (Array.isArray(ad.serviceUUIDs)) {
    for (const uuid of ad.serviceUUIDs) {
      const short = toShortUuid(uuid);
      if (short !== null) services.add(short);
    }
  }

  if (ad.serviceData && typeof ad.serviceData === 'object') {
    for (const [key, value] of Object.entries(ad.serviceData)) {
      const short = toShortUuid(key);
      if (short === null) continue;
      services.add(short);
      const bytes = decode(value);
      const previous = serviceData.get(short);
      if (!previous || previous.length === 0) serviceData.set(short, bytes);
    }
  }

  const names = [ad.localName, ad.name].filter(
    (n): n is string => typeof n === 'string' && n.length > 0,
  );

  return { manufacturer: decode(ad.manufacturerData), services, serviceData, names };
}

function decode(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length === 0) return EMPTY;
  try {
    const bytes = base64ToBytes(value);
    return bytes instanceof Uint8Array ? bytes : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Splits Apple manufacturer data into Continuity messages. Stops at the first message that does not fit. */
function appleMessages(data: Uint8Array): ContinuityMessage[] {
  if (data.length < 2 || data[0] !== APPLE_COMPANY_ID_LOW || data[1] !== APPLE_COMPANY_ID_HIGH) {
    return [];
  }
  const messages: ContinuityMessage[] = [];
  let i = 2;
  while (i + 1 < data.length) {
    const type = data[i];
    const start = i + 2;
    const end = start + data[i + 1];
    if (end > data.length) break;
    messages.push({ type, payload: data.subarray(start, end) });
    i = end;
  }
  return messages;
}
