import { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { generateAnalysis } from '../../services/questionnaireService';
import type { OnboardingStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'AnalysisLoading'>;

const messages = [
  'Preparing your analysis',
  'Finding your recommended trainer',
  'Creating your starter fitness direction',
];

export function AnalysisLoadingScreen({ navigation }: Props) {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setMsgIndex((i) => (i + 1) % messages.length), 1800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await generateAnalysis();
      } catch {
        // still navigate — GET will retry
      }
      navigation.replace('AnalysisReport');
    })();
  }, [navigation]);

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.container}>
      <Text style={styles.title}>Setting up your free analysis</Text>
      <Text style={styles.subtitle}>{messages[msgIndex]}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: colors.white, fontSize: 24, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  subtitle: { color: '#ecfdf5', fontSize: 16, textAlign: 'center' },
});
