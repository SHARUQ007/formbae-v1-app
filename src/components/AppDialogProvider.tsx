import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type DialogButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type DialogState = {
  title: string;
  message?: string;
  buttons: DialogButton[];
};

const defaultButton: DialogButton = { text: 'OK' };

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    const nativeAlert = Alert.alert;
    Alert.alert = ((title, message, buttons) => {
      const actions = buttons as DialogButton[] | undefined;
      setDialog({ title, message, buttons: actions?.length ? actions : [defaultButton] });
    }) as typeof Alert.alert;

    return () => {
      Alert.alert = nativeAlert;
    };
  }, []);

  const close = (button?: DialogButton) => {
    setDialog(null);
    requestAnimationFrame(() => button?.onPress?.());
  };

  return (
    <>
      {children}
      <Modal visible={!!dialog} transparent animationType="fade" statusBarTranslucent onRequestClose={() => close(dialog?.buttons.find((button) => button.style === 'cancel') || dialog?.buttons[0])}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => close(dialog?.buttons.find((button) => button.style === 'cancel'))} />
          {dialog ? (
            <View accessibilityViewIsModal style={styles.card}>
              <View style={styles.goldRule} />
              <Text style={styles.title}>{dialog.title}</Text>
              {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
              <View style={styles.actions}>
                {dialog.buttons.map((button, index) => (
                  <TouchableOpacity
                    key={`${button.text || 'action'}-${index}`}
                    activeOpacity={0.86}
                    onPress={() => close(button)}
                    style={[
                      styles.action,
                      dialog.buttons.length === 1 || button.style === 'destructive' ? styles.actionPrimary : styles.actionSecondary,
                      button.style === 'destructive' && styles.actionDestructive,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={button.text || 'OK'}
                  >
                    <Text
                      style={[
                        styles.actionText,
                        (dialog.buttons.length === 1 || button.style === 'destructive') && styles.actionPrimaryText,
                      ]}
                    >
                      {button.text || 'OK'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.56)' },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.lg,
  },
  goldRule: { width: 36, height: 4, borderRadius: radius.pill, backgroundColor: '#f5b301', marginBottom: spacing.lg },
  title: { ...typography.title, color: colors.ink },
  message: { ...typography.body, color: colors.inkMuted, marginTop: spacing.sm },
  actions: { flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.xl },
  action: { flex: 1, minHeight: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  actionPrimary: { backgroundColor: colors.accent, borderWidth: 1, borderColor: '#f5b301' },
  actionSecondary: { backgroundColor: colors.panelMuted, borderWidth: 1, borderColor: colors.borderStrong },
  actionDestructive: { backgroundColor: colors.error },
  actionText: { ...typography.button, color: colors.ink },
  actionPrimaryText: { color: colors.white },
});
