import { StyleSheet, View, ViewStyle } from 'react-native';
import LottieView, { AnimationObject } from 'lottie-react-native';

type LottieAnimationProps = {
  source: AnimationObject | string | { uri: string };
  size?: number;
  loop?: boolean;
  autoPlay?: boolean;
  speed?: number;
  style?: ViewStyle;
};

export function LottieAnimation({
  source,
  size = 96,
  loop = true,
  autoPlay = true,
  speed = 1,
  style,
}: LottieAnimationProps) {
  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      <LottieView source={source} autoPlay={autoPlay} loop={loop} speed={speed} style={styles.animation} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  animation: {
    width: '100%',
    height: '100%',
  },
});
