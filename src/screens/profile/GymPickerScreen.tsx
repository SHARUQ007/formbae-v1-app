import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
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
import { GymLocationIllustration } from '../../components/GymLocationIllustration';
import { getGymProfileArtwork } from '../../utils/profileArtwork';
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
  const { width } = useWindowDimensions();
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [searchHeight, setSearchHeight] = useState(0);
  const [introCopyHeight, setIntroCopyHeight] = useState(0);
  const [introWidth, setIntroWidth] = useState(0);
  const cached = useMemo(() => peekCachedResource<MobileSettingsResponse>(CACHE_KEYS.profileSettings), []);
  const [settings, setSettings] = useState<MobileSettingsResponse | null>(cached ?? null);
  const initialLifestyle = parseLifestyle(cached?.profile?.lifestyleJson);
  const [selectedPlaceId, setSelectedPlaceId] = useState(String(initialLifestyle.selectedGymPlaceId || ''));
  const [selectedGym, setSelectedGym] = useState<GymPlace | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GymPlace[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [loadingSelection, setLoadingSelection] = useState(Boolean(initialLifestyle.selectedGymPlaceId));
  const [searching, setSearching] = useState(false);
  const [savingPlaceId, setSavingPlaceId] = useState('');
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const searchController = useRef<AbortController | null>(null);
  const emptyPicker = !selectedPlaceId && !hasSearched;
  // Reserve the actual search/copy heights before sizing decorative artwork.
  // An explicit height also overrides the bundled image's intrinsic height on iOS.
  const naturalArtworkHeight = Math.max(0, (introWidth || width - 48) / 2);
  const artworkHeight = viewportHeight && searchHeight && introCopyHeight
    ? Math.max(0, Math.min(naturalArtworkHeight, viewportHeight - searchHeight - introCopyHeight - 44))
    : naturalArtworkHeight;
  const contentOverflows = viewportHeight > 0 && contentHeight > viewportHeight + 1;

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
    const cleanQuery = query.trim().replace(/\s+/g, ' ');
    if (searchController.current && !searchController.current.signal.aborted) return;
    if (hasSearched && !error && !searching && searchedQuery.toLowerCase() === cleanQuery.toLowerCase()) return;
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
    setSearchedQuery(cleanQuery);
    setResults([]);
    try {
      const places = await searchGyms(cleanQuery, controller.signal);
      if (!controller.signal.aborted && searchController.current === controller) setResults(places);
    } catch (searchError) {
      if (!controller.signal.aborted) {
        setResults([]);
        setError(searchError instanceof Error ? searchError.message : 'Gym search is unavailable right now.');
      }
    } finally {
      if (searchController.current === controller) {
        searchController.current = null;
        setSearching(false);
      }
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
        <ScreenHeader title="Select your gym" onBack={() => navigation.goBack()} />
        <ScrollView
          style={[styles.flex, emptyPicker && { marginBottom: tabBarHeight }]}
          onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}
          onContentSizeChange={(_, height) => setContentHeight(height)}
          scrollEnabled={!emptyPicker || contentOverflows}
          bounces={!emptyPicker}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, emptyPicker ? styles.emptyScroll : { paddingBottom: tabBarHeight + spacing.xl }]}
        >
          {selectedPlaceId ? (
            <View style={styles.selectedCard}>
              <View style={styles.selectedHeading}>
                <GymLocationIllustration size={44} />
                <Text style={[styles.eyebrow, styles.selectedLabel]}>SAVED TO YOUR PLAN</Text>
                <TouchableOpacity
                  style={styles.removeButton}
                  accessibilityRole="button"
                  accessibilityLabel="Remove selected gym"
                  onPress={removeSelection}
                  disabled={removing || Boolean(savingPlaceId)}
                  accessibilityState={{ disabled: removing || Boolean(savingPlaceId), busy: removing }}
                >
                  {removing ? <ActivityIndicator size="small" color={colors.inkMuted} /> : <Feather name="x" size={19} color={colors.inkMuted} />}
                </TouchableOpacity>
              </View>
              <View style={styles.selectedCopy}>
                {loadingSelection ? (
                  <View style={styles.loadingLine}>
                    <ActivityIndicator size="small" color={colors.gold} />
                    <Text style={styles.selectedAddress}>Loading selection…</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.selectedName}>{selectedGym?.name || 'Your gym is saved'}</Text>
                    <Text style={styles.selectedAddress}>{selectedGym?.address || 'Location details are unavailable right now.'}</Text>
                    {selectedGym ? <Text style={styles.googleAttribution}>Google Maps</Text> : null}
                  </>
                )}
              </View>
            </View>
          ) : null}

          <View style={styles.searchCard} testID="gym-picker-search" onLayout={event => setSearchHeight(event.nativeEvent.layout.height)}>
            <Text style={styles.fieldLabel}>{selectedPlaceId ? 'Find another gym' : 'Where do you train?'}</Text>
            <View style={[styles.searchBox, Boolean(error) && styles.searchBoxError]}>
              <Feather name="search" size={20} color={colors.inkMuted} />
              <TextInput
                value={query}
                onChangeText={(value) => {
                  setQuery(value);
                  if (error) setError('');
                }}
                style={styles.input}
                placeholder="Gym name or area"
                placeholderTextColor={colors.inkSubtle}
                returnKeyType="search"
                autoCorrect={false}
                onSubmitEditing={runSearch}
                accessibilityLabel="Gym name or area"
              />
              {query ? <TouchableOpacity style={styles.clearButton} accessibilityRole="button" accessibilityLabel="Clear gym search" onPress={() => { searchController.current?.abort(); searchController.current = null; setQuery(''); setResults([]); setHasSearched(false); setSearching(false); setError(''); }}><Feather name="x" size={17} color={colors.inkMuted} /></TouchableOpacity> : null}
            </View>
            <Text style={styles.searchHint}>Add a neighbourhood or city to narrow your search.</Text>
            <TouchableOpacity
              style={[styles.searchButton, query.trim().length < 3 && styles.searchButtonDisabled]}
              onPress={runSearch}
              disabled={searching || query.trim().length < 3}
              accessibilityRole="button"
              accessibilityLabel="Search gyms"
              accessibilityState={{ disabled: searching || query.trim().length < 3, busy: searching }}
            >
              {searching ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Feather name="search" size={18} color={query.trim().length < 3 ? colors.inkSubtle : colors.onPrimary} />}
              <Text style={[styles.searchButtonText, query.trim().length < 3 && styles.disabledButtonText]}>{searching ? 'Searching…' : 'Search gyms'}</Text>
            </TouchableOpacity>
          </View>
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

          {searching ? (
            <View style={styles.emptyState} accessibilityLiveRegion="polite">
              <GymLocationIllustration size={70} />
              <Text style={styles.emptyTitle}>Finding your training place</Text>
              <Text style={styles.emptyCopy}>Searching for “{searchedQuery}”…</Text>
            </View>
          ) : results.length ? (
            <View style={styles.resultsCard}>
              <View style={styles.resultsHeading}>
                <Text style={styles.fieldLabel}>{results.length} {results.length === 1 ? 'gym found' : 'gyms found'}</Text>
                <Text style={styles.resultAddress}>Matches for “{searchedQuery}”. Tap a gym to save it.</Text>
              </View>
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
                    accessibilityState={{ selected, disabled: Boolean(savingPlaceId) || removing, busy: saving }}
                  >
                    <View style={[styles.resultMarker, selected && styles.resultMarkerSelected]}>
                      <GymLocationIllustration size={38} />
                    </View>
                    <View style={styles.resultCopy}>
                      <Text style={styles.resultName}>{place.name}</Text>
                      <Text style={styles.resultAddress}>{place.address}</Text>
                    </View>
                    {saving ? <ActivityIndicator size="small" color={colors.gold} /> : <Feather name={selected ? 'check-circle' : 'chevron-right'} size={20} color={selected ? colors.success : colors.inkMuted} />}
                  </TouchableOpacity>
                );
              })}
              <View style={styles.attributionRow}>
                <Text style={styles.googleAttribution}>Google Maps</Text>
              </View>
            </View>
          ) : hasSearched && !searching && !error ? (
            <View style={styles.emptyState}>
              <GymLocationIllustration size={80} />
              <Text style={styles.emptyTitle}>No gyms found</Text>
              <Text style={styles.emptyCopy}>Try a nearby area or use the full gym name.</Text>
            </View>
          ) : !hasSearched && !selectedPlaceId ? (
            <View style={styles.introCard} testID="gym-picker-intro" onLayout={event => setIntroWidth(event.nativeEvent.layout.width)}>
              {artworkHeight >= 80 ? <Image source={getGymProfileArtwork(settings?.profile?.gender)} style={[styles.introArtwork, { height: artworkHeight }]} resizeMode="contain" accessible={false} testID="gym-picker-artwork" /> : null}
              <View style={styles.introCopy} testID="gym-picker-intro-copy" onLayout={event => setIntroCopyHeight(event.nativeEvent.layout.height)}>
                <Text style={styles.eyebrow}>YOUR TRAINING HOME</Text>
                <Text style={styles.introTitle}>A place for your routine.</Text>
                <Text style={styles.helperText}>Keep your usual gym with your plan. You can change it anytime.</Text>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: spacing.xl, paddingTop: 8 },
  emptyScroll: { paddingBottom: 12 },
  selectedCard: { gap: 10, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, marginBottom: 16 },
  selectedHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectedLabel: { flex: 1, minWidth: 0 },
  selectedCopy: { minWidth: 0 },
  eyebrow: { ...typography.overline, color: colors.gold, fontSize: 10, lineHeight: 16 },
  selectedName: { ...typography.subtitle, fontSize: 17, lineHeight: 24, color: colors.ink, marginTop: 4 },
  selectedAddress: { ...typography.caption, fontSize: 13, lineHeight: 20, color: colors.inkMuted, marginTop: 4 },
  loadingLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  removeButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised },
  searchCard: { padding: 16, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  fieldLabel: { ...typography.bodyBold, fontSize: 16, lineHeight: 23, color: colors.ink, marginBottom: 10 },
  searchBox: { minHeight: 54, borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 4, gap: 10 },
  searchBoxError: { borderColor: colors.error },
  input: { ...typography.body, fontSize: 15, lineHeight: 23, color: colors.ink, flex: 1, minWidth: 0, paddingVertical: 12 },
  clearButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  searchHint: { ...typography.caption, fontSize: 12, lineHeight: 18, color: colors.inkMuted, marginTop: 10 },
  searchButton: { minHeight: 48, marginTop: 16, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryAction },
  searchButtonText: { ...typography.bodyBold, fontSize: 15, lineHeight: 22, color: colors.onPrimary, flexShrink: 1 },
  searchButtonDisabled: { backgroundColor: colors.panelRaised },
  disabledButtonText: { color: colors.inkSubtle },
  error: { ...typography.caption, color: colors.error, marginTop: 12, paddingHorizontal: 4 },
  resultsCard: { marginTop: 20, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, overflow: 'hidden' },
  resultsHeading: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  resultRow: { minHeight: 84, paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  resultMarker: { width: 42, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised },
  resultMarkerSelected: { backgroundColor: colors.successLight },
  resultCopy: { flex: 1, minWidth: 0 },
  resultName: { ...typography.bodyBold, fontSize: 15, lineHeight: 22, color: colors.ink },
  resultAddress: { ...typography.caption, fontSize: 13, lineHeight: 20, color: colors.inkMuted, marginTop: 3 },
  attributionRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 10 },
  googleAttribution: { fontSize: 12, lineHeight: 18, fontWeight: '400', color: colors.inkMuted, marginTop: 4 },
  emptyState: { marginTop: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.panel, paddingVertical: 24, paddingHorizontal: 20 },
  emptyTitle: { ...typography.subtitle, fontSize: 18, lineHeight: 25, color: colors.ink, textAlign: 'center', marginTop: 12 },
  emptyCopy: { ...typography.caption, fontSize: 14, lineHeight: 21, color: colors.inkMuted, textAlign: 'center', marginTop: 6 },
  introCard: { marginTop: 20, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  introArtwork: { width: '100%', backgroundColor: colors.panel },
  introCopy: { padding: 18 },
  introTitle: { ...typography.subtitle, fontSize: 22, lineHeight: 30, color: colors.ink, marginTop: 6, marginBottom: 8 },
  helperText: { ...typography.caption, fontSize: 14, lineHeight: 21, color: colors.inkMuted },
});
