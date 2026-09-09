import { SvgXml } from 'react-native-svg';

const artwork = {
  cup: '<path d="M20 13h24v17c0 10-5 16-12 16s-12-6-12-16Z" fill="#f0ce78"/><path d="M20 18H10v7c0 9 5 12 12 12m22-19h10v7c0 9-5 12-12 12" stroke="#c5ad70" stroke-width="3"/><path d="M32 46v9m-12 3h24" stroke="#f0ce78" stroke-width="4"/><path d="m32 21 2.5 5 5.5.8-4 4 1 5.5-5-2.6-5 2.6 1-5.5-4-4 5.5-.8Z" fill="#8b733c" stroke="none"/><path d="M24 17v12" stroke="#fff0bd" stroke-width="2"/>',
  shield: '<path d="m32 7 22 9v17c0 12-9 19-22 25C19 52 10 45 10 33V16Z" fill="#536c6a" stroke="#a9c9bd" stroke-width="1.5"/><path d="m32 14 15 6v13c0 8-6 14-15 18-9-4-15-10-15-18V20Z" stroke="#a9c9bd"/><path d="m23 32 6 6 13-14" stroke="#f0ce78" stroke-width="3"/>',
  streak: '<path d="M35 6c3 15-10 19-6 28 5-2 8-6 8-11 11 9 15 15 13 23-3 13-26 17-34 4C5 31 28 25 35 6Z" fill="#ca9269" stroke="#efd0a8" stroke-width="1.5"/><path d="M32 33c1 9-8 11-6 18 2 7 13 5 14-2 1-6-4-10-8-16Z" fill="#f0ce78" stroke="none"/>',
};
export function TrophyIllustration({ kind = 'cup', size = 48 }: { kind?: keyof typeof artwork; size?: number }) {
  return <SvgXml width={size} height={size} accessible={false} testID={`trophy-art-${kind}`}
    xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke-linecap="round" stroke-linejoin="round">${artwork[kind]}</g></svg>`} />;
}
