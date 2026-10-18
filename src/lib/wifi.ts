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

/** Wi-Fi channel for a centre frequency in MHz (2.4, 5 and 6 GHz bands), or null if unknown. */
export function frequencyToChannel(frequency: number): number | null {
  throw new Error('not implemented');
}

export function frequencyToBand(frequency: number): WifiNetwork['band'] {
  throw new Error('not implemented');
}

/** Converts raw entries, shows hidden SSIDs as "(hidden network)", and sorts strongest first. */
export function toWifiNetworks(entries: readonly RawWifiEntry[]): WifiNetwork[] {
  throw new Error('not implemented');
}
