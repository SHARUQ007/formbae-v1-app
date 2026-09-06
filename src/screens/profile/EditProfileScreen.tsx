import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ScreenContainer, ScreenHeader } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState, ErrorState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { peekCachedResource } from '../../services/appCache';
import { updateProfile, type MobileSettingsResponse } from '../../services/settingsService';
import { CACHE_KEYS, loadProfileSettingsCached } from '../../services/preloadService';
import type { ProfileStackParamList } from '../../navigation/types';
import { titleCase } from '../../utils/format';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>;
type ProfileForm = Record<string, string>;
type FieldErrors = Record<string, string>;
type ChipOption = { value: string; label: string };

const AVATAR_OPTIONS = ['panther', 'wolf', 'eagle', 'shark', 'rabbit', 'cobra'];
const AVATAR_OPTION_META: Record<string, { label: string; icon: string }> = {
  panther: { label: 'Panther', icon: 'cat' },
  wolf: { label: 'Wolf', icon: 'dog' },
  eagle: { label: 'Eagle', icon: 'bird' },
  shark: { label: 'Shark', icon: 'fish' },
  rabbit: { label: 'Rabbit', icon: 'rabbit' },
  cobra: { label: 'Cobra', icon: 'snake' },
};
const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Bengali', 'Gujarati', 'Punjabi', 'Urdu'];
const GENDER_OPTIONS = ['male', 'female', 'other'];
const TRAINING_DAYS_OPTIONS = ['1', '2', '3', '4', '5', '6', '7'];
const WORKOUT_SETTING_OPTIONS = [
  { value: 'gym', label: 'Gym' },
  { value: 'home', label: 'Home' },
];

function parseJsonRecord(raw?: string) {
  if (!raw) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value ?? '').trim()]));
    }
  } catch {
    return {};
  }
  return {};
}

function parseLanguages(raw?: string) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map((entry) => String(entry).trim()).filter(Boolean);
  } catch {
    return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function hydrateProfile(data: MobileSettingsResponse) {
  const profile = data.profile ?? {};
  const lifestyle = parseJsonRecord(profile.lifestyleJson);
  const parsedLanguages = parseLanguages(profile.languagePreferencesJson);
  const languages = parsedLanguages.length ? parsedLanguages : ['English'];
  const form: ProfileForm = {
    name: data.user?.name || '',
    avatarIcon: profile.avatarIcon || 'panther',
    age: profile.age || '',
    gender: profile.gender || '',
    height: profile.height || '',
    weight: profile.weight || '',
    chest: profile.chest || '',
    waist: profile.waist || '',
    biceps: profile.biceps || '',
    dietPref: profile.dietPref || '',
    trainingDays: profile.trainingDays || '',
    fitnessGoal: profile.fitnessGoal || '',
    allergies: profile.allergies || '',
    workoutSetting: lifestyle.workoutSetting === 'home' ? 'home' : 'gym',
  };
  return { form, languages, lifestyle };
}

function snapshot(form: ProfileForm, languages: string[]) {
  return JSON.stringify({
    form: Object.fromEntries(Object.entries(form).sort(([left], [right]) => left.localeCompare(right))),
    languages: [...languages].sort(),
  });
}

function validateNumber(value: string, label: string, min: number, max: number, integerOnly = false) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (integerOnly && !/^\d+$/.test(trimmed)) return `Enter ${label.toLowerCase()} as a whole number.`;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return `Enter a valid ${label.toLowerCase()}.`;
  if (numeric < min || numeric > max) return `Use a value from ${min} to ${max}.`;
  return '';
}

function validateProfile(form: ProfileForm) {
  const errors: FieldErrors = {};
  const rules: Array<[string, string, number, number, boolean?]> = [
    ['age', 'Age', 13, 120, true],
    ['height', 'Height', 50, 275],
    ['weight', 'Weight', 20, 500],
    ['chest', 'Chest', 10, 300],
    ['waist', 'Waist', 10, 300],
    ['biceps', 'Biceps', 10, 150],
  ];
  rules.forEach(([key, label, min, max, integerOnly]) => {
    const error = validateNumber(form[key] || '', label, min, max, integerOnly);
    if (error) errors[key] = error;
  });
  return errors;
}

export function EditProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const cached = useMemo(() => peekCachedResource<MobileSettingsResponse>(CACHE_KEYS.profileSettings), []);
  const cachedProfile = useMemo(() => (cached ? hydrateProfile(cached) : null), [cached]);
  const { data, loading, error, reload } = useAsync<MobileSettingsResponse>(
    (mode) => loadProfileSettingsCached({ force: mode === 'refresh' }),
    [],
    { initialData: cached },
  );
  const [form, setForm] = useState<ProfileForm>(cachedProfile?.form ?? {});
  const [languages, setLanguages] = useState<string[]>(cachedProfile?.languages ?? []);
  const [lifestyle, setLifestyle] = useState<Record<string, string>>(cachedProfile?.lifestyle ?? {});
  const [initialSnapshot, setInitialSnapshot] = useState(() => cachedProfile ? snapshot(cachedProfile.form, cachedProfile.languages) : '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const hydratedRef = useRef(Boolean(cachedProfile));
  const allowLeaveRef = useRef(false);

  const stackFields = viewportWidth < 360 || fontScale >= 1.18;
  const twoColumnChoices = viewportWidth < 380 || fontScale >= 1.18;
  const isDirty = Boolean(initialSnapshot) && snapshot(form, languages) !== initialSnapshot;

  useEffect(() => {
    if (!data || hydratedRef.current) return;
    const hydrated = hydrateProfile(data);
    setForm(hydrated.form);
    setLanguages(hydrated.languages);
    setLifestyle(hydrated.lifestyle);
    setInitialSnapshot(snapshot(hydrated.form, hydrated.languages));
    hydratedRef.current = true;
  }, [data]);

  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (!isDirty || saving || allowLeaveRef.current) return;
    event.preventDefault();
    Alert.alert('Discard your changes?', 'Your profile edits have not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          allowLeaveRef.current = true;
          navigation.dispatch(event.data.action);
        },
      },
    ]);
  }), [isDirty, navigation, saving]);

  const set = (key: string, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const toggleLanguage = (value: string) => {
    setLanguages((current) => {
      if (!current.includes(value)) return [...current, value];
      if (current.length === 1) return current;
      return current.filter((entry) => entry !== value);
    });
  };

  const onSave = async () => {
    const nextErrors = validateProfile(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      Alert.alert('Check your details', 'Review the highlighted measurements, then save again.');
      return;
    }

    setSaving(true);
    try {
      const nextLifestyle = { ...lifestyle, workoutSetting: form.workoutSetting || 'gym' };
      const payload = {
        ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])),
        lifestyleJson: JSON.stringify(nextLifestyle),
        languagePreferencesJson: JSON.stringify(languages),
      };
      await updateProfile(payload);
      await loadProfileSettingsCached({ force: true }).catch(() => undefined);
      setInitialSnapshot(snapshot(form, languages));
      allowLeaveRef.current = true;
      Alert.alert('Profile updated', 'Your future plans will use these details.', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (saveError) {
      Alert.alert('Could not save', saveError instanceof Error ? saveError.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <ScreenContainer style={{ paddingBottom: Math.max(insets.bottom, spacing.sm) }}>
        <ScreenHeader title="Edit profile" onBack={() => navigation.goBack()} />
        <LoadingState message="Loading your details…" />
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer style={{ paddingBottom: Math.max(insets.bottom, spacing.sm) }}>
        <ScreenHeader title="Edit profile" onBack={() => navigation.goBack()} />
        <ErrorState message={error || 'Could not load your profile.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  const avatar = AVATAR_OPTION_META[form.avatarIcon || 'panther'] ?? AVATAR_OPTION_META.panther;

  return (
    <ScreenContainer style={{ paddingBottom: Math.max(insets.bottom, spacing.sm) }}>
      <ScreenHeader
        title="Edit profile"
        subtitle="Details used to tailor your plan"
        onBack={() => navigation.goBack()}
      />

      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={styles.scroll}
        >
          <FormSection title="Identity" description="How you appear across FormBae.">
            <View style={styles.avatarSummary}>
              <View style={styles.avatarPreview}>
                <MaterialCommunityIcon name={avatar.icon} size={28} color={colors.gold} />
              </View>
              <View style={styles.avatarSummaryCopy}>
                <Text style={styles.fieldTitle}>Profile icon</Text>
                <Text style={styles.fieldHelper}>{avatar.label} selected</Text>
              </View>
            </View>

            <AvatarPicker
              selected={form.avatarIcon || 'panther'}
              onSelect={(value) => set('avatarIcon', value)}
              twoColumns={twoColumnChoices}
            />

            <View style={styles.divider} />

            <View style={[styles.fieldRow, stackFields && styles.fieldRowStacked]}>
              <View style={styles.fieldGrowWide}>
                <FormInput
                  label="Name"
                  icon="user"
                  value={form.name || ''}
                  onChangeText={(value) => set('name', value)}
                  placeholder="Your name"
                  autoCapitalize="words"
                  maxLength={60}
                />
              </View>
              <View style={styles.fieldGrowSmall}>
                <FormInput
                  label="Age"
                  value={form.age || ''}
                  onChangeText={(value) => set('age', value)}
                  placeholder="—"
                  keyboardType="numeric"
                  maxLength={3}
                  error={errors.age}
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Gender</Text>
            <SegmentedGroup
              values={GENDER_OPTIONS}
              selected={form.gender || ''}
              onSelect={(value) => set('gender', value)}
            />
          </FormSection>

          <FormSection title="Body measurements" description="Current values keep progress estimates useful.">
            <View style={[styles.fieldRow, stackFields && styles.fieldRowStacked]}>
              <View style={styles.fieldGrow}>
                <FormInput
                  label="Height"
                  suffix="cm"
                  value={form.height || ''}
                  onChangeText={(value) => set('height', value)}
                  placeholder="—"
                  keyboardType="decimal-pad"
                  maxLength={6}
                  error={errors.height}
                />
              </View>
              <View style={styles.fieldGrow}>
                <FormInput
                  label="Weight"
                  suffix="kg"
                  value={form.weight || ''}
                  onChangeText={(value) => set('weight', value)}
                  placeholder="—"
                  keyboardType="decimal-pad"
                  maxLength={6}
                  error={errors.weight}
                />
              </View>
            </View>

            <Text style={styles.optionalLabel}>Optional measurements</Text>
            <View style={[styles.fieldRow, stackFields && styles.fieldRowStacked]}>
              <View style={styles.fieldGrow}>
                <FormInput
                  label="Chest"
                  suffix="cm"
                  value={form.chest || ''}
                  onChangeText={(value) => set('chest', value)}
                  placeholder="—"
                  keyboardType="decimal-pad"
                  maxLength={6}
                  error={errors.chest}
                />
              </View>
              <View style={styles.fieldGrow}>
                <FormInput
                  label="Waist"
                  suffix="cm"
                  value={form.waist || ''}
                  onChangeText={(value) => set('waist', value)}
                  placeholder="—"
                  keyboardType="decimal-pad"
                  maxLength={6}
                  error={errors.waist}
                />
              </View>
              <View style={styles.fieldGrow}>
                <FormInput
                  label="Biceps"
                  suffix="cm"
                  value={form.biceps || ''}
                  onChangeText={(value) => set('biceps', value)}
                  placeholder="—"
                  keyboardType="decimal-pad"
                  maxLength={6}
                  error={errors.biceps}
                />
              </View>
            </View>
          </FormSection>

          <FormSection title="Plan preferences" description="The essentials your coach plans around.">
            <View style={[styles.fieldRow, stackFields && styles.fieldRowStacked]}>
              <View style={styles.fieldGrow}>
                <FormInput
                  label="Goal"
                  value={form.fitnessGoal || ''}
                  onChangeText={(value) => set('fitnessGoal', value)}
                  placeholder="e.g. build strength"
                  autoCapitalize="sentences"
                  maxLength={80}
                />
              </View>
              <View style={styles.fieldGrow}>
                <FormInput
                  label="Food style"
                  value={form.dietPref || ''}
                  onChangeText={(value) => set('dietPref', value)}
                  placeholder="e.g. vegetarian"
                  autoCapitalize="words"
                  maxLength={60}
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Training days each week</Text>
            <DayPicker
              selected={form.trainingDays || ''}
              onSelect={(value) => set('trainingDays', value)}
              compact={stackFields}
            />

            <Text style={styles.fieldLabel}>Where you usually train</Text>
            <SegmentedGroup
              options={WORKOUT_SETTING_OPTIONS}
              selected={form.workoutSetting || 'gym'}
              onSelect={(value) => set('workoutSetting', value)}
            />
          </FormSection>

          <FormSection title="Preferences & context" description="Help FormBae communicate and coach clearly.">
            <Text style={styles.fieldLabel}>Languages</Text>
            <Text style={styles.selectionHint}>Select every language you are comfortable using.</Text>
            <MultiChipGroup values={LANGUAGE_OPTIONS} selected={languages} onToggle={toggleLanguage} />

            <View style={styles.divider} />

            <FormInput
              label="Health notes"
              value={form.allergies || ''}
              onChangeText={(value) => set('allergies', value)}
              placeholder="Injuries, allergies or movement restrictions"
              helperText="Only add details that affect meals or training."
              multiline
              autoCapitalize="sentences"
              maxLength={600}
            />
          </FormSection>

          <View style={styles.privacyNote}>
            <MaterialCommunityIcon name="shield-check-outline" size={18} color={colors.gold} />
            <Text style={styles.privacyText}>Changes are used for future plans and reports.</Text>
          </View>
        </ScrollView>

        <View style={styles.saveBar}>
          <PrimaryButton
            title="Save changes"
            icon="check"
            onPress={onSave}
            loading={saving}
            disabled={!isDirty}
            size="lg"
          />
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      <Text style={styles.sectionDescription}>{description}</Text>
      <View style={styles.formCard}>{children}</View>
    </View>
  );
}

function AvatarPicker({ selected, onSelect, twoColumns }: { selected: string; onSelect: (value: string) => void; twoColumns: boolean }) {
  return (
    <View style={styles.avatarGrid} accessibilityRole="radiogroup">
      {AVATAR_OPTIONS.map((value) => {
        const option = AVATAR_OPTION_META[value];
        const isSelected = selected === value;
        return (
          <TouchableOpacity
            key={value}
            activeOpacity={0.78}
            style={[styles.avatarOption, twoColumns && styles.avatarOptionTwoColumns, isSelected && styles.choiceSelected]}
            onPress={() => onSelect(value)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: isSelected }}
          >
            <MaterialCommunityIcon name={option.icon} size={20} color={isSelected ? colors.gold : colors.inkMuted} />
            <Text
              style={[styles.avatarOptionText, isSelected && styles.choiceTextSelected]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SegmentedGroup({
  values,
  options,
  selected,
  onSelect,
}: {
  values?: string[];
  options?: ChipOption[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const entries: ChipOption[] = options ?? (values ?? []).map((value) => ({ value, label: titleCase(value) }));
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {entries.map((entry) => {
        const isSelected = selected === entry.value;
        return (
          <TouchableOpacity
            key={entry.value}
            activeOpacity={0.78}
            style={[styles.segment, isSelected && styles.segmentSelected]}
            onPress={() => onSelect(entry.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
          >
            <Text style={[styles.segmentText, isSelected && styles.choiceTextSelected]} numberOfLines={2}>{entry.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function DayPicker({ selected, onSelect, compact }: { selected: string; onSelect: (value: string) => void; compact: boolean }) {
  return (
    <View style={styles.dayGrid} accessibilityRole="radiogroup">
      {TRAINING_DAYS_OPTIONS.map((value) => {
        const isSelected = selected === value;
        return (
          <TouchableOpacity
            key={value}
            activeOpacity={0.78}
            style={[styles.dayOption, compact && styles.dayOptionCompact, isSelected && styles.segmentSelected]}
            onPress={() => onSelect(value)}
            accessibilityRole="radio"
            accessibilityLabel={`${value} ${value === '1' ? 'day' : 'days'} per week`}
            accessibilityState={{ selected: isSelected }}
          >
            <Text style={[styles.dayText, isSelected && styles.choiceTextSelected]}>{value}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MultiChipGroup({ values, selected, onToggle }: { values: string[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <View style={styles.chipWrap}>
      {values.map((value) => {
        const isSelected = selected.includes(value);
        return (
          <TouchableOpacity
            key={value}
            activeOpacity={0.78}
            style={[styles.chip, isSelected && styles.choiceSelected]}
            onPress={() => onToggle(value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
          >
            {isSelected ? <MaterialCommunityIcon name="check" size={15} color={colors.gold} /> : null}
            <Text style={[styles.chipText, isSelected && styles.choiceTextSelected]}>{value}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  scrollView: { flex: 1 },
  scroll: { paddingBottom: spacing.lg },
  section: { marginBottom: spacing.xl },
  sectionTitle: { ...typography.subtitle, color: colors.ink },
  sectionDescription: { ...typography.caption, color: colors.inkSubtle, marginTop: 2, marginBottom: spacing.sm },
  formCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  avatarSummary: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  avatarPreview: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
  },
  avatarSummaryCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  fieldTitle: { ...typography.bodyBold, color: colors.ink },
  fieldHelper: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  avatarOption: {
    width: '31%',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 7,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelMuted,
  },
  avatarOptionTwoColumns: { width: '48%' },
  avatarOptionText: { ...typography.caption, color: colors.inkMuted, flexShrink: 1 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  fieldRowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 0 },
  fieldGrow: { flex: 1, minWidth: 0 },
  fieldGrowWide: { flex: 2, minWidth: 0 },
  fieldGrowSmall: { flex: 0.75, minWidth: 0 },
  fieldLabel: { ...typography.label, color: colors.inkMuted, marginBottom: 7 },
  optionalLabel: { ...typography.overline, color: colors.inkSubtle, marginBottom: spacing.sm, marginTop: 2 },
  segmented: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgTint,
    marginBottom: spacing.md,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
  },
  segmentSelected: { backgroundColor: colors.accentFill, borderWidth: 1, borderColor: colors.goldMuted },
  segmentText: { ...typography.label, color: colors.inkMuted, textAlign: 'center' },
  choiceSelected: { borderColor: colors.goldMuted, backgroundColor: colors.accentFill },
  choiceTextSelected: { color: colors.gold },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  dayOption: {
    flexGrow: 1,
    flexBasis: 38,
    minWidth: 38,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelMuted,
  },
  dayOptionCompact: { flexGrow: 0, flexBasis: '22%' },
  dayText: { ...typography.label, color: colors.inkMuted },
  selectionHint: { ...typography.caption, color: colors.inkSubtle, marginTop: -3, marginBottom: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
  chip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelMuted,
    paddingHorizontal: 13,
    paddingVertical: spacing.sm,
  },
  chipText: { ...typography.caption, color: colors.inkMuted },
  privacyNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  privacyText: { ...typography.caption, color: colors.inkSubtle, flexShrink: 1 },
  saveBar: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, backgroundColor: colors.bg },
});
