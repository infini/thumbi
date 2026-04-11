import { Platform } from 'react-native';

export const palette = {
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
