import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../../../theme/colors';

export function WorkoutOverviewArt({ kind, size = 36, variant = 0 }: { kind: 'time' | 'energy' | 'growth' | 'flow'; size?: number; variant?: number }) {
  if (variant === 1) return <Svg width={size} height={size} viewBox="0 0 48 48" fill="none" accessible={false}>
    {kind === 'time' ? <>
      <Path d="M12 6h24M12 42h24M15 7v8c0 5 7 5 7 9s-7 4-7 9v8m18-34v8c0 5-7 5-7 9s7 4 7 9v8" stroke="#B4A6C6" strokeWidth={2} strokeLinecap="round" />
      <Path d="m17 14 7 7 7-7M17 38l7-9 7 9" fill={colors.gold} />
    </> : kind === 'energy' ? <>
      <Circle cx={24} cy={24} r={19} fill="#343238" stroke="#B4A6C6" strokeWidth={1.4} />
      <Path d="m27 8-15 19h10l-1 13 15-20H26l1-12Z" fill={colors.gold} stroke={colors.gold} strokeLinejoin="round" />
    </> : kind === 'growth' ? <>
      <Path d="M24 41V23" stroke={colors.gold} strokeWidth={2} strokeLinecap="round" />
      <Path d="M24 29C9 31 6 21 7 13c12-1 19 4 17 16Z" fill="#759692" stroke="#B7CFC4" strokeWidth={1.4} />
      <Path d="M24 23C23 10 32 5 41 6c2 13-5 20-17 17Z" fill="#A6B9A0" />
      <Path d="m13 20 11 10m0-7L35 12M15 42h18" stroke={colors.gold} strokeWidth={1.5} strokeLinecap="round" />
    </> : <>
      <Path d="M10 36h9V25h10V14h10" stroke="#B4A6C6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={10} cy={36} r={5} fill="#8EAEB0" />
      <Circle cx={24} cy={25} r={4} fill="#B4A6C6" />
      <Circle cx={39} cy={14} r={5} fill={colors.gold} />
    </>}
  </Svg>;
  if (variant === 2) return <Svg width={size} height={size} viewBox="0 0 48 48" fill="none" accessible={false}>
    {kind === 'time' ? <>
      <Rect x={8} y={8} width={32} height={32} rx={10} fill="#353A30" stroke="#AEC09E" strokeWidth={1.6} />
      <Circle cx={24} cy={24} r={11} stroke={colors.gold} strokeWidth={1.5} />
      <Path d="M24 17v7l-5 4M18 4h12M18 44h12" stroke={colors.gold} strokeWidth={2} strokeLinecap="round" />
    </> : kind === 'energy' ? <>
      <Circle cx={24} cy={24} r={10} fill={colors.gold} />
      <Path d="M24 4v5m0 30v5M4 24h5m30 0h5M10 10l4 4m20 20 4 4M10 38l4-4m20-20 4-4" stroke="#B3C3A6" strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={24} cy={24} r={16} stroke="#76866C" strokeWidth={1} />
    </> : kind === 'growth' ? <>
      <Circle cx={22} cy={26} r={17} fill="#2B383A" stroke="#A7C3C5" strokeWidth={1.5} />
      <Circle cx={22} cy={26} r={10} stroke="#A7C3C5" strokeWidth={1.5} />
      <Circle cx={22} cy={26} r={3} fill={colors.gold} />
      <Path d="m22 26 17-17m-1 1-1-6 6-1-1 6-6 1" stroke={colors.gold} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </> : <>
      <Rect x={8} y={5} width={32} height={38} rx={5} fill="#323B33" stroke="#AEC09E" strokeWidth={1.5} />
      <Path d="m13 15 3 3 5-6m-8 13 3 3 5-6m-8 13 3 3 5-6" stroke={colors.gold} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M26 15h8m-8 10h8m-8 10h6" stroke="#B5C8B0" strokeWidth={1.8} strokeLinecap="round" />
    </>}
  </Svg>;
  return <Svg width={size} height={size} viewBox="0 0 48 48" fill="none" accessible={false}>
    {kind === 'time' ? <>
      <Path d="M20 5h8M24 5v6m11 3 4-4" stroke={colors.gold} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={24} cy={28} r={16} fill="#27383C" stroke="#B1CDD1" strokeWidth={1.6} />
      <Path d="M24 17v11l7 4" stroke={colors.gold} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={24} cy={28} r={2} fill={colors.gold} />
    </> : kind === 'energy' ? <>
      <Path d="M26 4c3 12-9 14-5 22 4-1 7-5 7-9 10 8 13 15 8 22-6 8-21 6-25-2C5 25 20 18 26 4Z" fill="#C28C63" stroke="#E2BB96" strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M24 26c1 5-5 7-4 11 1 4 7 5 9 1 2-4-3-7-5-12Z" fill={colors.gold} />
    </> : kind === 'growth' ? <>
      <Rect x={5} y={29} width={8} height={14} rx={2} fill="#78939C" />
      <Rect x={20} y={21} width={8} height={22} rx={2} fill="#A3B8B5" />
      <Rect x={35} y={11} width={8} height={32} rx={2} fill={colors.gold} />
      <Path d="m6 21 13-12 7 3 12-9m-8 0h8v8" stroke={colors.inkMuted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </> : <>
      <Path d="M12 9h20a7 7 0 0 1 0 14H17a7 7 0 0 0 0 14h18" stroke="#B4A6C6" strokeWidth={2} strokeLinecap="round" />
      <Circle cx={10} cy={9} r={5} fill={colors.gold} />
      <Circle cx={24} cy={23} r={4} fill="#8EAEB0" />
      <Path d="m32 32 6 5-6 5" stroke={colors.gold} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </>}
  </Svg>;
}
