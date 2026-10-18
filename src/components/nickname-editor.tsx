import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Neon, Spacing } from '@/constants/theme';
import { useNicknames } from '@/context/nicknames-context';
import { cleanNickname, MAX_NICKNAME_LENGTH } from '@/lib/nicknames';

function Button(props: { label: string; onPress: () => void; disabled: boolean; primary?: boolean }) {
  const { label, onPress, disabled, primary = false } = props;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        disabled && styles.buttonDisabled,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.buttonLabel, primary && styles.buttonLabelPrimary]}>{label}</Text>
    </Pressable>
  );
}

/** Lets the user give a device a name such as "My headphones". Names are saved on this phone only. */
export function NicknameEditor(props: { deviceId: string }): ReactNode {
  const { deviceId } = props;
  const { nicknames, setNickname } = useNicknames();
  const saved = nicknames[deviceId] ?? '';
  /** null while the user has not typed, so the field follows the saved name (e.g. once it has loaded). */
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const value = draft ?? saved;
  const changed = cleanNickname(value) !== saved;

  const save = async (name: string) => {
    setSaving(true);
    try {
      await setNickname(deviceId, name);
    } finally {
      setSaving(false);
      setDraft(null);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        value={value}
        onChangeText={setDraft}
        onSubmitEditing={() => {
          if (changed) void save(value);
        }}
        placeholder="e.g. My headphones"
        placeholderTextColor={Neon.textSecondary}
        maxLength={MAX_NICKNAME_LENGTH}
        autoCapitalize="sentences"
        autoCorrect={false}
        returnKeyType="done"
        accessibilityLabel="Nickname"
        accessibilityHint="A name for this device, saved on this phone"
        selectionColor={Neon.cyan}
        style={styles.input}
      />
      <View style={styles.buttons}>
        <Button label="Save" primary disabled={saving || !changed} onPress={() => void save(value)} />
        <Button
          label="Clear"
          disabled={saving || (saved === '' && value === '')}
          onPress={() => void save('')}
        />
      </View>
      <Text style={styles.hint}>
        Nicknames are saved on this phone only. Some devices change their Bluetooth address often, so a
        nickname may not stay with them.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  input: {
    color: Neon.text,
    fontSize: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: Neon.border,
    backgroundColor: Neon.surface,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Neon.border,
    backgroundColor: Neon.surface,
  },
  buttonPrimary: {
    borderColor: Neon.cyan,
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: Neon.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 600,
  },
  buttonLabelPrimary: {
    color: Neon.cyan,
  },
  hint: {
    color: Neon.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
});
