import { SvgXml } from 'react-native-svg';

const ART = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <path d="m7 72 39-16 43 15-40 18Z" fill="#293f3b"/>
  <path d="m19 36 29-12 29 12v37L48 85 19 73Z" fill="#557b72" stroke="#bdd4c9" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="m19 36 29 12 29-12M48 48v37" fill="none" stroke="#bdd4c9" stroke-width="1.5"/>
  <path d="m27 47 12 5v12l-12-5Z" fill="#dbdfc7"/>
  <path d="m56 52 13-5v12l-13 5Z" fill="#9ecac6"/>
  <path d="m29 65 9 4v11l-9-4Z" fill="#243d38"/>
  <path d="m57 68 11-5v8l-11 5Z" fill="#d5bd8b"/>
  <path d="M79 26c0 12-14 23-14 23S51 38 51 26a14 14 0 1 1 28 0Z" fill="#e7cb85" stroke="#f0e2bc" stroke-width="1.5"/>
  <circle cx="65" cy="26" r="5" fill="#384c48"/>
  <path d="m26 32 14 6m-15-10-2 7m20-1-2 7" fill="none" stroke="#eee5d2" stroke-width="4" stroke-linecap="round"/>
</svg>`;

export function GymLocationIllustration({ size = 56 }: { size?: number }) {
  return <SvgXml xml={ART} width={size} height={size} accessible={false} />;
}
