import { SvgXml } from 'react-native-svg';

/** Small editorial illustrations for the two accountability views. */
export function AccountabilityViewArt({ kind, size = 30 }: { kind: 'day' | 'partner'; size?: number }) {
  const art = kind === 'day'
    ? '<rect x="7" y="9" width="33" height="34" rx="6" fill="#536c6a" stroke="#b8cec2"/><path d="M7 19h33M16 6v8m15-8v8" stroke="#dbe4dd" stroke-width="2"/><circle cx="24" cy="30" r="7" fill="#f0ce78" stroke="none"/><path d="m21 30 2 2 4-5" stroke="#536c6a" stroke-width="2"/>'
    : '<rect x="5" y="15" width="25" height="28" rx="7" fill="#536c6a" stroke="#b8cec2"/><rect x="20" y="6" width="24" height="29" rx="7" fill="#716580" stroke="#c8badb"/><circle cx="32" cy="16" r="4" fill="#f0ce78" stroke="none"/><path d="M25 27c0-7 14-7 14 0" stroke="#f0ce78" stroke-width="2"/><circle cx="16" cy="25" r="3" fill="#e2e9e0" stroke="none"/><path d="M11 35c0-6 10-6 10 0" stroke="#e2e9e0" stroke-width="2"/>';
  return <SvgXml width={size} height={size} accessible={false}
    xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><g fill="none" stroke-linecap="round" stroke-linejoin="round">${art}</g></svg>`} />;
}
