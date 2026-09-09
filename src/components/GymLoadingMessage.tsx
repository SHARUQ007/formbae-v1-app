import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, type TextProps } from 'react-native';
import { GymLoadingIllustration, type GymLoadingIllustrationKind } from './GymLoadingIllustration';

const MESSAGES = [
  { text: 'Racking your dumbbells', art: 'dumbbell' },
  { text: 'Packing your gym bag', art: 'bag' },
  { text: 'Filling your water bottle', art: 'bottle' },
  { text: 'Lacing up your trainers', art: 'shoe' },
  { text: 'Rolling out your mat', art: 'mat' },
  { text: 'Queuing your workout playlist', art: 'headphones' },
  { text: 'Setting up your bench', art: 'bench' },
  { text: 'Grabbing a fresh towel', art: 'towel' },
  { text: 'Lining up your weight plates', art: 'plates' },
] satisfies Array<{ text: string; art: GymLoadingIllustrationKind }>;

// Continue the same rotation across startup and video loaders within a session.
let nextMessage = Math.floor(Math.random() * MESSAGES.length);
function takeMessage() {
  const message = MESSAGES[nextMessage];
  nextMessage = (nextMessage + 1) % MESSAGES.length;
  return message;
}

export function GymLoadingMessage(props: TextProps) {
  const [message, setMessage] = useState(takeMessage);
  const [reduceMotion, setReduceMotion] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active) setReduceMotion(value);
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    let active = true;
    opacity.setValue(1);
    const timer = setInterval(() => {
      if (reduceMotion) {
        setMessage(takeMessage());
        return;
      }
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
        if (!active || !finished) return;
        setMessage(takeMessage());
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      });
    }, 3600);
    return () => { active = false; clearInterval(timer); opacity.stopAnimation(); };
  }, [opacity, reduceMotion]);

  return <Animated.View style={[styles.row, { opacity }]}>
    <GymLoadingIllustration kind={message.art} />
    <Text {...props} style={[styles.text, props.style]}>{message.text}</Text>
  </Animated.View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0, maxWidth: '100%' },
  text: { flexShrink: 1 },
});
