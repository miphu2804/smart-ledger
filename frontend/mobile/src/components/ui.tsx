import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { abbr, hashIndex } from '../lib/format';
import { colors, font, radius, shadow, tilePalette } from '../theme';

export type IconName = React.ComponentProps<typeof Feather>['name'];

// ---------------------------------------------------------------- Text
type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';
export function T({
  w = 'medium',
  size = 14,
  color = colors.ink,
  style,
  ...rest
}: TextProps & { w?: Weight; size?: number; color?: string }) {
  return <Text {...rest} style={[{ fontFamily: font[w], fontSize: size, color }, style]} />;
}

// ---------------------------------------------------------------- Screen
export function Screen({
  children,
  scroll = true,
  bg = colors.bg,
  padded = true,
  footer,
  overlay,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  bg?: string;
  padded?: boolean;
  footer?: React.ReactNode;
  /** phần tử nổi (FAB…) đặt trên nội dung cuộn */
  overlay?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const pad = padded ? { paddingHorizontal: 16 } : null;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ height: insets.top, backgroundColor: bg }} />
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[pad, { paddingBottom: 28 }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
      {overlay}
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------- Header
export function Header({
  title,
  subtitle,
  back = true,
  right,
  onBack,
  big,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  onBack?: () => void;
  big?: boolean;
}) {
  return (
    <View style={styles.header}>
      {back ? (
        <IconBtn
          name="chevron-left"
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)')))}
          label="Quay lại"
        />
      ) : null}
      <View style={{ flex: 1, marginLeft: back ? 10 : 0 }}>
        <T w={big ? 'extrabold' : 'bold'} size={big ? 26 : 18} numberOfLines={1}>
          {title}
        </T>
        {subtitle ? (
          <T size={12} color={colors.faint} numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function IconBtn({
  name,
  onPress,
  color = colors.ink,
  bg = colors.white,
  size = 44,
  label,
  dot,
}: {
  name: IconName;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
  label?: string;
  dot?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={Math.max(6, (44 - size) / 2)}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' },
        bg === colors.white && shadow(1),
        pressed && { opacity: 0.7 },
      ]}
    >
      <Feather name={name} size={size * 0.47} color={color} />
      {dot ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------- Card
export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (onPress)
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.85 }]}
      >
        {children}
      </Pressable>
    );
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 10 }}>
      <T w="bold" size={16} style={{ flex: 1 }}>
        {title}
      </T>
      {action ? (
        <Pressable onPress={onAction} accessibilityRole="button" style={styles.sectionAction}>
          <T w="semibold" size={14} color={colors.primary}>
            {action}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- Button
type BtnVariant = 'primary' | 'gold' | 'outline' | 'soft' | 'ghost' | 'danger' | 'green' | 'voice';
export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  variant?: BtnVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const v = btnVariants[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.btn,
        small && { height: 44, paddingHorizontal: 14, borderRadius: 12 },
        { backgroundColor: v.bg, borderColor: v.border ?? v.bg },
        (variant === 'primary' || variant === 'gold' || variant === 'voice') && !disabled && shadow(3),
        disabled && { backgroundColor: '#EEEBE4', borderColor: '#EEEBE4' },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon ? (
            <Feather name={icon} size={small ? 15 : 18} color={disabled ? colors.disabled : v.fg} style={{ marginRight: 8 }} />
          ) : null}
          <T w="bold" size={small ? 14 : 15} color={disabled ? colors.disabled : v.fg}>
            {title}
          </T>
        </>
      )}
    </Pressable>
  );
}

const btnVariants: Record<BtnVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.ink, fg: colors.white },
  gold: { bg: colors.ink, fg: colors.white },
  voice: { bg: colors.ink, fg: colors.white },
  outline: { bg: colors.white, fg: colors.ink, border: colors.border },
  soft: { bg: colors.primarySoft, fg: colors.primary },
  ghost: { bg: 'transparent', fg: colors.muted },
  danger: { bg: colors.redSoft, fg: colors.red },
  green: { bg: colors.greenSoft, fg: colors.green, border: '#C9E4B9' },
};

// ---------------------------------------------------------------- Chips / Segmented
export function Chips<K extends string>({
  options,
  value,
  onChange,
  scroll = true,
  style,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const content = options.map((o) => {
    const active = o.key === value;
    return (
      <Pressable
        key={o.key}
        onPress={() => onChange(o.key)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={[styles.chip, active ? { backgroundColor: colors.accent, borderColor: colors.accent } : null]}
      >
        <T w={active ? 'bold' : 'semibold'} size={14} color={active ? colors.accentInk : colors.muted}>
          {o.label}
        </T>
      </Pressable>
    );
  });
  if (!scroll) return <View style={[{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, style]}>{content}</View>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[{ flexGrow: 0 }, style]}
      contentContainerStyle={{ gap: 8 }}
    >
      {content}
    </ScrollView>
  );
}

// ---------------------------------------------------------------- Tile / Badge / Progress
export function Tile({
  name,
  size = 40,
  text,
  palette,
}: {
  name: string;
  size?: number;
  text?: string;
  palette?: [string, string];
}) {
  const [bg, fg] = palette ?? tilePalette[hashIndex(name, tilePalette.length)];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <T w="extrabold" size={size * 0.36} color={fg}>
        {text ?? abbr(name)}
      </T>
    </View>
  );
}

export function Badge({
  text,
  color = colors.primary,
  bg = colors.primarySoft,
  icon,
}: {
  text: string;
  color?: string;
  bg?: string;
  icon?: IconName;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: bg,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 6,
        alignSelf: 'flex-start',
      }}
    >
      {icon ? <Feather name={icon} size={10} color={color} style={{ marginRight: 3 }} /> : null}
      <T w="bold" size={12} color={color}>
        {text}
      </T>
    </View>
  );
}

export function Progress({
  value,
  color = colors.primary,
  track = colors.primarySoft,
  height = 6,
}: {
  value: number;
  color?: string;
  track?: string;
  height?: number;
}) {
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}>
      <View
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height, borderRadius: height, backgroundColor: color }}
      />
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: colors.border }, style]} />;
}

export function Row({ children, style, gap = 10 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

// ---------------------------------------------------------------- Inputs
export function Field({
  label,
  error,
  prefix,
  style,
  inputStyle,
  ...rest
}: TextInputProps & { label?: string; error?: string; prefix?: string; inputStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={[{ marginBottom: 12 }, style as StyleProp<ViewStyle>]}>
      {label ? (
        <T w="semibold" size={12} color={colors.muted} style={{ marginBottom: 6 }}>
          {label}
        </T>
      ) : null}
      <View style={[styles.inputWrap, error ? { borderColor: colors.red } : null]}>
        {prefix ? (
          <T w="bold" size={15} style={{ marginRight: 8 }}>
            {prefix}
          </T>
        ) : null}
        <TextInput placeholderTextColor={colors.faint} style={[styles.input, inputStyle]} {...rest} />
      </View>
      {error ? (
        <T size={12} color={colors.red} style={{ marginTop: 4 }}>
          {error}
        </T>
      ) : null}
    </View>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: value ? colors.primary : '#D5D0C7' }}>
        <View style={[{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white }, value && { marginLeft: 18 }]} />
      </View>
    </Pressable>
  );
}

export function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <Row gap={6}>
      <IconBtn
        name={value <= min + 1 && min === 0 ? 'trash-2' : 'minus'}
        size={30}
        bg={colors.primarySoft}
        color={value <= 1 ? colors.red : colors.primary}
        onPress={() => onChange(Math.max(min, value - 1))}
      />
      <T w="bold" size={15} style={{ minWidth: 22, textAlign: 'center' }}>
        {value}
      </T>
      <IconBtn name="plus" size={30} bg={colors.primary} color={colors.white} onPress={() => onChange(value + 1)} />
    </Row>
  );
}

// ---------------------------------------------------------------- Sheet / Dialog
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Đóng" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.grabber} />
          {title ? (
            <Row style={{ marginBottom: 14 }}>
              <T w="bold" size={18} style={{ flex: 1 }}>
                {title}
              </T>
              <IconBtn name="x" size={32} bg={colors.bg} onPress={onClose} label="Đóng" />
            </Row>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Dialog({
  visible,
  icon = 'zap',
  title,
  message,
  confirm = 'Đồng ý',
  cancel = 'Không',
  onConfirm,
  onCancel,
  danger,
  children,
}: {
  visible: boolean;
  icon?: IconName;
  title: string;
  message?: string;
  confirm?: string;
  cancel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.backdrop, { justifyContent: 'center', padding: 24 }]}>
        <View style={styles.dialog}>
          <View style={[styles.dialogIcon, danger && { backgroundColor: colors.red }]}>
            <Feather name={icon} size={20} color={colors.white} />
          </View>
          <T w="bold" size={18} style={{ marginTop: 14 }}>
            {title}
          </T>
          {message ? (
            <T size={13} color={colors.muted} style={{ marginTop: 6, lineHeight: 19 }}>
              {message}
            </T>
          ) : null}
          {children}
          <Row style={{ marginTop: 18 }}>
            <Button title={cancel} variant="outline" onPress={onCancel} style={{ flex: 1 }} small />
            <Button title={confirm} variant={danger ? 'voice' : 'primary'} onPress={onConfirm} style={{ flex: 1 }} small />
          </Row>
        </View>
      </View>
    </Modal>
  );
}

export function EmptyState({ icon, title, hint }: { icon: IconName; title: string; hint?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={28} color={colors.primary} />
      </View>
      <T w="bold" size={15} style={{ marginTop: 12 }}>
        {title}
      </T>
      {hint ? (
        <T size={12} color={colors.faint} style={{ marginTop: 4, textAlign: 'center' }}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function ListRow({
  icon,
  iconColor = colors.primary,
  iconBg = colors.primarySoft,
  title,
  subtitle,
  right,
  onPress,
  last,
}: {
  icon: IconName;
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, !last && styles.listRowBorder, pressed && { opacity: 0.7 }]}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          backgroundColor: iconBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={17} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <T w="semibold" size={14}>
          {title}
        </T>
        {subtitle ? (
          <T size={12} color={colors.faint}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
      {onPress ? <Feather name="chevron-right" size={18} color={colors.disabled} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 10, paddingBottom: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadow(1),
  },
  sectionAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  btn: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
  },
  input: { flex: 1, fontFamily: font.medium, fontSize: 15, color: colors.ink, height: '100%', outlineStyle: 'none' } as never,
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,25,45,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: '88%',
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D5DBE5', marginBottom: 14 },
  dialog: { backgroundColor: colors.white, borderRadius: 24, padding: 20, width: '100%', maxWidth: 380, alignSelf: 'center' },
  dialogIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.red,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
