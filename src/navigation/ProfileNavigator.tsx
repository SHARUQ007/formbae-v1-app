import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { TrainerScreen } from '../screens/main/TrainerScreen';
import { LegalScreen } from '../screens/legal/LegalScreen';
import { DeleteAccountScreen } from '../screens/profile/DeleteAccountScreen';
import type { ProfileStackParamList } from './types';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerTitle: '',
        headerBackTitle: '',
        headerTintColor: colors.accentDark,
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.ink },
      }}
    >
      <Stack.Screen name="ProfileMain" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="Trainer" component={TrainerScreen} />
      <Stack.Screen name="Legal" component={LegalScreen} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
    </Stack.Navigator>
  );
}
