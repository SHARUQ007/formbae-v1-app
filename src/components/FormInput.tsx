import { useState } from 'react';
import { TextInput, View, Text, StyleSheet } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'email-address' | 'numeric';
  maxLength?: number;
  label?: string;
  icon?: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  editable?: boolean;
};

export function FormInput({
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  maxLength,
  label,
  icon,
  multiline = false,
  autoCapitalize = 'none',
  editable = true,
}: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrap,
          multiline && styles.multilineWrap,
          focused && styles.focused,
          !editable && styles.disabled,
        ]}
      >
        {icon ? <Feather name={icon} size={18} color={focused ? colors.accent : colors.inkSubtle} style={styles.icon} /> : null}
        <TextInput
          style={[styles.input, multiline && styles.multiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inkSubtle}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          textAlignVertical={multiline ? 'top' : 'center'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { ...typography.label, color: colors.inkMuted, marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  multilineWrap: { alignItems: 'flex-start', paddingVertical: 12 },
  focused: { borderColor: colors.accent, backgroundColor: colors.white },
  disabled: { backgroundColor: colors.panelMuted },
  icon: { marginRight: 10 },
  input: { flex: 1, ...typography.body, fontSize: 16, color: colors.ink, paddingVertical: 12 },
  multiline: { minHeight: 96 },
});
