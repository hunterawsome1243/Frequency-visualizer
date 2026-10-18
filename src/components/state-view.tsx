import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { glow, Neon, Spacing } from '@/constants/theme';

export interface StateViewProps {
  title: string;
  message?: string;
  /** Shows a spinner above the title. */
  loading?: boolean;
  action?: { label: string; onPress: () => void };
  /** Tints the title, e.g. Neon.danger for errors. */
  tone?: 'info' | 'warning' | 'error';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const TONE_COLORS = {
  info: Neon.text,
  warning: Neon.amber,
  error: Neon.danger,
} as const;

/** Centered empty / loading / error message used by every screen. */
export function StateView({
  title,
  message,
  loading = false,
  action,
  tone = 'info',
  style,
  testID,
}: StateViewProps): ReactNode {
  const toneColor = TONE_COLORS[tone];

  return (
    <View
      style={[styles.container, style]}
      testID={testID}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}>
      {loading && (
        <ActivityIndicator
          size="large"
          color={Neon.cyan}
          accessibilityLabel="Loading"
          testID="state-view-spinner"
        />
      )}
      <Text
        accessibilityRole="header"
        style={[
          styles.title,
          { color: toneColor },
          tone !== 'info' && { textShadowColor: toneColor, textShadowRadius: 8 },
        ]}>
        {title}
      </Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action ? (
        <View style={styles.action}>
          <ActionButton label={action.label} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

export interface ActionButtonProps {
  label: string;
  onPress: () => void;
  /** "primary" has a raised background and a glow; "secondary" is a quiet outline. */
  variant?: 'primary' | 'secondary';
  /** Accent colour for the label, border and glow (default Neon.cyan). */
  color?: string;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

/** Neon pill button shared by the state, status and About screens. */
export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  color = Neon.cyan,
  disabled = false,
  accessibilityHint,
  testID,
}: ActionButtonProps): ReactNode {
  const primary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      hitSlop={Spacing.one}
      style={({ pressed }) => [
        styles.button,
        primary
          ? [styles.buttonPrimary, { borderColor: color }, !disabled && glow(color, 6)]
          : styles.buttonSecondary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.buttonLabel, { color: primary ? color : Neon.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
  },
  title: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: 700,
    textAlign: 'center',
  },
  message: {
    color: Neon.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 420,
  },
  action: {
    marginTop: Spacing.one,
  },
  button: {
    minHeight: 44,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: Neon.surfaceRaised,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderColor: Neon.border,
  },
  buttonLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 700,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.45,
  },
});
