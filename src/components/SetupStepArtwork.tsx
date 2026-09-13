import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors } from '../theme/colors';
import { WorkoutSessionArtwork } from './WorkoutSessionArtwork';

export type SetupArtworkKind = 'profile' | 'direction' | 'coach' | 'membership' | 'plan';
const sage = '#68887c';
const lightSage = '#afc7b9';
const plum = '#5a526a';
const lightPlum = '#aaa0b9';
const paper = '#e4e7d7';

/** Local illustrations for each setup step, in the workout artwork palette. */
export function SetupStepArtwork({ kind, size = 46 }: { kind: SetupArtworkKind; size?: number }) {
  if (kind === 'plan') return <WorkoutSessionArtwork kind="form" size={size} />;
  return <Svg width={size} height={size} viewBox="0 0 64 64" fill="none" accessible={false} pointerEvents="none">
    <G strokeLinecap="round" strokeLinejoin="round">
      {kind === 'profile' ? <>
        <Rect x={17} y={5} width={38} height={49} rx={6} fill={plum} stroke={lightPlum} strokeWidth={1.4} />
        <Rect x={8} y={12} width={38} height={47} rx={6} fill={sage} stroke={lightSage} strokeWidth={1.5} />
        <Circle cx={27} cy={26} r={6} fill={paper} />
        <Path d="M17 42v-3a10 10 0 0 1 20 0v3" fill={paper} />
        <Path d="M17 48h20m-20 5h13" stroke={lightSage} strokeWidth={2} />
        <Path d="m44 40 9-19 6 3-9 19-8 6Z" fill={colors.gold} stroke="#c2a15a" strokeWidth={1.3} />
        <Path d="m44 40 6 3-8 6Z" fill={paper} />
      </> : kind === 'direction' ? <>
        <Path d="m6 14 17-6 18 6 17-6v42l-17 6-18-6-17 6Z" fill={sage} stroke={lightSage} strokeWidth={1.5} />
        <Path d="M23 8v42l18 6V14Z" fill="#344d43" stroke={lightSage} strokeWidth={1.2} />
        <Path d="m12 43 12-15 10 10 15-16" stroke={paper} strokeWidth={2} strokeDasharray="3 4" />
        <Circle cx={12} cy={43} r={3} fill={colors.gold} />
        <Path d="M41 21a8 8 0 1 1 16 0c0 6-8 14-8 14s-8-8-8-14Z" fill={colors.gold} stroke="#c2a15a" strokeWidth={1.4} />
        <Circle cx={49} cy={21} r={3} fill={plum} />
      </> : kind === 'coach' ? <>
        <Rect x={28} y={8} width={31} height={31} rx={5} fill={plum} stroke={lightPlum} strokeWidth={1.5} />
        <Path d="M38 18h13m-13 6h9m-9 6h13" stroke={paper} strokeWidth={2} />
        <Circle cx={18} cy={24} r={8} fill={lightSage} />
        <Path d="M5 55V45a13 13 0 0 1 26 0v10Z" fill={sage} stroke={lightSage} strokeWidth={1.5} />
        <Circle cx={43} cy={36} r={7} fill={colors.gold} />
        <Path d="M32 58v-7a11 11 0 0 1 22 0v7Z" fill={colors.gold} stroke="#c2a15a" strokeWidth={1.4} />
        <Path d="M12 46v9m12-9v9" stroke={lightSage} strokeWidth={1.5} />
      </> : <>
        <Rect x={14} y={9} width={44} height={34} rx={6} fill={plum} stroke={lightPlum} strokeWidth={1.5} />
        <Rect x={5} y={21} width={47} height={34} rx={6} fill={sage} stroke={lightSage} strokeWidth={1.5} />
        <Path d="M6 31h45" stroke={lightSage} strokeWidth={5} />
        <Rect x={12} y={39} width={10} height={8} rx={2} fill={colors.gold} />
        <Path d="M29 41h15m-15 6h9" stroke={paper} strokeWidth={2} />
      </>}
    </G>
  </Svg>;
}

export function SetupCompletedMark() {
  return <Svg width={18} height={18} viewBox="0 0 20 20" fill="none" accessible={false}>
    <Circle cx={10} cy={10} r={9} fill={colors.gold} stroke={colors.panel} strokeWidth={2} />
    <Path d="m6 10 3 3 5-6" stroke={colors.onPrimary} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

export function SetupContinueArrow() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" accessible={false}>
    <Path d="M4 12h15m-6-7 7 7-7 7" stroke={colors.onPrimary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
