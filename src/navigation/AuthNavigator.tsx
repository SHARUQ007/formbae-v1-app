import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import type { AuthStackParamList } from './types';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator<AuthStackParamList>();
const getLoginScreen = () => require('../screens/auth/LoginScreen').LoginScreen;

export function AuthNavigator() {
  const reduceMotion = useReducedMotion();
  return (
    <Stack.Navigator
      initialRouteName="Welcome"
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        animation: reduceMotion ? 'none' : 'slide_from_right',
        animationDuration: 280,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen
        name="Login"
        getComponent={getLoginScreen}
        options={({ route }) => ({
          animation: route.params?.reduceMotion || reduceMotion ? 'none' : 'slide_from_right',
          animationDuration: 280,
        })}
      />
    </Stack.Navigator>
  );
}
