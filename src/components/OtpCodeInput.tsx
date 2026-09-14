import { forwardRef, useCallback, useRef } from 'react';
import { StyleSheet, Text, TextInput, TouchableWithoutFeedback, View } from 'react-native';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  editable?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/**
 * A code entered across several boxes, backed by a single field.
 *
 * One hidden input holding the whole string, drawn as cells. Per-cell inputs are the
 * obvious build and the wrong one: backspace on an empty cell is unreliable on Android,
 * pasting a code fills only the first box, and screen readers meet six separate fields
 * where there is one answer. With a single string all three come for free.
 */
export const OtpCodeInput = forwardRef<TextInput, Props>(function OtpCodeInputField(
  {
    value,
    onChangeText,
    onComplete,
    length = 6,
    editable = true,
    invalid = false,
    autoFocus = false,
    accessibilityLabel = 'Verification code',
    accessibilityHint,
  },
  ref,
) {
  const inputRef = useRef<TextInput | null>(null);
  // Autofill delivers the whole code in one change, and a re-render must not make that
  // look like a second arrival.
  const completedFor = useRef('');

  const handleChange = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, length);
    onChangeText(digits);
    if (digits.length < length) {
      completedFor.current = '';
      return;
    }
    if (completedFor.current === digits) return;
    completedFor.current = digits;
    onComplete?.(digits);
  }, [length, onChangeText, onComplete]);

  const focus = useCallback(() => inputRef.current?.focus(), []);
  const active = Math.min(value.length, length - 1);

  return (
    <TouchableWithoutFeedback onPress={focus} accessible={false}>
      <View style={styles.wrap}>
        {/* Transparent rather than hidden: it has to stay focusable and stay the one
            element assistive tech sees. */}
        <TextInput
          ref={(node) => {
            inputRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          value={value}
          onChangeText={handleChange}
          keyboardType="number-pad"
          maxLength={length}
          editable={editable}
          autoFocus={autoFocus}
          caretHidden
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          importantForAutofill="yes"
          keyboardAppearance="dark"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          style={styles.field}
        />
        <View
          style={styles.cells}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length }).map((_, index) => {
            const filled = index < value.length;
            const focused = editable && index === active && value.length < length;
            return (
              <View
                key={index}
                style={[
                  styles.cell,
                  filled && styles.cellFilled,
                  focused && styles.cellFocused,
                  invalid && styles.cellInvalid,
                ]}
              >
                <Text style={styles.digit}>{value[index] ?? ''}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
});

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  field: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0, color: 'transparent', zIndex: 2 },
  cells: { flexDirection: 'row', gap: 10 },
  cell: {
    flex: 1,
    height: 62,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: { borderColor: 'rgba(255,255,255,0.42)', backgroundColor: 'rgba(255,255,255,0.10)' },
  cellFocused: { borderColor: colors.gold },
  cellInvalid: { borderColor: colors.error },
  digit: { fontSize: 24, fontWeight: '700', color: colors.white, fontVariant: ['tabular-nums'] },
});
