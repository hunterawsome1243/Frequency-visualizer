import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { glow, MaxContentWidth, Neon, Spacing } from '@/constants/theme';

/** Below this width the brand name is hidden so the four tabs fit on one line. */
const BRAND_MIN_WIDTH = 560;

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton>Radar</TabButton>
          </TabTrigger>
          <TabTrigger name="devices" href="/devices" asChild>
            <TabButton>Devices</TabButton>
          </TabTrigger>
          <TabTrigger name="wifi" href="/wifi" asChild>
            <TabButton>Wi-Fi</TabButton>
          </TabTrigger>
          <TabTrigger name="about" href="/about" asChild>
            <TabButton>About</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

// TabTrigger passes no ref through its Slot, and the slot's View-typed ref does not fit Pressable.
export type TabButtonProps = Omit<TabTriggerSlotProps, 'ref'>;

export function TabButton({ children, isFocused, ...props }: TabButtonProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      style={({ pressed }) => pressed && styles.pressed}>
      <View style={[styles.tabButtonView, isFocused && [styles.tabButtonFocused, glow(Neon.cyan, 6)]]}>
        <Text style={[styles.tabLabel, { color: isFocused ? Neon.cyan : Neon.textSecondary }]}>
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const { width } = useWindowDimensions();

  return (
    <View {...props} style={styles.tabListContainer}>
      <View style={styles.innerContainer}>
        {width >= BRAND_MIN_WIDTH && <Text style={styles.brandText}>Frequency Visualizer</Text>}

        {props.children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    height: '100%',
    backgroundColor: Neon.background,
  },
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.five,
    borderWidth: 1,
    borderColor: Neon.border,
    backgroundColor: Neon.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  brandText: {
    marginRight: 'auto',
    color: Neon.cyan,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
    letterSpacing: 0.5,
    textShadowColor: Neon.cyan,
    textShadowRadius: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabButtonFocused: {
    backgroundColor: Neon.surfaceRaised,
    borderColor: Neon.cyan,
  },
  tabLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 600,
  },
});
