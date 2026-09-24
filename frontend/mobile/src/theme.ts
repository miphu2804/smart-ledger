import { Platform, TextStyle, ViewStyle } from 'react-native';

export const colors = {
  // Green is the single action accent; darker green is used for readable text/icons.
  accent: '#8FDB6E',
  accentHover: '#7CC85C',
  accentInk: '#16350C',
  primary: '#2F6B1F',
  primaryLight: '#7CC85C',
  primaryDeep: '#16350C',
  primarySoft: '#E7F6DC',
  primaryTint: '#F3FAEF',
  gold: '#8A5A12',
  goldBright: '#C88A2D',
  goldSoft: '#F8E9C8',
  red: '#9B2C1F',
  redSoft: '#F8D9D4',
  green: '#2F6B1F',
  greenSoft: '#E7F6DC',
  purple: '#2157A4',
  purpleSoft: '#E4F0FF',
  orange: '#2F6B1F',
  ink: '#1A1916',
  text: '#1A1916',
  muted: '#6B675E',
  faint: '#756F65',
  disabled: '#B5B0A6',
  border: '#E8E4DC',
  bg: '#F7F6F2',
  card: '#FFFFFF',
  white: '#FFFFFF',
};

export const font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 20, pill: 999 };

export const shadow = (level: 1 | 2 | 3 = 1): ViewStyle =>
  Platform.select<ViewStyle>({
    web: {
      boxShadow:
        level === 1
          ? '0 1px 3px rgba(42,41,38,0.025), 0 8px 18px rgba(42,41,38,0.045)'
          : level === 2
            ? '0 3px 9px rgba(42,41,38,0.08)'
            : '0 5px 12px rgba(26,25,22,0.10)',
    } as ViewStyle,
    default: {
      shadowColor: '#2A2926',
      shadowOpacity: level === 1 ? 0.045 : level === 2 ? 0.08 : 0.1,
      shadowRadius: level === 1 ? 10 : level === 2 ? 9 : 12,
      shadowOffset: { width: 0, height: level === 1 ? 4 : level === 2 ? 3 : 5 },
      elevation: level === 1 ? 1 : level === 2 ? 3 : 4,
    },
  })!;

export const type: Record<string, TextStyle> = {
  h1: { fontFamily: font.extrabold, fontSize: 30, color: colors.ink, letterSpacing: -0.5 },
  h2: { fontFamily: font.bold, fontSize: 21, color: colors.ink, letterSpacing: -0.25 },
  h3: { fontFamily: font.bold, fontSize: 17, color: colors.ink },
  body: { fontFamily: font.medium, fontSize: 14, color: colors.ink },
  small: { fontFamily: font.medium, fontSize: 12, color: colors.muted },
  tiny: { fontFamily: font.medium, fontSize: 12, color: colors.faint },
};

/** Warm, low-contrast surfaces for product and profile initials. */
export const tilePalette: [string, string][] = [
  ['#EFEDE7', '#4B463F'],
  ['#F8E9C8', '#78510C'],
  ['#E8E6DD', '#4D5148'],
  ['#EFF2E7', '#45513E'],
  ['#F8E2DE', '#862B20'],
  ['#EAF1E1', '#355A25'],
  ['#EEE9DF', '#514B3F'],
];
