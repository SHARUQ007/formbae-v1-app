import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();
const getLoginScreen = () => require('../screens/auth/LoginScreen').LoginScreen;

export function AuthNavigator() {
  return (
    <Stack.Navigator initialRouteName="Welcome" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen
        name="Login"
        getComponent={getLoginScreen}
        options={({ route }) => ({
          animation: route.params?.reduceMotion ? 'none' : 'fade_from_bottom',
          animationDuration: 240,
        })}
      />
    </Stack.Navigator>
  );
}
