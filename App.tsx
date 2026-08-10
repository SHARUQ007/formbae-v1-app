import 'react-native-gesture-handler';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme/colors';
import { AppDialogProvider } from './src/components/AppDialogProvider';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <AppDialogProvider>
        <RootNavigator />
      </AppDialogProvider>
    </SafeAreaProvider>
  );
}

export default App;
