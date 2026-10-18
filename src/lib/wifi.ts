import { isUsableRssi } from './proximity';
import type { WifiNetwork } from './types';

/** Raw entry as react-native-wifi-reborn returns it on Android. */
export interface RawWifiEntry {
  SSID: string;
  BSSID: string;
  capabilities: string;
  frequency: number;
  level: number;
  timestamp?: number;
}

export const HIDDEN_NETWORK_LABEL = '(hidden network)';

/** Channel = (frequency - base) / 5 inside each range, for frequencies on the 5 MHz grid. */
const CHANNEL_RANGES: readonly { band: WifiNetwork['band']; min: number; max: number; base: number }[] = [
  { band: '2.4 GHz', min: 2412, max: 2472, base: 2407 },
  { band: '5 GHz', min: 5160, max: 5885, base: 5000 },
  { band: '6 GHz', min: 5955, max: 7115, base: 5950 },
];

/** Channel 14 (Japan only) sits off the regular 2.4 GHz grid. */
const CHANNEL_14_FREQUENCY = 2484;
/** 6 GHz channel 2 (operating class 136) sits below the regular 6 GHz grid, as in Android's ScanResult. */
const CHANNEL_2_6GHZ_FREQUENCY = 5935;

function findRange(frequency: number) {
  return CHANNEL_RANGES.find((range) => frequency >= range.min && frequency <= range.max);
}

/** Wi-Fi channel for a centre frequency in MHz (2.4, 5 and 6 GHz bands), or null if unknown. */
export function frequencyToChannel(frequency: number): number | null {
  if (!Number.isFinite(frequency)) return null;
  if (frequency === CHANNEL_14_FREQUENCY) return 14;
  if (frequency === CHANNEL_2_6GHZ_FREQUENCY) return 2;
  const range = findRange(frequency);
  if (!range) return null;
  const channel = (frequency - range.base) / 5;
  return Number.isInteger(channel) ? channel : null;
}

export function frequencyToBand(frequency: number): WifiNetwork['band'] {
  if (!Number.isFinite(frequency)) return 'unknown';
  if (frequency === CHANNEL_14_FREQUENCY) return '2.4 GHz';
  if (frequency === CHANNEL_2_6GHZ_FREQUENCY) return '6 GHz';
  return findRange(frequency)?.band ?? 'unknown';
}

function isHiddenSsid(ssid: unknown): boolean {
  if (typeof ssid !== 'string') return true;
  // Some access points hide their name by broadcasting NUL bytes instead of an empty name, and
  // react-native-wifi-reborn already turns an empty name into "(hidden SSID)".
  const visible = ssid.replace(/\u0000/g, '').trim().toLowerCase();
  return visible === '' || visible === '<unknown ssid>' || visible === '(hidden ssid)';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Converts raw entries, shows hidden SSIDs as "(hidden network)", and sorts strongest first. */
export function toWifiNetworks(entries: readonly RawWifiEntry[]): WifiNetwork[] {
  const networks = entries.map((entry): WifiNetwork => {
    return {
      ssid: isHiddenSsid(entry.SSID) ? HIDDEN_NETWORK_LABEL : entry.SSID,
      bssid: typeof entry.BSSID === 'string' ? entry.BSSID : '',
      level: entry.level,
      frequency: entry.frequency,
      channel: frequencyToChannel(entry.frequency),
      band: frequencyToBand(entry.frequency),
      capabilities: typeof entry.capabilities === 'string' ? entry.capabilities : '',
    };
  });

  // Strongest first; an entry without a usable level goes last rather than breaking the sort.
  return networks.sort((a, b) => {
    const aUsable = isFiniteNumber(a.level);
    const bUsable = isFiniteNumber(b.level);
    if (aUsable !== bUsable) return aUsable ? -1 : 1;
    if (aUsable && a.level !== b.level) return b.level - a.level;
    if (a.ssid !== b.ssid) return a.ssid < b.ssid ? -1 : 1;
    if (a.bssid !== b.bssid) return a.bssid < b.bssid ? -1 : 1;
    return 0;
  });
}

export interface WifiSecurity {
  secured: boolean;
  /** "WPA3", "WPA2/WPA3", "WPA2", "WPA", "WEP", "Enhanced Open" or "Open". */
  label: string;
}

/**
 * Reads Android's capabilities string, e.g. "[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]". Any WPA, WEP or SAE
 * entry counts as secured; the label names the strongest one. Enhanced Open (OWE) is encrypted but
 * needs no password, so it is not shown as secured.
 */
export function wifiSecurity(capabilities: string): WifiSecurity {
  const caps = capabilities.toUpperCase();
  const sae = caps.includes('SAE') || caps.includes('WPA3');
  const psk = caps.includes('PSK');
  const eap = caps.includes('EAP');
  const owe = caps.includes('OWE');
  const wpa2 = caps.includes('WPA2') || caps.includes('RSN');
  const wpa = caps.includes('WPA');
  const wep = caps.includes('WEP');

  if (sae) return { secured: true, label: psk ? 'WPA2/WPA3' : 'WPA3' };
  if (owe && !psk && !eap) return { secured: false, label: 'Enhanced Open' };
  if (wpa2) return { secured: true, label: 'WPA2' };
  if (wpa) return { secured: true, label: 'WPA' };
  if (wep) return { secured: true, label: 'WEP' };
  return { secured: false, label: 'Open' };
}

/** 0 to 4 bars, like the phone's own Wi-Fi icon. */
export function wifiBars(level: number): number {
  if (!isUsableRssi(level)) return 0;
  if (level >= -55) return 4;
  if (level >= -67) return 3;
  if (level >= -78) return 2;
  return 1;
}
