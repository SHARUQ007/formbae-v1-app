import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenHeader } from '../../components/Card';
import type { ProfileStackParamList } from '../../navigation/types';
import { peekCachedResource } from '../../services/appCache';
import { fetchGym, searchGyms, type GymPlace } from '../../services/gymService';
import { CACHE_KEYS, loadProfileSettingsCached } from '../../services/preloadService';
import { updateProfile, type MobileSettingsResponse } from '../../services/settingsService';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<ProfileStackParamList, 'GymPicker'>;

function parseLifestyle(raw?: string) {
  if (!raw) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function GymPickerScreen({ navigation }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const cached = useMemo(() => peekCachedResource<MobileSettingsResponse>(CACHE_KEYS.profileSettings), []);
  const [settings, setSettings] = useState<MobileSettingsResponse | null>(cached ?? null);
  const initialLifestyle = parseLifestyle(cached?.profile?.lifestyleJson);
  const [selectedPlaceId, setSelectedPlaceId] = useState(String(initialLifestyle.selectedGymPlaceId || ''));
  const [selectedGym, setSelectedGym] = useState<GymPlace | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GymPlace[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadingSelection, setLoadingSelection] = useState(Boolean(initialLifestyle.selectedGymPlaceId));
  const [searching, setSearching] = useState(false);
  const [savingPlaceId, setSavingPlaceId] = useState('');
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const searchController = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    loadProfileSettingsCached().then((nextSettings) => {
      if (!active) return;
      setSettings(nextSettings);
      const lifestyle = parseLifestyle(nextSettings.profile?.lifestyleJson);
      setSelectedPlaceId(String(lifestyle.selectedGymPlaceId || ''));
    }).catch(() => undefined);
    return () => {
      active = false;
      searchController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!selectedPlaceId) {
      setSelectedGym(null);
      setLoadingSelection(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoadingSelection(true);
    fetchGym(selectedPlaceId, controller.signal)
      .then((place) => {
        if (active) setSelectedGym(place);
      })
      .catch(() => {
        if (active) setSelectedGym(null);
      })
      .finally(() => {
        if (active) setLoadingSelection(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedPlaceId]);

  const runSearch = async () => {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 3) {
      setError('Enter a gym name or area.');
      return;
    }
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSearching(true);
    setError('');
    setHasSearched(true);
    try {
      setResults(await searchGyms(cleanQuery, controller.signal));
    } catch (searchError) {
      if (!controller.signal.aborted) {
        setResults([]);
        setError(searchError instanceof Error ? searchError.message : 'Gym search is unavailable right now.');
      }
    } finally {
      if (searchController.current === controller) setSearching(false);
    }
  };

  const saveSelection = async (place: GymPlace) => {
    if (savingPlaceId || removing) return;
    setSavingPlaceId(place.placeId);
    setError('');
    try {
      const latestSettings = settings || await loadProfileSettingsCached();
      const lifestyle = parseLifestyle(latestSettings.profile?.lifestyleJson);
      await updateProfile({
        lifestyleJson: JSON.stringify({
          ...lifestyle,
          workoutSetting: 'gym',
          selectedGymPlaceId: place.placeId,
        }),
      });
      await loadProfileSettingsCached({ force: true }).catch(() => undefined);
      navigation.goBack();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this gym.');
    } finally {
      setSavingPlaceId('');
    }
  };

  const removeSelection = () => {
    Alert.alert('Remove selected gym?', 'Your workout setting will stay as Gym, but the saved location will be cleared.', [
      { text: 'Keep gym', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemoving(true);
          setError('');
          try {
            const latestSettings = settings || await loadProfileSettingsCached();
            const lifestyle = parseLifestyle(latestSettings.profile?.lifestyleJson);
            delete lifestyle.selectedGymPlaceId;
            await updateProfile({ lifestyleJson: JSON.stringify(lifestyle) });
            await loadProfileSettingsCached({ force: true }).catch(() => undefined);
            navigation.goBack();
          } catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : 'Could not remove this gym.');
          } finally {
            setRemoving(false);
          }
        },
      },
    ]);
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader title="Choose your gym" subtitle="Search by gym name or area" onBack={() => navigation.goBack()} />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
        >
          {selectedPlaceId ? (
            <View style={styles.selectedCard}>
              <View style={styles.selectedIcon}>
                <Feather name="map-pin" size={20} color={colors.gold} />
              </View>
              <View style={styles.selectedCopy}>
                <Text style={styles.eyebrow}>YOUR GYM</Text>
                {loadingSelection ? (
                  <View style={styles.loadingLine}>
                    <ActivityIndicator size="small" color={colors.gold} />
                    <Text style={styles.selectedAddress}>Loading selection…</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.selectedName} numberOfLines={2}>{selectedGym?.name || 'Gym selected'}</Text>
                    {selectedGym?.address ? <Text style={styles.selectedAddress} numberOfLines={2}>{selectedGym.address}</Text> : null}
                    {selectedGym ? <Text style={styles.googleAttribution}>Google Maps</Text> : null}
                  </>
                )}
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                accessibilityRole="button"
                accessibilityLabel="Remove selected gym"
                onPress={removeSelection}
                disabled={removing}
              >
                {removing ? <ActivityIndicator size="small" color={colors.inkMuted} /> : <Feather name="x" size={19} color={colors.inkMuted} />}
              </TouchableOpacity>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Find a gym</Text>
          <View style={[styles.searchBox, Boolean(error) && styles.searchBoxError]}>
            <Feather name="search" size={20} color={colors.inkMuted} />
            <TextInput
              value={query}
              onChangeText={(value) => {
                setQuery(value);
                if (error) setError('');
              }}
              style={styles.input}
              placeholder="Gym name or neighbourhood"
              placeholderTextColor={colors.inkSubtle}
              returnKeyType="search"
              autoCorrect={false}
              onSubmitEditing={runSearch}
              accessibilityLabel="Gym name or area"
            />
            <TouchableOpacity
              style={[styles.searchButton, query.trim().length < 3 && styles.searchButtonDisabled]}
              onPress={runSearch}
              disabled={searching || query.trim().length < 3}
              accessibilityRole="button"
              accessibilityLabel="Search gyms"
            >
              {searching ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Feather name="arrow-right" size={20} color={colors.onPrimary} />}
            </TouchableOpacity>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {results.length ? (
            <View style={styles.resultsCard}>
              {results.map((place, index) => {
                const selected = place.placeId === selectedPlaceId;
                const saving = place.placeId === savingPlaceId;
                return (
                  <TouchableOpacity
                    key={place.placeId}
                    activeOpacity={0.82}
                    style={[styles.resultRow, index < results.length - 1 && styles.resultBorder]}
                    onPress={() => saveSelection(place)}
                    disabled={Boolean(savingPlaceId) || removing}
                    accessibilityRole="button"
                    accessibilityLabel={`${selected ? 'Selected gym' : 'Select'} ${place.name}`}
                  >
                    <View style={[styles.resultMarker, selected && styles.resultMarkerSelected]}>
                      <Feather name={selected ? 'check' : 'map-pin'} size={17} color={colors.gold} />
                    </View>
                    <View style={styles.resultCopy}>
                      <Text style={styles.resultName} numberOfLines={2}>{place.name}</Text>
                      <Text style={styles.resultAddress} numberOfLines={2}>{place.address}</Text>
                    </View>
                    {saving ? <ActivityIndicator size="small" color={colors.gold} /> : <Feather name="chevron-right" size={20} color={colors.inkSubtle} />}
                  </TouchableOpacity>
                );
              })}
              <View style={styles.attributionRow}>
                <Text style={styles.googleAttribution}>Google Maps</Text>
              </View>
            </View>
          ) : hasSearched && !searching && !error ? (
            <View style={styles.emptyState}>
              <Feather name="map" size={24} color={colors.gold} />
              <Text style={styles.emptyTitle}>No gyms found</Text>
              <Text style={styles.emptyCopy}>Try the gym name, neighbourhood, or city.</Text>
            </View>
          ) : (
            <View style={styles.helperCard}>
              <View style={styles.helperMark} />
              <Text style={styles.helperText}>Save the place where you usually train. You can change it anytime.</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: spacing.xl },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    backgroundColor: colors.panelWarm,
    marginBottom: spacing.lg,
  },
  selectedIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  selectedCopy: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.overline, color: colors.gold, fontSize: 10 },
  selectedName: { ...typography.subtitle, color: colors.ink, marginTop: 3 },
  selectedAddress: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  loadingLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelRaised,
  },
  fieldLabel: { ...typography.bodyBold, color: colors.ink, marginBottom: spacing.sm },
  searchBox: {
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    gap: spacing.sm,
  },
  searchBoxError: { borderColor: colors.error },
  input: { ...typography.body, color: colors.ink, flex: 1, paddingVertical: spacing.sm },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryAction,
  },
  searchButtonDisabled: { opacity: 0.38 },
  error: { ...typography.caption, color: colors.error, marginTop: spacing.xs },
  resultsCard: {
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    overflow: 'hidden',
  },
  resultRow: {
    minHeight: 78,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resultBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  resultMarker: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelRaised,
  },
  resultMarkerSelected: { backgroundColor: colors.accentLight },
  resultCopy: { flex: 1, minWidth: 0 },
  resultName: { ...typography.bodyBold, color: colors.ink },
  resultAddress: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  attributionRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  googleAttribution: { fontSize: 12, lineHeight: 16, fontWeight: '400', color: colors.inkMuted },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl * 2, paddingHorizontal: spacing.lg },
  emptyTitle: { ...typography.subtitle, color: colors.ink, marginTop: spacing.sm },
  emptyCopy: { ...typography.caption, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.xs },
  helperCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.panelMuted,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  helperMark: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.gold, marginTop: 6 },
  helperText: { ...typography.caption, color: colors.inkMuted, flex: 1 },
});
