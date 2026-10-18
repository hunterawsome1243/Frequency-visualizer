import { NativeTabs } from 'expo-router/native-tabs';

import { Neon } from '@/constants/theme';

const contentStyle = { backgroundColor: Neon.background };

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={Neon.surface}
      tintColor={Neon.cyan}
      iconColor={{ default: Neon.textSecondary, selected: Neon.cyan }}
      labelStyle={{ default: { color: Neon.textSecondary }, selected: { color: Neon.cyan } }}
      indicatorColor={Neon.surfaceRaised}
      rippleColor={Neon.grid}
      shadowColor={Neon.border}
      badgeBackgroundColor={Neon.danger}>
      <NativeTabs.Trigger name="index" contentStyle={contentStyle}>
        <NativeTabs.Trigger.Label>Radar</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="dot.radiowaves.left.and.right" md="radar" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="devices" contentStyle={contentStyle}>
        <NativeTabs.Trigger.Label>Devices</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet" md="bluetooth_searching" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="wifi" contentStyle={contentStyle}>
        <NativeTabs.Trigger.Label>Wi-Fi</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="wifi" md="wifi" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="about" contentStyle={contentStyle}>
        <NativeTabs.Trigger.Label>About</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'info.circle', selected: 'info.circle.fill' }} md="info" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
