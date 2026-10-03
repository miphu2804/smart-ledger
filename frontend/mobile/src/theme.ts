import { Platform, TextStyle, ViewStyle } from 'react-native';

export const colors = {
  // Brand balance: purple for overview identity, charcoal for primary actions, green for helpful accents.
  brand: '#482AAC',
  brandPressed: '#3A218E',
  brandSoft: '#EFEAFF',
  brandTint: '#F8F5FF',
  brandInk: '#FFFFFF',
  accent: '#8FDB6E',
  accentHover: '#7CC85C',
  accentInk: '#16350C',
  primary: '#262522',
  primaryLight: '#4A4740',
  primaryDeep: '#1A1916',
  primarySoft: '#F1EFEA',
  primaryTint: '#FAF9F6',
  neutralControl: '#E6E2DA',
  neutralControlPressed: '#D8D3C9',
  gold: '#8A5A12',
  goldBright: '#C88A2D',
  goldSoft: '#F8E9C8',
  red: '#9B2C1F',
  redSoft: '#F8D9D4',
  green: '#2F6B1F',
  greenSoft: '#E7F6DC',
  purple: '#482AAC',
  purpleSoft: '#EFEAFF',
  orange: '#8A5A12',
  ink: '#1A1916',
  text: '#1A1916',
  muted: '#6B675E',
  faint: '#756F65',
  disabled: '#B5B0A6',
  border: '#E8E4DC',
  bg: '#F7F6F2',
  card: '#FFFFFF',
  white: '#FFFFFF',
  data: {
    revenue: '#2F8F46',
    revenueSoft: '#E7F6DC',
    expense: '#C45A37',
    expenseSoft: '#FBE6DD',
    order: '#2F6FDB',
    orderSoft: '#E7EFFF',
    profit: '#482AAC',
    profitSoft: '#EFEAFF',
    customer: '#138B9E',
    customerSoft: '#DFF5F7',
    product: '#B7791F',
    productSoft: '#F8E9C8',
    debt: '#8A5A12',
    debtSoft: '#F8E9C8',
    stock: '#9B2C1F',
    stockSoft: '#F8D9D4',
  },
};

export const font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 20, pill: 999 };

export const shadow = (level: 0 | 1 | 2 | 3 = 1): ViewStyle =>
  Platform.select<ViewStyle>({
    web: {
      boxShadow:
        level === 0
          ? '0 1px 3px rgba(42,41,38,0.06)'
          : level === 1
          ? '0 1px 2px rgba(42,41,38,0.07)'
          : level === 2
            ? '0 3px 9px rgba(42,41,38,0.12)'
            : '0 6px 16px rgba(26,25,22,0.16)',
    } as ViewStyle,
    default: {
      shadowColor: '#2A2926',
      shadowOpacity: level === 0 ? 0.04 : level === 1 ? 0.06 : level === 2 ? 0.13 : 0.16,
      shadowRadius: level === 0 ? 2 : level === 1 ? 2 : level === 2 ? 10 : 14,
      shadowOffset: { width: 0, height: level <= 1 ? 1 : level === 2 ? 5 : 7 },
      elevation: level === 0 ? 0 : level === 1 ? 1 : level === 2 ? 4 : 6,
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
