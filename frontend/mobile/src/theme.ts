import { Platform, TextStyle, ViewStyle } from 'react-native';

export const colors = {
  primary: '#2858D8',
  primaryLight: '#5B8DEF',
  primaryDeep: '#1E45B8',
  primarySoft: '#E9EEFC',
  primaryTint: '#EEF4FF',
  gold: '#C8860A',
  goldBright: '#E0A21F',
  goldSoft: '#FFF4D6',
  red: '#E0504F',
  redSoft: '#FFEEEE',
  green: '#2E9E4F',
  greenSoft: '#EAF7EE',
  purple: '#7A5AF0',
  purpleSoft: '#F1EDFF',
  orange: '#F4801F',
  ink: '#1B2B40',
  text: '#1B2B40',
  muted: '#5A6675',
  faint: '#9AA3AD',
  disabled: '#B4BBC3',
  border: '#E4E9F6',
  bg: '#F3F6FD',
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

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };

export const shadow = (level: 1 | 2 | 3 = 1): ViewStyle =>
  Platform.select<ViewStyle>({
    web: {
      boxShadow:
        level === 1
          ? '0 1px 3px rgba(27,43,64,0.06)'
          : level === 2
            ? '0 6px 18px rgba(40,88,216,0.10)'
            : '0 10px 28px rgba(40,88,216,0.22)',
    } as ViewStyle,
    default: {
      shadowColor: level === 3 ? colors.primary : '#1B2B40',
      shadowOpacity: level === 1 ? 0.06 : level === 2 ? 0.1 : 0.25,
      shadowRadius: level === 1 ? 4 : level === 2 ? 12 : 18,
      shadowOffset: { width: 0, height: level === 1 ? 1 : 6 },
      elevation: level * 2,
    },
  })!;

export const type: Record<string, TextStyle> = {
  h1: { fontFamily: font.extrabold, fontSize: 26, color: colors.ink, letterSpacing: -0.4 },
  h2: { fontFamily: font.bold, fontSize: 20, color: colors.ink, letterSpacing: -0.2 },
  h3: { fontFamily: font.bold, fontSize: 16, color: colors.ink },
  body: { fontFamily: font.medium, fontSize: 14, color: colors.ink },
  small: { fontFamily: font.medium, fontSize: 12, color: colors.muted },
  tiny: { fontFamily: font.medium, fontSize: 10.5, color: colors.faint },
};

/** Soft tile colours used for product/staff initials (bg, fg) — taken from the prototype. */
export const tilePalette: [string, string][] = [
  ['#EAF6FF', '#2858D8'],
  ['#FFF4D6', '#C8860A'],
  ['#E9EEFC', '#2E9E4F'],
  ['#FFF8E6', '#E0A21F'],
  ['#FFEEEE', '#E0504F'],
  ['#EEF8E8', '#2E9E4F'],
  ['#F1EDFF', '#7A5AF0'],
];
