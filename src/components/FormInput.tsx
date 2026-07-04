import { TextInput, View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'email-address' | 'numeric';
  maxLength?: number;
  label?: string;
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
  multiline = false,
  autoCapitalize = 'none',
  editable = true,
}: Props) {
  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        style={[styles.input, multiline && styles.multiline, !editable && styles.disabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        editable={editable}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.inkMuted, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.ink,
    marginBottom: spacing.md,
  },
  multiline: { minHeight: 96 },
  disabled: { backgroundColor: colors.bg, color: colors.inkMuted },
});
