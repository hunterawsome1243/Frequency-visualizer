// Shared data shapes used by the scanner, the pure helpers in src/lib and the screens.

/** One Bluetooth advertisement as the scanner reports it. Binary fields are base64, as react-native-ble-plx gives them. */
export interface Advertisement {
  id: string;
  name: string | null;
  localName: string | null;
  rssi: number | null;
  manufacturerData: string | null;
  serviceUUIDs: string[] | null;
  serviceData: Record<string, string> | null;
  txPowerLevel: number | null;
  isConnectable: boolean | null;
}

export interface RssiSample {
  /** Milliseconds since epoch. */
  t: number;
  rssi: number;
}

/**
 * 'find-my' is a non-AirTag device on Apple's Find My network, 'find-hub' one on Google's Find Hub
 * network, and 'unknown-tracker' a tracker that only shows the cross-brand unwanted-tracking signal.
 */
export type TrackerType =
  | 'airtag'
  | 'find-my'
  | 'tile'
  | 'smarttag'
  | 'chipolo'
  | 'find-hub'
  | 'unknown-tracker';

export interface TrackerMatch {
  type: TrackerType;
  /** Short label for a badge, e.g. "Possible AirTag". Never claims certainty. */
  label: string;
  /** "likely" when a specific pattern matched, "possible" when only a weak hint did. */
  confidence: 'likely' | 'possible';
  /** One plain sentence on what matched, for the detail screen. */
  reason: string;
}

/** A device as the app keeps it between advertisements. */
export interface ScannedDevice {
  id: string;
  /** Best name we have: advertised local name, else the device name, else null. */
  name: string | null;
  /** Latest RSSI in dBm, or null if the last advertisement had none. */
  rssi: number | null;
  firstSeen: number;
  lastSeen: number;
  /** Oldest first, capped in length by the device-list helper. */
  rssiHistory: RssiSample[];
  /** The latest advertisement, kept for the detail screen and tracker detection. */
  advertisement: Advertisement;
  tracker: TrackerMatch | null;
}

export type Proximity = 'near' | 'medium' | 'far' | 'unknown';

export type SortBy = 'signal' | 'name';
export type DeviceFilter = 'all' | 'trackers' | 'named';

/** Lifecycle of the Bluetooth scanner, as the UI needs to show it. */
export type ScanStatus =
  | 'idle'
  | 'requesting-permission'
  | 'scanning'
  | 'permission-denied'
  | 'bluetooth-off'
  | 'unsupported'
  | 'error';

export interface WifiNetwork {
  ssid: string;
  bssid: string;
  /** dBm */
  level: number;
  /** MHz */
  frequency: number;
  channel: number | null;
  band: '2.4 GHz' | '5 GHz' | '6 GHz' | 'unknown';
  capabilities: string;
}
