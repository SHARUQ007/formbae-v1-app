import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

type Props = {
  kind: 'form' | 'logged' | 'begin';
  size?: number;
};

const palette = {
  ink: '#283834',
  sage: '#68887c',
  sageLight: '#afc7b9',
  paper: '#e4e7d7',
  gold: '#f0ce78',
  goldShade: '#c2a15a',
  plum: '#5a526a',
  plumLight: '#aaa0b9',
};

/** Small original illustrations, drawn locally so the workout controls never wait for images. */
export function WorkoutSessionArtwork({ kind, size = 44 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none" accessible={false} pointerEvents="none">
      <G strokeLinecap="round" strokeLinejoin="round">
        {kind === 'form' ? <>
          {/* A folded coaching notebook, with a movement sketch and cue lines. */}
          <Path d="m13 26 31-7 39 8v49l-35 8-35-9Z" fill={palette.plum} stroke={palette.plumLight} strokeWidth={1.6} />
          <Path d="M12 21c12-5 23-5 35 1v53c-12-6-23-6-35-1Z" fill={palette.sage} stroke={palette.sageLight} strokeWidth={1.8} />
          <Path d="M47 22c12-6 24-6 37-1v53c-13-5-25-5-37 1Z" fill={palette.paper} stroke={palette.sageLight} strokeWidth={1.8} />
          <Path d="M47 23v50" stroke={palette.ink} strokeWidth={2} />
          <Path d="M51 25v44" stroke="#c4ccbd" strokeWidth={1.2} />
          <Path d="M68 19v20l5-4 5 4V19" fill={palette.gold} />
          <Circle cx={29} cy={33} r={4} fill={palette.paper} />
          <Path d="m29 42-4 10 10 3m-6-13 8 4m-12 6-4 10m14-7 3 9" stroke={palette.gold} strokeWidth={3} />
          <Path d="M18 66h23" stroke={palette.sageLight} strokeWidth={1.2} />
          <Path d="M58 47h17m-17 8h13m-13 8h17" stroke={palette.sage} strokeWidth={2.4} />
          <Path d="m16 78 27 6m9 0 28-7" stroke={palette.plumLight} strokeWidth={1.2} />
        </> : null}
        {kind === 'logged' ? <>
          {/* A set recorded in a pocket training journal. */}
          <Rect x={24} y={12} width={52} height={66} rx={7} fill={palette.plum} stroke={palette.plumLight} strokeWidth={1.6} />
          <Rect x={15} y={20} width={52} height={65} rx={7} fill={palette.sage} stroke={palette.sageLight} strokeWidth={1.8} />
          <Path d="M24 29h34v44H24Z" fill={palette.paper} />
          <Path d="M29 16v11m11-11v11m11-11v11" stroke={palette.sageLight} strokeWidth={3} />
          <Path d="M31 38h19m-19 8h12m-12 8h19" stroke={palette.sage} strokeWidth={2} />
          <Path d="m31 64 4 4 9-9" stroke={palette.ink} strokeWidth={2.5} />
          <Path d="m60 69 18-32 8 5-18 32-10 8Z" fill={palette.gold} stroke={palette.goldShade} strokeWidth={1.4} />
          <Path d="m60 69 8 5-10 8Z" fill={palette.paper} />
          <Path d="m58 82 2-6 4 2Z" fill={palette.ink} />
          <Path d="m78 37 3-5c1-2 3-2 5-1l3 2c2 1 2 3 1 5l-4 4Z" fill={palette.plumLight} />
          <Path d="m65 67 15-26" stroke="#fff0c1" strokeWidth={1.5} />
        </> : null}
        {kind === 'begin' ? <>
          {/* A folded towel and a pair of weights, ready for the next set. */}
          <Path d="M10 76h75" stroke="#ced4ca" strokeWidth={2} />
          <Path d="m22 27 30-4c5-1 8 2 9 7l5 32-35 6-10-32c-2-5-2-8 1-9Z" fill={palette.sage} stroke={palette.ink} strokeWidth={1.7} />
          <Path d="m52 23 7 37m-31-30 7 32m-3-1 25-4" stroke={palette.sageLight} strokeWidth={2} />
          <Path d="m35 66 26-4 2 7-27 4Z" fill={palette.sageLight} stroke={palette.ink} strokeWidth={1.5} />
          <G transform="rotate(-24 56 45)">
            <Path d="M37 42h39v7H37Z" fill={palette.paper} stroke={palette.ink} strokeWidth={1.7} />
            <Rect x={31} y={32} width={11} height={27} rx={3} fill={palette.plum} stroke={palette.ink} strokeWidth={1.7} />
            <Rect x={71} y={32} width={11} height={27} rx={3} fill={palette.plum} stroke={palette.ink} strokeWidth={1.7} />
            <Path d="M34 37v17m40-17v17" stroke={palette.plumLight} strokeWidth={1.8} />
          </G>
          <G transform="rotate(17 44 66)">
            <Path d="M16 62h58v7H16Z" fill={palette.sageLight} stroke={palette.ink} strokeWidth={1.7} />
            <Rect x={17} y={51} width={13} height={29} rx={3} fill={palette.gold} stroke={palette.ink} strokeWidth={1.7} />
            <Rect x={60} y={51} width={13} height={29} rx={3} fill={palette.gold} stroke={palette.ink} strokeWidth={1.7} />
            <Path d="M21 56v19m43-19v19" stroke="#fff0c1" strokeWidth={2} />
            <Path d="M41 64v3m4-3v3m4-3v3" stroke={palette.sage} strokeWidth={1.2} />
          </G>
        </> : null}
      </G>
    </Svg>
  );
}
