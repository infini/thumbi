import { Platform } from 'react-native';

export const palette = {
  background: '#FFF8F4',
  backgroundAccent: '#EEF6FF',
  panel: 'rgba(255, 255, 255, 0.76)',
  panelStrong: '#FFFFFF',
  border: 'rgba(82, 92, 122, 0.14)',
  text: '#253046',
  textMuted: '#71809A',
  textSoft: '#94A1B4',
  rise: '#FF5D70',
  riseSoft: '#FFE7EB',
  riseGlow: '#FFC9D1',
  fall: '#5DA8FF',
  fallSoft: '#E7F1FF',
  fallGlow: '#CFE1FF',
  cream: '#FFF3D9',
  sun: '#FFD46C',
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
