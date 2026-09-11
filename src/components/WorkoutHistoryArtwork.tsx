import Svg, { G, Path } from 'react-native-svg';
import { colors } from '../theme/colors';

/** A continuous-line print inspired by track lanes. Decorative, not a data chart. */
export function WorkoutHistoryArtwork({ width = 156, height = 142 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 180 164" fill="none" accessible={false} pointerEvents="none">
      <G strokeLinecap="round" strokeLinejoin="round">
        <Path d="M176 18H91C46 18 10 54 10 99s36 81 81 81h87" stroke="#39382f" strokeWidth={1} />
        <Path d="M176 28H91c-39 0-71 32-71 71s32 71 71 71h87" stroke="#545044" strokeWidth={1} />
        <Path d="M176 38H91c-34 0-61 27-61 61s27 61 61 61h87" stroke={colors.goldMuted} strokeWidth={1} />
        <Path d="M176 48H91c-28 0-51 23-51 51s23 51 51 51h87" stroke={colors.gold} strokeWidth={1.3} />
        <Path d="M176 58H91c-23 0-41 18-41 41s18 41 41 41h87" stroke="#6c6250" strokeWidth={1} />
        <Path d="M176 68H91c-17 0-31 14-31 31s14 31 31 31h87" stroke="#4a463d" strokeWidth={1} />
        <Path d="M176 78H91c-12 0-21 9-21 21s9 21 21 21h87" stroke="#39382f" strokeWidth={1} />
        <Path d="m125 12-9 71m-11 52-5 41" stroke="#77705d" strokeWidth={0.7} />
        <Path d="M143 48h22" stroke={colors.ink} strokeWidth={3} />
        <Path d="M48 70a51 51 0 0 0-8 29" stroke={colors.ink} strokeWidth={2} />
      </G>
    </Svg>
  );
}
