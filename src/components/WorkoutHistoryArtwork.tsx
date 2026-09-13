import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors } from '../theme/colors';

const sage = '#68887c';
const lightSage = '#afc7b9';
const plum = '#5a526a';
const lightPlum = '#aaa0b9';
const paper = '#e4e7d7';

/** A training journal and folded towel, using the workout illustrations' palette. */
export function WorkoutHistoryArtwork({ width = 132, height = 132 }: { width?: number; height?: number }) {
  return <Svg width={width} height={height} viewBox="0 0 160 160" fill="none" accessible={false} pointerEvents="none">
    <G strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 136h132" stroke="#343b38" strokeWidth={2} />
      <Path d="m96 37 25 6 13 72-24 11-25-14Z" fill={plum} stroke={lightPlum} strokeWidth={1.5} />
      <Path d="m118 49 11 61-17 8m-5-65 11 54" stroke={lightPlum} strokeWidth={2} />
      <G transform="rotate(-9 68 81)">
        <Rect x={29} y={20} width={78} height={112} rx={8} fill="#344d43" stroke={lightSage} strokeWidth={1.5} />
        <Rect x={36} y={18} width={71} height={109} rx={6} fill={sage} stroke={lightSage} strokeWidth={1.5} />
        <Path d="M46 37h50v73H46Z" fill={paper} />
        <Path d="M49 15v14m12-14v14m12-14v14m12-14v14m12-14v14" stroke={lightSage} strokeWidth={3} />
        <Path d="M54 48h28m-28 7h19" stroke={sage} strokeWidth={2.5} />
        <Path d="M53 73h34m-34 13h34m-34 13h34" stroke="#c3cbbb" strokeWidth={1.2} />
        <Path d="m55 66 3 3 5-6m-8 16 3 3 5-6m-8 16 3 3 5-6" stroke={sage} strokeWidth={2} />
        <Path d="M70 67h14m-14 13h11m-11 13h14" stroke={sage} strokeWidth={2} />
        <Path d="M88 17v29l6-4 6 4V17Z" fill={colors.gold} />
        <Path d="M43 117h54" stroke={lightSage} strokeWidth={1.3} />
      </G>
      <G transform="rotate(23 102 119)">
        <Rect x={79} y={114} width={59} height={7} rx={2} fill={lightSage} stroke="#283834" strokeWidth={1.6} />
        <Rect x={82} y={103} width={12} height={28} rx={3} fill={colors.gold} stroke="#c2a15a" strokeWidth={1.4} />
        <Rect x={124} y={103} width={12} height={28} rx={3} fill={colors.gold} stroke="#c2a15a" strokeWidth={1.4} />
        <Path d="M86 108v18m42-18v18" stroke="#fff0c1" strokeWidth={1.8} />
        <Path d="M102 116v3m5-3v3m5-3v3" stroke={sage} strokeWidth={1.2} />
      </G>
    </G>
  </Svg>;
}

export type HistoryMotifKind = 'calendar' | 'streak' | 'record' | 'muscles';

/** Small, local vector illustrations for history metrics; never network-loaded. */
export function HistoryMotif({ kind, size = 32 }: { kind: HistoryMotifKind; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 48 48" fill="none" accessible={false} pointerEvents="none">
    <G strokeLinecap="round" strokeLinejoin="round">
      {kind === 'calendar' ? <>
        <Rect x={12} y={5} width={30} height={35} rx={5} fill={plum} stroke={lightPlum} strokeWidth={1.4} />
        <Rect x={6} y={11} width={30} height={33} rx={5} fill="#344d43" stroke={lightSage} strokeWidth={1.4} />
        <Path d="M7 21h28M14 7v9m14-9v9" stroke={lightSage} strokeWidth={2} />
        <Rect x={12} y={26} width={5} height={5} rx={1} fill={colors.gold} />
        <Rect x={23} y={26} width={5} height={5} rx={1} fill={lightSage} />
        <Rect x={12} y={35} width={5} height={5} rx={1} fill={lightSage} />
        <Path d="m23 36 2 2 5-5" stroke={colors.gold} strokeWidth={2} />
      </> : kind === 'streak' ? <>
        <Path d="M9 37h30M12 31V20m8 11V15m8 16V10m8 21V6" stroke={lightSage} strokeWidth={3} />
        <Path d="m8 32 32-19" stroke={colors.gold} strokeWidth={3} />
        <Path d="M12 41h24" stroke={plum} strokeWidth={3} />
        <Circle cx={36} cy={6} r={3} fill={colors.gold} />
      </> : kind === 'record' ? <>
        <Path d="m13 27-3 17 10-5 8 5 2-18" fill={plum} stroke={lightPlum} strokeWidth={1.4} />
        <Circle cx={25} cy={18} r={14} fill={colors.gold} stroke="#c2a15a" strokeWidth={1.5} />
        <Circle cx={25} cy={18} r={10} stroke="#fff0c1" strokeWidth={1.3} />
        <Path d="m19 18 4 4 8-8" stroke="#4b4430" strokeWidth={2.5} />
      </> : <>
        <Path d="m17 7-9 6-4 15 6 3 6-9-2 19h20l-2-19 6 9 6-3-4-15-9-6-7 5Z" fill="#344d43" stroke={lightSage} strokeWidth={1.4} />
        <Path d="m16 15 8 3 8-3-1 7-7 2-7-2Z" fill={colors.gold} />
        <Path d="M24 18v19m-6-9h12m-12 5h12" stroke={lightSage} strokeWidth={1.3} />
      </>}
    </G>
  </Svg>;
}

export function HistoryArrow({ direction = 'right', color = colors.ink, size = 22 }: { direction?: 'left' | 'right' | 'down' | 'up'; color?: string; size?: number }) {
  const rotation = { right: 0, down: 90, left: 180, up: 270 }[direction];
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false} pointerEvents="none">
    <Path d="m9 5 7 7-7 7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" transform={`rotate(${rotation} 12 12)`} />
  </Svg>;
}
