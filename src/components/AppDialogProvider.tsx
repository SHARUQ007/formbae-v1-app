import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
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
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
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

  const cancelButton = dialog?.buttons.find((button) => button.style === 'cancel');
  const hasDestructiveAction = Boolean(dialog?.buttons.some((button) => button.style === 'destructive'));
  const isChoiceDialog = (dialog?.buttons.length ?? 0) > 2;
  const horizontalActions = dialog?.buttons.length === 2 && width >= 340;
  const iconName = useMemo(() => {
    if (hasDestructiveAction) return 'alert-triangle';
    if (isChoiceDialog) return 'image';
    return 'info';
  }, [hasDestructiveAction, isChoiceDialog]);

  const close = (button?: DialogButton) => {
    setDialog(null);
    requestAnimationFrame(() => button?.onPress?.());
  };

  const dismiss = () => {
    if (cancelButton) {
      close(cancelButton);
      return;
    }
    if (dialog?.buttons.length === 1) close(dialog.buttons[0]);
  };

  const maxCardHeight = Math.max(280, height - insets.top - insets.bottom - spacing.xxl);

  return (
    <>
      {children}
      <Modal
        visible={Boolean(dialog)}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={dismiss}
      >
        <View
          style={[
            styles.overlay,
            {
              paddingTop: Math.max(insets.top, spacing.md),
              paddingBottom: Math.max(insets.bottom, spacing.md),
            },
          ]}
        >
          <Pressable
            style={styles.backdrop}
            onPress={dismiss}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          {dialog ? (
            <View
              testID="app-dialog-card"
              accessibilityRole="alert"
              accessibilityViewIsModal
              style={[styles.card, { maxHeight: maxCardHeight }]}
            >
              <View style={styles.contentRow}>
                <View style={[styles.icon, hasDestructiveAction && styles.iconDestructive]}>
                  <Feather
                    name={iconName}
                    size={20}
                    color={hasDestructiveAction ? colors.error : colors.gold}
                  />
                </View>
                <ScrollView
                  style={styles.copyScroll}
                  contentContainerStyle={styles.copy}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <Text style={styles.title}>{dialog.title}</Text>
                  {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
                </ScrollView>
              </View>

              <View style={[styles.actions, horizontalActions && styles.actionsHorizontal]}>
                {dialog.buttons.map((button, index) => {
                  const destructive = button.style === 'destructive';
                  const cancel = button.style === 'cancel';
                  const primary = !destructive && !cancel && (dialog.buttons.length <= 2 || index === 0);
                  return (
                    <TouchableOpacity
                      key={`${button.text || 'action'}-${index}`}
                      activeOpacity={0.78}
                      onPress={() => close(button)}
                      style={[
                        styles.action,
                        horizontalActions && styles.actionHorizontal,
                        cancel && styles.actionCancel,
                        primary && styles.actionPrimary,
                        destructive && styles.actionDestructive,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={button.text || 'OK'}
                    >
                      <Text
                        style={[
                          styles.actionText,
                          cancel && styles.actionCancelText,
                          primary && styles.actionPrimaryText,
                          destructive && styles.actionDestructiveText,
                        ]}
                      >
                        {button.text || 'OK'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  card: {
    width: '100%',
    maxWidth: 380,
    flexShrink: 1,
    borderRadius: radius.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    ...shadows.lg,
  },
  contentRow: { flexShrink: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: {
    width: 42,
    height: 42,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    backgroundColor: colors.accentLight,
  },
  iconDestructive: { borderColor: 'rgba(255,129,140,0.30)', backgroundColor: colors.errorLight },
  copyScroll: { flexGrow: 0, flexShrink: 1 },
  copy: { flexGrow: 0, paddingBottom: 1 },
  title: { ...typography.title, color: colors.inkStrong },
  message: { ...typography.body, color: colors.inkMuted, marginTop: spacing.xs },
  actions: { flexShrink: 0, gap: spacing.sm, marginTop: spacing.lg },
  actionsHorizontal: { flexDirection: 'row' },
  action: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelRaised,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionHorizontal: { flex: 1, minWidth: 0 },
  actionCancel: { backgroundColor: colors.panelMuted, borderColor: colors.border },
  actionPrimary: { backgroundColor: colors.primaryAction, borderColor: colors.primaryAction },
  actionDestructive: { backgroundColor: colors.errorLight, borderColor: 'rgba(255,129,140,0.42)' },
  actionText: { ...typography.button, color: colors.ink, textAlign: 'center' },
  actionCancelText: { color: colors.inkMuted },
  actionPrimaryText: { color: colors.onPrimary },
  actionDestructiveText: { color: colors.error },
});
