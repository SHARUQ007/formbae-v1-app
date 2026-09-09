import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import type { ProfileStackParamList } from './types';
import { colors } from '../theme/colors';
import { useReducedMotion } from '../hooks/useReducedMotion';

const Stack = createNativeStackNavigator<ProfileStackParamList>();
const getEditProfileScreen = () => require('../screens/profile/EditProfileScreen').EditProfileScreen;
const getGymPickerScreen = () => require('../screens/profile/GymPickerScreen').GymPickerScreen;
const getTrainerScreen = () => require('../screens/main/TrainerScreen').TrainerScreen;
const getLegalScreen = () => require('../screens/legal/LegalScreen').LegalScreen;
const getDeleteAccountScreen = () => require('../screens/profile/DeleteAccountScreen').DeleteAccountScreen;

export function ProfileNavigator() {
  const reduceMotion = useReducedMotion();
  return (
    <Stack.Navigator
      screenOptions={{
        gestureEnabled: true,
        animation: reduceMotion ? 'none' : 'slide_from_right',
        animationDuration: 260,
        headerTitle: '',
        headerBackButtonDisplayMode: 'minimal',
        headerBackTitle: '',
        headerTintColor: colors.accentDark,
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.ink },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="ProfileMain" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EditProfile" getComponent={getEditProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="GymPicker" getComponent={getGymPickerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Trainer" getComponent={getTrainerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Legal" getComponent={getLegalScreen} />
      <Stack.Screen name="DeleteAccount" getComponent={getDeleteAccountScreen} />
    </Stack.Navigator>
  );
}
