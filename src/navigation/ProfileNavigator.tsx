import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { LegalScreen } from '../screens/legal/LegalScreen';
import { DeleteAccountScreen } from '../screens/profile/DeleteAccountScreen';
import type { ProfileStackParamList } from './types';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: colors.accentDark,
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.ink },
      }}
    >
      <Stack.Screen name="ProfileMain" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Legal" component={LegalScreen} options={{ title: 'Legal & support' }} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ title: 'Delete account' }} />
    </Stack.Navigator>
  );
}
