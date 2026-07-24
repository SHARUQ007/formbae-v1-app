import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, Card, SectionTitle } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState, ErrorState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { fetchSettings, updateProfile } from '../../services/settingsService';
import type { ProfileStackParamList } from '../../navigation/types';
import { titleCase } from '../../utils/format';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>;

const AVATAR_OPTIONS = ['panther', 'wolf', 'eagle', 'shark', 'rabbit', 'cobra'];
const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Bengali', 'Gujarati', 'Punjabi', 'Urdu'];
const GENDER_OPTIONS = ['male', 'female', 'other'];
const TRAINING_DAYS_OPTIONS = ['1', '2', '3', '4', '5', '6', '7'];
const WORKOUT_SETTING_OPTIONS = [
  { value: 'gym', label: 'Mostly Gym' },
  { value: 'home', label: 'Mostly Home' },
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

export function EditProfileScreen({ navigation }: Props) {
  const { data, loading, error, reload } = useAsync(() => fetchSettings());
  const [form, setForm] = useState<Record<string, string>>({});
  const [languages, setLanguages] = useState<string[]>([]);
  const [lifestyle, setLifestyle] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.profile) {
      const parsedLifestyle = parseJsonRecord(data.profile.lifestyleJson);
      setForm({
        name: '',
        avatarIcon: data.profile.avatarIcon || 'panther',
        age: data.profile.age || '',
        gender: data.profile.gender || '',
        height: data.profile.height || '',
        weight: data.profile.weight || '',
        chest: data.profile.chest || '',
        waist: data.profile.waist || '',
        biceps: data.profile.biceps || '',
        dietPref: data.profile.dietPref || '',
        trainingDays: data.profile.trainingDays || '',
        fitnessGoal: data.profile.fitnessGoal || '',
        allergies: data.profile.allergies || '',
        workoutSetting: parsedLifestyle.workoutSetting === 'home' ? 'home' : 'gym',
      });
      setLanguages(parseLanguages(data.profile.languagePreferencesJson));
      setLifestyle(parsedLifestyle);
    }
  }, [data?.profile]);

  const set = (key: string, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const nextLifestyle = { ...lifestyle, workoutSetting: form.workoutSetting || 'gym' };
      const payload = {
        ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])),
        lifestyleJson: JSON.stringify(nextLifestyle),
        languagePreferencesJson: JSON.stringify(languages.length ? languages : ['English']),
      };
      await updateProfile(payload);
      Alert.alert('Profile updated', 'Your profile details have been saved.', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading profile…" />
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer>
        <ErrorState message={error || 'Could not load profile.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer withBottomInset>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SectionTitle>Basic details</SectionTitle>
        <Card>
          <Text style={styles.fieldLabel}>Profile icon</Text>
          <ChipGroup values={AVATAR_OPTIONS} selected={form.avatarIcon || 'panther'} onSelect={(value) => set('avatarIcon', value)} />
          <FormInput label="Name" icon="user" value={form.name || ''} onChangeText={(value) => set('name', value)} placeholder="Leave empty to keep current name" autoCapitalize="words" />
          <FormInput label="Age" value={form.age || ''} onChangeText={(value) => set('age', value)} placeholder="Age" keyboardType="numeric" />
          <Text style={styles.fieldLabel}>Gender</Text>
          <ChipGroup values={GENDER_OPTIONS} selected={form.gender || ''} onSelect={(value) => set('gender', value)} />
          <FormInput label="Diet preference" value={form.dietPref || ''} onChangeText={(value) => set('dietPref', value)} placeholder="e.g. vegetarian" autoCapitalize="words" />
          <Text style={styles.fieldLabel}>Training days per week</Text>
          <ChipGroup values={TRAINING_DAYS_OPTIONS} selected={form.trainingDays || ''} onSelect={(value) => set('trainingDays', value)} />
          <Text style={styles.fieldLabel}>Workout preference</Text>
          <ChipGroup
            options={WORKOUT_SETTING_OPTIONS}
            selected={form.workoutSetting || 'gym'}
            onSelect={(value) => set('workoutSetting', value)}
          />
        </Card>

        <SectionTitle>Body measurements</SectionTitle>
        <Card>
          <FormInput label="Height (cm)" value={form.height || ''} onChangeText={(value) => set('height', value)} placeholder="Height" keyboardType="numeric" />
          <FormInput label="Weight (kg)" value={form.weight || ''} onChangeText={(value) => set('weight', value)} placeholder="Weight" keyboardType="numeric" />
          <FormInput label="Chest (cm)" value={form.chest || ''} onChangeText={(value) => set('chest', value)} placeholder="Chest" keyboardType="numeric" />
          <FormInput label="Waist (cm)" value={form.waist || ''} onChangeText={(value) => set('waist', value)} placeholder="Waist" keyboardType="numeric" />
          <FormInput label="Biceps (cm)" value={form.biceps || ''} onChangeText={(value) => set('biceps', value)} placeholder="Biceps" keyboardType="numeric" />
        </Card>

        <SectionTitle>Goal & notes</SectionTitle>
        <Card>
          <FormInput label="Fitness goal" value={form.fitnessGoal || ''} onChangeText={(value) => set('fitnessGoal', value)} placeholder="What are you working toward?" multiline autoCapitalize="sentences" />
          <Text style={styles.fieldLabel}>Language preferences</Text>
          <MultiChipGroup
            values={LANGUAGE_OPTIONS}
            selected={languages}
            onToggle={(value) => setLanguages((current) => current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value])}
          />
          <FormInput label="Injuries / restrictions / notes" value={form.allergies || ''} onChangeText={(value) => set('allergies', value)} placeholder="Anything your trainer should know?" multiline autoCapitalize="sentences" />
        </Card>

        <PrimaryButton title="Save profile" icon="check" onPress={onSave} loading={saving} style={styles.save} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },
  save: { marginTop: spacing.lg },
  fieldLabel: { ...typography.label, color: colors.inkMuted, marginBottom: 8, marginTop: 2 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  chipText: { ...typography.caption, color: colors.inkMuted },
  chipTextSelected: { color: colors.accentDark },
});

function ChipGroup({
  values,
  options,
  selected,
  onSelect,
}: {
  values?: string[];
  options?: Array<{ value: string; label: string }>;
  selected: string;
  onSelect: (value: string) => void;
}) {
  const entries = options ?? (values ?? []).map((value) => ({ value, label: titleCase(value) }));
  return (
    <View style={styles.chipWrap}>
      {entries.map((entry) => {
        const isSelected = selected === entry.value;
        return (
          <TouchableOpacity key={entry.value} activeOpacity={0.75} style={[styles.chip, isSelected && styles.chipSelected]} onPress={() => onSelect(entry.value)}>
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{entry.label}</Text>
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
          <TouchableOpacity key={value} activeOpacity={0.75} style={[styles.chip, isSelected && styles.chipSelected]} onPress={() => onToggle(value)}>
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{value}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
