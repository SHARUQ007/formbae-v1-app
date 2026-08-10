import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';

const foodBowlAnimation = require('../assets/animations/food-bowl.json');

export function FoodBowlGraphic() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      reveal.setValue(1);
      return undefined;
    }

    reveal.setValue(0);
    const animation = Animated.timing(reveal, {
      toValue: 1,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, reveal]);

  return (
    <Animated.View
      style={[
        styles.root,
        {
          opacity: reveal,
          transform: [
            { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
            { scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        },
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Animated plant-based grain bowl with avocado, broccoli, greens, chickpeas, and roasted vegetables"
    >
      <LottieView
        source={foodBowlAnimation}
        autoPlay={!reduceMotion}
        loop={!reduceMotion}
        progress={reduceMotion ? 0.58 : undefined}
        resizeMode="contain"
        speed={0.72}
        style={styles.animation}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'center',
    width: '75%',
    maxWidth: 264,
    height: 104,
    marginVertical: 0,
  },
  animation: {
    width: '100%',
    height: '100%',
    transform: [{ translateY: -10 }, { scale: 1.04 }],
  },
});
