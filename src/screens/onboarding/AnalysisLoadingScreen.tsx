import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GradientLoading } from '../../components/GradientLoading';
import { generateAnalysis } from '../../services/questionnaireService';
import type { OnboardingStackParamList } from '../../navigation/types';

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

  return <GradientLoading title="Setting up your free analysis" subtitle={messages[msgIndex]} />;
}
