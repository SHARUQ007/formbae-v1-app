import { forwardRef, useState } from 'react';
import { TextInput, View, Text, StyleSheet, type TextInputProps } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

type Props = Omit<
  TextInputProps,
  | 'style'
  | 'value'
  | 'onChangeText'
  | 'placeholder'
  | 'keyboardType'
  | 'maxLength'
  | 'multiline'
  | 'autoCapitalize'
  | 'editable'
> & {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'email-address' | 'numeric' | 'decimal-pad';
  maxLength?: number;
  label?: string;
  icon?: string;
  prefix?: string;
  suffix?: string;
  helperText?: string;
  error?: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  editable?: boolean;
};

export const FormInput = forwardRef<TextInput, Props>(function FormInputField(
  {
    value,
    onChangeText,
    placeholder,
    keyboardType = 'default',
    maxLength,
    label,
    icon,
    prefix,
    suffix,
    helperText,
    error,
    multiline = false,
    autoCapitalize = 'none',
    editable = true,
    accessibilityLabel,
    onFocus,
    onBlur,
    ...inputProps
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrap,
          multiline && styles.multilineWrap,
          focused && styles.focused,
          error && styles.error,
          !editable && styles.disabled,
        ]}
      >
        {icon ? <Feather name={icon} size={18} color={focused ? colors.accent : colors.inkSubtle} style={styles.icon} /> : null}
        {prefix ? (
          <View style={styles.prefixWrap}>
            <Text style={[styles.prefix, focused && styles.prefixFocused]}>{prefix}</Text>
            <View style={styles.prefixDivider} />
          </View>
        ) : null}
        <TextInput
          ref={ref}
          style={[styles.input, multiline && styles.multiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inkSubtle}
          selectionColor={colors.gold}
          cursorColor={colors.gold}
          keyboardAppearance="dark"
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          editable={editable}
          {...inputProps}
          onFocus={event => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={event => {
            setFocused(false);
            onBlur?.(event);
          }}
          textAlignVertical={multiline ? 'top' : 'center'}
          accessibilityLabel={accessibilityLabel || label || placeholder}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
      {error ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { ...typography.label, color: colors.inkMuted, marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    minHeight: 54,
  },
  multilineWrap: { alignItems: 'flex-start', paddingVertical: 12 },
  focused: { borderColor: colors.goldMuted, backgroundColor: colors.panelRaised },
  error: { borderColor: colors.error },
  disabled: { backgroundColor: colors.panelMuted },
  icon: { marginRight: 10 },
  prefixWrap: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', marginRight: 12 },
  prefix: { ...typography.bodyBold, color: colors.inkMuted, alignSelf: 'center' },
  prefixFocused: { color: colors.ink },
  prefixDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.borderStrong, marginLeft: 12 },
  input: { flex: 1, minWidth: 0, ...typography.body, fontSize: 16, color: colors.ink, paddingVertical: 12 },
  multiline: { minHeight: 96 },
  suffix: { ...typography.caption, color: colors.inkMuted, marginLeft: spacing.xs },
  helperText: { ...typography.caption, color: colors.inkSubtle, marginTop: 5 },
  errorText: { ...typography.caption, color: colors.error, marginTop: 5 },
});
