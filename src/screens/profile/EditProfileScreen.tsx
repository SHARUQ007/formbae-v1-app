import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, Card, SectionTitle } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState, ErrorState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { fetchSettings, updateProfile } from '../../services/settingsService';
import type { ProfileStackParamList } from '../../navigation/types';
import { spacing } from '../../theme/spacing';

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>;

export function EditProfileScreen({ navigation }: Props) {
  const { data, loading, error, reload } = useAsync(() => fetchSettings());
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.profile) {
      setForm({
        name: '',
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
      });
    }
  }, [data?.profile]);

  const set = (key: string, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]));
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
          <FormInput label="Name" icon="user" value={form.name || ''} onChangeText={(value) => set('name', value)} placeholder="Leave empty to keep current name" autoCapitalize="words" />
          <FormInput label="Age" value={form.age || ''} onChangeText={(value) => set('age', value)} placeholder="Age" keyboardType="numeric" />
          <FormInput label="Gender" value={form.gender || ''} onChangeText={(value) => set('gender', value)} placeholder="e.g. male / female" autoCapitalize="words" />
          <FormInput label="Diet preference" value={form.dietPref || ''} onChangeText={(value) => set('dietPref', value)} placeholder="e.g. vegetarian" autoCapitalize="words" />
          <FormInput label="Training days per week" value={form.trainingDays || ''} onChangeText={(value) => set('trainingDays', value)} placeholder="e.g. 4" keyboardType="numeric" />
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
});
