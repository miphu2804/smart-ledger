import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Image,
  ImageSourcePropType,
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
import { spring, useReducedMotion } from '../motion';
import { colors, font, radius, shadow, tilePalette } from '../theme';

export type IconName = React.ComponentProps<typeof Feather>['name'];

function usePressScale(pressedValue: number) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (toValue: number) => {
    if (reducedMotion) {
      scale.setValue(toValue);
      return;
    }
    Animated.spring(scale, { toValue, ...spring.snappy, useNativeDriver: true }).start();
  };
  return { scale, pressIn: () => animate(pressedValue), pressOut: () => animate(1) };
}

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
  const press = usePressScale(0.88);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.pressIn}
      onPressOut={press.pressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={Math.max(6, (44 - size) / 2)}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' },
        bg === colors.white && shadow(0),
        pressed && { opacity: 0.78 },
      ]}
    >
      <Animated.View style={{ transform: [{ scale: press.scale }] }}>
        <Feather name={name} size={size * 0.47} color={color} />
      </Animated.View>
      {dot ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------- Card
export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  if (onPress)
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.card, style, pressed && styles.cardPressed]}
      >
        {children}
      </Pressable>
    );
  return <View style={[styles.card, style]}>{children}</View>;
}

// ---------------------------------------------------------------- ActionCard
export interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: 'chevron' | React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
}

export function ActionCard({
  icon,
  title,
  subtitle,
  trailing = 'chevron',
  onPress,
  style,
  dark,
}: ActionCardProps) {
  const press = usePressScale(0.96);

  const content = (
    <>
      <View style={[styles.actionCardIconBox, dark && styles.actionCardIconBoxDark]}>
        {icon}
      </View>
      <View style={styles.actionCardBody}>
        <T
          w="semibold"
          size={15}
          color={dark ? colors.white : colors.ink}
          numberOfLines={1}
        >
          {title}
        </T>
        {subtitle ? (
          <T
            size={12}
            color={dark ? '#A3A099' : colors.muted}
            numberOfLines={1}
            style={{ marginTop: 2 }}
          >
            {subtitle}
          </T>
        ) : null}
      </View>
      {trailing === 'chevron' ? (
        <Feather
          name="chevron-right"
          size={16}
          color={dark ? '#75726B' : colors.disabled}
        />
      ) : (
        trailing
      )}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={press.pressIn}
        onPressOut={press.pressOut}
        accessibilityRole="button"
        accessibilityLabel={title + (subtitle ? ` · ${subtitle}` : '')}
        style={({ pressed }) => [
          styles.actionCard,
          dark && styles.actionCardDark,
          style,
          pressed && { opacity: 0.88 },
        ]}
      >
        <Animated.View style={[styles.actionCardInner, { transform: [{ scale: press.scale }] }]}>
          {content}
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.actionCard, dark && styles.actionCardDark, style]}>
      <View style={styles.actionCardInner}>{content}</View>
    </View>
  );
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
  onPressIn,
  onPressOut,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  variant?: BtnVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const v = btnVariants[variant];
  const emphasized = variant === 'primary' || variant === 'danger' || variant === 'voice';
  const press = usePressScale(emphasized ? 0.94 : 0.975);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        press.pressIn();
        onPressIn?.();
      }}
      onPressOut={() => {
        press.pressOut();
        onPressOut?.();
      }}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.btn,
        small && { height: 44, paddingHorizontal: 14, borderRadius: 12 },
        { backgroundColor: v.bg, borderColor: v.border ?? v.bg },
        (variant === 'primary' || variant === 'gold' || variant === 'voice') && !disabled && shadow(3),
        disabled && { backgroundColor: '#EEEBE4', borderColor: '#EEEBE4' },
        pressed && (variant === 'ghost' ? { opacity: 0.62 } : { opacity: emphasized ? 0.96 : 0.88 }),
        style,
      ]}
    >
      <Animated.View style={[styles.buttonContent, { transform: [{ scale: press.scale }] }]}>
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
      </Animated.View>
    </Pressable>
  );
}

const btnVariants: Record<BtnVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.brand, fg: colors.brandInk },
  gold: { bg: colors.brand, fg: colors.brandInk },
  voice: { bg: colors.brand, fg: colors.brandInk },
  outline: { bg: colors.white, fg: colors.ink, border: colors.border },
  soft: { bg: colors.brandSoft, fg: colors.brand },
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
  options: { key: K; label: string; icon?: IconName }[];
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
        style={({ pressed }) => [
          styles.chip,
          active ? styles.chipActive : null,
          pressed && { opacity: 0.76, transform: [{ scale: 0.98 }] },
        ]}
      >
        {o.icon ? <Feather name={o.icon} size={15} color={active ? colors.brand : colors.muted} /> : null}
        <T w={active ? 'bold' : 'semibold'} size={14} color={active ? colors.brand : colors.muted}>
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
  color = colors.data.revenue,
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
  onFocus,
  onBlur,
  secureTextEntry,
  onChangeText,
  ...rest
}: TextInputProps & { label?: string; error?: string; prefix?: string; inputStyle?: StyleProp<TextStyle> }) {
  const [focused, setFocused] = useState(false);
  // Ô mật khẩu có nút hiện/ẩn ký tự.
  const [revealed, setRevealed] = useState(false);
  // iOS xoá sạch chữ cũ ở lần sửa đầu tiên sau khi quay lại một ô đang che chữ (gõ hay xoá 1 ký tự đều mất cả chuỗi).
  // Đánh dấu lần sửa đó để dựng lại giá trị đúng thay vì để mất mật khẩu đã nhập.
  const firstEditAfterReenter = useRef(false);
  const handleChangeText = (text: string) => {
    let next = text;
    if (Platform.OS === 'ios' && secureTextEntry && !revealed && firstEditAfterReenter.current) {
      const previous = typeof rest.value === 'string' ? rest.value : '';
      // Một lần bấm phím chỉ đổi độ dài tối đa 1; mất từ 2 ký tự trở lên rồi còn lại 0-1 ký tự là do hệ thống xoá sạch.
      if (previous.length - text.length >= 2 && text.length <= 1) {
        next = text === '' ? previous.slice(0, -1) : previous + text;
      }
    }
    firstEditAfterReenter.current = false;
    onChangeText?.(next);
  };
  const toggleReveal = () => {
    // Che lại chữ cũng làm iOS xoá ở lần sửa kế tiếp
    if (revealed) firstEditAfterReenter.current = true;
    setRevealed(!revealed);
  };
  return (
    <View style={[{ marginBottom: 12 }, style as StyleProp<ViewStyle>]}>
      {label ? (
        <T w="semibold" size={12} color={colors.muted} style={{ marginBottom: 6 }}>
          {label}
        </T>
      ) : null}
      <View style={[styles.inputWrap, focused && styles.inputFocused, error ? { borderColor: colors.red } : null]}>
        {prefix ? (
          <T w="bold" size={15} style={{ marginRight: 8 }}>
            {prefix}
          </T>
        ) : null}
        <TextInput
          placeholderTextColor={colors.faint}
          style={[styles.input, inputStyle]}
          onFocus={(event) => {
            setFocused(true);
            firstEditAfterReenter.current = true;
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...rest}
          secureTextEntry={secureTextEntry && !revealed}
          onChangeText={handleChangeText}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={toggleReveal}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            style={({ pressed }) => [{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 }, pressed && { opacity: 0.6 }]}
          >
            <Feather name={revealed ? 'eye-off' : 'eye'} size={18} color={colors.muted} />
          </Pressable>
        ) : null}
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
  const reducedMotion = useReducedMotion();
  const thumbX = useRef(new Animated.Value(value ? 18 : 0)).current;
  useEffect(() => {
    if (reducedMotion) {
      thumbX.setValue(value ? 18 : 0);
      return;
    }
    Animated.spring(thumbX, { toValue: value ? 18 : 0, ...spring.snappy, useNativeDriver: true }).start();
  }, [reducedMotion, thumbX, value]);
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={({ pressed }) => [{ width: 52, height: 44, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.78 }]}
    >
      <View style={{ width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: value ? colors.brand : '#D5D0C7' }}>
        <Animated.View
          style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white, transform: [{ translateX: thumbX }], ...shadow(0) }}
        />
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
        bg={colors.neutralControl}
        color={value <= 1 ? colors.red : colors.ink}
        onPress={() => onChange(Math.max(min, value - 1))}
      />
      <View style={styles.stepperValue}>
        <T w="bold" size={15} style={{ textAlign: 'center' }}>
          {value}
        </T>
      </View>
      <IconBtn name="plus" size={30} bg={colors.neutralControl} color={colors.ink} onPress={() => onChange(value + 1)} />
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
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} accessibilityViewIsModal>
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
  icon = 'help-circle',
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
        <View style={styles.dialog} accessibilityViewIsModal>
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
            <Button title={confirm} variant={danger ? 'danger' : 'primary'} onPress={onConfirm} style={{ flex: 1 }} small />
          </Row>
        </View>
      </View>
    </Modal>
  );
}

export function LoadingState({ label = 'Đang tải…', compact = false }: { label?: string; compact?: boolean }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: compact ? 24 : 56 }}>
      <ActivityIndicator color={colors.primary} />
      <T size={12} color={colors.muted} style={{ marginTop: 10 }}>
        {label}
      </T>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  tone,
}: {
  icon: IconName;
  title: string;
  hint?: string;
  tone?: 'neutral' | 'warning' | 'error' | 'success';
}) {
  const resolvedTone = tone ?? (icon === 'alert-triangle' ? 'error' : 'neutral');
  const palette =
    resolvedTone === 'error'
      ? { fg: colors.red, bg: colors.redSoft }
      : resolvedTone === 'warning'
        ? { fg: colors.gold, bg: colors.goldSoft }
        : resolvedTone === 'success'
          ? { fg: colors.green, bg: colors.greenSoft }
          : { fg: colors.primary, bg: colors.primarySoft };
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          backgroundColor: palette.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={28} color={palette.fg} />
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
  image,
  iconColor = colors.primary,
  iconBg = colors.primarySoft,
  title,
  subtitle,
  right,
  onPress,
  last,
}: {
  icon?: IconName;
  image?: ImageSourcePropType;
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
      style={({ pressed }) => [styles.listRow, !last && styles.listRowBorder, pressed && styles.listRowPressed]}
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
        {image ? (
          <Image source={image} style={{ width: 25, height: 25 }} resizeMode="contain" />
        ) : icon ? (
          <Feather name={icon} size={17} color={iconColor} />
        ) : null}
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
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadow(0),
  },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.992 }] },
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
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.brandSoft,
    borderColor: '#D8CDF8',
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
  inputFocused: { borderColor: colors.brand, backgroundColor: colors.white },
  input: { flex: 1, fontFamily: font.medium, fontSize: 15, color: colors.ink, height: '100%', outlineStyle: 'none' } as never,
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(26,25,22,0.44)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: '88%',
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 },
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
  listRowPressed: { opacity: 0.76, transform: [{ scale: 0.995 }] },
  actionCard: {
    minHeight: 74,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    ...shadow(0),
  },
  stepperValue: {
    minWidth: 32,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  actionCardDark: {
    backgroundColor: '#161616',
    borderColor: '#262626',
  },
  actionCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionCardIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardIconBoxDark: {
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: '#303030',
  },
  actionCardBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
});
