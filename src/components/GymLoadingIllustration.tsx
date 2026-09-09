import { SvgXml } from 'react-native-svg';

const SHAPES = {
  dumbbell: '<path d="M8 12h8"/><rect x="3" y="6" width="5" height="12" rx="1.5" fill="#e8ca80"/><rect x="16" y="6" width="5" height="12" rx="1.5" fill="#e8ca80"/><path d="M1 9v6m22-6v6"/>',
  bag: '<path d="M8 8V6a4 4 0 0 1 8 0v2"/><rect x="2" y="8" width="20" height="13" rx="4" fill="#97bdad"/><path d="M7 8v13m10-13v13M10 12h4"/>',
  bottle: '<rect x="9" y="2" width="6" height="4" rx="1" fill="#e8ca80"/><path d="M9 6v3l-3 4v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7l-3-4V6Z" fill="#93b9d6"/><path d="M6 14h12m-9 3h6"/>',
  shoe: '<path d="m3 6 5 2 3 6 9 3q2 1 2 4H2V10Z" fill="#c1abd8"/><path d="M2 18h8m2-6-3 2m6 0-3 2m-7-9 1 4"/>',
  mat: '<path d="M5 4h13q3 0 3 3v13H6a4 4 0 0 1-4-4V7a3 3 0 0 1 3-3Z" fill="#83b5af"/><path d="M6 4a3 3 0 0 1 0 6H2m6 4h9m-9 3h9"/>',
  headphones: '<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="2" y="11" width="5" height="9" rx="2" fill="#d6ac8d"/><rect x="17" y="11" width="5" height="9" rx="2" fill="#d6ac8d"/>',
  bench: '<rect x="2" y="8" width="20" height="6" rx="2" fill="#93b9d6"/><path d="M6 14v7m12-7v7M3 21h6m6 0h6M5 8V4"/>',
  towel: '<path d="M5 3h14v17H5Z" fill="#c9b2d9"/><path d="M5 6h14M5 17h14M7 20v2m3-2v2m4-2v2m3-2v2"/><path d="M8 10h8"/>',
  plates: '<ellipse cx="12" cy="12" rx="10" ry="9" fill="#d1b573"/><ellipse cx="12" cy="12" rx="6" ry="5" fill="#3e4246"/><circle cx="12" cy="12" r="2" fill="#ddd9cb"/>',
} as const;

export type GymLoadingIllustrationKind = keyof typeof SHAPES;

export function GymLoadingIllustration({ kind }: { kind: GymLoadingIllustrationKind }) {
  return <SvgXml
    xml={`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="#ede7d7" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${SHAPES[kind]}</g></svg>`}
    width={22} height={22} accessible={false} testID={`gym-loading-art-${kind}`}
  />;
}
