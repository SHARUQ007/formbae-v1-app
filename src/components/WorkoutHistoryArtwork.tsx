import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors } from '../theme/colors';

/** Flat editorial artwork, matching the muted colours of the accountability illustrations. */
export function WorkoutHistoryArtwork({ size = 100 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 120 120" fill="none" accessible={false}>
    <Rect x={30} y={14} width={70} height={85} rx={14} fill="#4b425c" stroke="#a39aae" strokeWidth={1.5} />
    <Rect x={15} y={26} width={70} height={79} rx={14} fill="#344b46" stroke="#a3bbb4" strokeWidth={1.5} />
    <Path d="M16 49h68M33 19v16m33-16v16" stroke="#c6d5d0" strokeWidth={3} strokeLinecap="round" />
    <G fill="#91aaa1"><Rect x={28} y={60} width={10} height={9} rx={3} /><Rect x={45} y={60} width={10} height={9} rx={3} /><Rect x={28} y={77} width={10} height={9} rx={3} /><Rect x={45} y={77} width={10} height={9} rx={3} /></G>
    <Circle cx={83} cy={85} r={23} fill={colors.gold} stroke={colors.panel} strokeWidth={4} />
    <Path d="m72 85 7 7 14-16" stroke="#343025" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="m106 38 2-6 2 6 6 2-6 2-2 6-2-6-6-2Z" fill={colors.gold} />
  </Svg>;
}

const paths = {
  'arrow-left': 'M19 12H5m6-6-6 6 6 6',
  'chevron-left': 'm15 6-6 6 6 6',
  'chevron-right': 'm9 6 6 6-6 6',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  zap: 'm13 2-9 12h7l-1 8 10-12h-7l1-8Z',
  award: 'M8 15 6 22l6-3 6 3-2-7M19 9a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  'check-circle': 'm8 12 3 3 5-6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
};
export function WorkoutHistoryIcon({ name, size = 22, color = colors.gold }: { name: keyof typeof paths; size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false}><Path d={paths[name]} stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
