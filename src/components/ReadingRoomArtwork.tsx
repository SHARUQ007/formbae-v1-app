import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '../theme/colors';

export function ReadingRoomArtwork({ size = 44 }: { size?: number }) {
  return <Svg width={size} height={size * 48 / 44} viewBox="0 0 44 48" fill="none" accessible={false}>
    <Rect x={11} y={3} width={29} height={36} rx={5} fill="#383340" stroke="#a79ab8" />
    <Rect x={4} y={10} width={29} height={35} rx={5} fill="#344642" stroke="#a9c1b8" />
    <Path d="M23 10v13l4-3 4 3V10" fill={colors.gold} />
    <Path d="M10 20h7m-7 7h15m-15 6h15m-15 6h9" stroke="#dce4df" strokeWidth={1.4} strokeLinecap="round" />
  </Svg>;
}
