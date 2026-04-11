import { Platform } from 'react-native';

export const palette = {
  background: '#FFF8EF',
  backgroundAccent: '#EEF6FF',
  panel: 'rgba(255, 255, 255, 0.76)',
  panelStrong: '#FFFFFF',
  border: 'rgba(82, 92, 122, 0.14)',
  text: '#253046',
  textMuted: '#71809A',
  textSoft: '#94A1B4',
  positive: '#5CBC84',
  positiveSoft: '#E2F8EA',
  negative: '#EB8E79',
  negativeSoft: '#FFE7DF',
  peach: '#FFD8C6',
  mint: '#CBF1DA',
  sky: '#DCEBFF',
  cream: '#FFF3D9',
  gold: '#FFBE6D',
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
