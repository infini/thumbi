import { Platform, type ColorSchemeName } from 'react-native';

export const lightPalette = {
  background: '#F3F6F5',
  backgroundAccent: '#E8F5F2',
  panel: 'rgba(255, 255, 255, 0.82)',
  panelStrong: '#FFFFFF',
  border: 'rgba(12, 18, 16, 0.10)',
  text: '#111716',
  textMuted: '#65716D',
  textSoft: '#8E9A96',
  brand: '#67D8CC',
  brandSoft: '#DFF8F4',
  brandGlow: '#BFEDE6',
  rise: '#67D8CC',
  riseSoft: '#DFF8F4',
  riseGlow: '#C7F4EC',
  fall: '#5E9BD2',
  fallSoft: '#E6F0FA',
  fallGlow: '#D7E5F4',
  cream: '#E6ECEA',
  sun: '#8FE6DB',
} as const;

export const darkPalette = {
  background: '#0B1110',
  backgroundAccent: '#111918',
  panel: 'rgba(18, 25, 24, 0.90)',
  panelStrong: '#151D1B',
  border: 'rgba(223, 248, 244, 0.10)',
  text: '#EDF7F3',
  textMuted: '#9EB4AD',
  textSoft: '#768882',
  brand: '#67D8CC',
  brandSoft: 'rgba(103, 216, 204, 0.18)',
  brandGlow: 'rgba(103, 216, 204, 0.22)',
  rise: '#67D8CC',
  riseSoft: 'rgba(103, 216, 204, 0.18)',
  riseGlow: 'rgba(103, 216, 204, 0.22)',
  fall: '#7FB2E2',
  fallSoft: 'rgba(127, 178, 226, 0.20)',
  fallGlow: 'rgba(127, 178, 226, 0.22)',
  cream: '#1A2321',
  sun: '#8FE6DB',
} as const;

export type Palette = typeof lightPalette | typeof darkPalette;

export function getPalette(colorScheme: ColorSchemeName): Palette {
  return colorScheme === 'dark' ? darkPalette : lightPalette;
}

export const fonts = {
  display: Platform.select({
    ios: 'Avenir Next',
    android: 'sans-serif-medium',
    default: 'System',
  }),
  body: Platform.select({
    ios: 'Avenir Next',
    android: 'sans-serif',
    default: 'System',
  }),
} as const;
