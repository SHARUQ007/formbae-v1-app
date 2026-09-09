import { ScrollView, StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { GymPickerScreen } from './GymPickerScreen';
import { searchGyms, fetchGym, type GymPlace } from '../../services/gymService';
import { updateProfile } from '../../services/settingsService';

let mockSettings = { profile: { lifestyleJson: '{"trainingDays":"4"}', gender: 'neutral' } };
jest.mock('@react-navigation/bottom-tabs', () => ({ useBottomTabBarHeight: () => 0 }));
jest.mock('../../services/appCache', () => ({ peekCachedResource: () => mockSettings }));
jest.mock('../../services/preloadService', () => ({ CACHE_KEYS: { profileSettings: 'settings' }, loadProfileSettingsCached: jest.fn(async () => mockSettings) }));
jest.mock('../../services/gymService', () => ({ searchGyms: jest.fn(), fetchGym: jest.fn() }));
jest.mock('../../services/settingsService', () => ({ updateProfile: jest.fn(async () => ({})) }));

const place: GymPlace = { placeId: 'gym-1', name: 'Neighbourhood Strength Studio', address: '12 Park Road, Kochi' };
const goBack = jest.fn();
let tree: ReturnType<typeof create>;
const button = (label: string) => tree.root.findByProps({ accessibilityLabel: label });
const output = () => JSON.stringify(tree.toJSON());

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings = { profile: { lifestyleJson: '{"trainingDays":"4"}', gender: 'neutral' } };
  jest.mocked(searchGyms).mockResolvedValue([place]);
  jest.mocked(fetchGym).mockResolvedValue(place);
});
afterEach(() => { if (tree) act(() => tree.unmount()); });

async function renderScreen() {
  await act(async () => { tree = create(<GymPickerScreen navigation={{ goBack } as never} route={{ key: 'gym', name: 'GymPicker' }} />); });
}
function typeQuery(value: string) {
  act(() => button('Gym name or area').props.onChangeText(value));
}

it('offers search guidance and a useful empty result state', async () => {
  await renderScreen();
  expect(output()).toContain('Select your gym');
  expect(output()).toContain('YOUR TRAINING HOME');
  expect(button('Search gyms').props.disabled).toBe(true);
  typeQuery('Kochi');
  jest.mocked(searchGyms).mockResolvedValue([]);
  await act(async () => button('Search gyms').props.onPress());
  expect(output()).toContain('No gyms found');
  expect(output()).toContain('Try a nearby area or use the full gym name.');
});

it('shows complete result details and saves a choice without losing other preferences', async () => {
  await renderScreen();
  typeQuery('Studio Kochi');
  await act(async () => button('Search gyms').props.onPress());
  expect(output()).toContain(place.address);
  expect(output()).toContain('Google Maps');
  await act(async () => button(`Select ${place.name}`).props.onPress());
  expect(updateProfile).toHaveBeenCalledWith({ lifestyleJson: JSON.stringify({ trainingDays: '4', workoutSetting: 'gym', selectedGymPlaceId: 'gym-1' }) });
  expect(goBack).toHaveBeenCalledTimes(1);
});

it('clears an in-flight search and ignores its late results', async () => {
  let resolve!: (places: GymPlace[]) => void;
  jest.mocked(searchGyms).mockReturnValue(new Promise(done => { resolve = done; }));
  await renderScreen();
  typeQuery('Kochi');
  act(() => { button('Search gyms').props.onPress(); });
  expect(output()).toContain('Finding your training place');
  act(() => button('Clear gym search').props.onPress());
  await act(async () => resolve([place]));
  expect(output()).not.toContain(place.name);
  expect(output()).toContain('YOUR TRAINING HOME');
  expect(button('Gym name or area').props.value).toBe('');
});

it('keeps the saved-gym state when location details are unavailable', async () => {
  mockSettings.profile.lifestyleJson = '{"selectedGymPlaceId":"saved-gym"}';
  jest.mocked(fetchGym).mockRejectedValue(new Error('Offline'));
  await renderScreen();
  expect(output()).toContain('Your gym is saved');
  expect(output()).toContain('Location details are unavailable right now.');
  expect(output()).toContain('Find another gym');
  expect(button('Remove selected gym').props.disabled).toBe(false);
});

it('fits empty-state artwork into the viewport and keeps the form reachable on a short screen', async () => {
  await renderScreen();
  const scroll = () => tree.root.findByType(ScrollView);
  act(() => {
    scroll().props.onLayout({ nativeEvent: { layout: { height: 500 } } });
    tree.root.findByProps({ testID: 'gym-picker-search' }).props.onLayout({ nativeEvent: { layout: { height: 220 } } });
    tree.root.findByProps({ testID: 'gym-picker-intro-copy' }).props.onLayout({ nativeEvent: { layout: { height: 100 } } });
    tree.root.findByProps({ testID: 'gym-picker-intro' }).props.onLayout({ nativeEvent: { layout: { width: 344 } } });
    scroll().props.onContentSizeChange(344, 500);
  });
  expect(scroll().props.scrollEnabled).toBe(false);
  expect(scroll().props.bounces).toBe(false);
  expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'gym-picker-artwork' }).props.style).height).toBe(136);
  act(() => {
    scroll().props.onLayout({ nativeEvent: { layout: { height: 260 } } });
    scroll().props.onContentSizeChange(344, 364);
  });
  expect(tree.root.findAllByProps({ testID: 'gym-picker-artwork' })).toHaveLength(0);
  expect(scroll().props.scrollEnabled).toBe(true);
  expect(button('Gym name or area')).toBeDefined();
});
