/**
 * BarcodeScannerModal — POS di động
 *
 * Quy trình quét & quản lý đơn hàng:
 *  1. Khi nhận diện thành công 1 sản phẩm mới:
 *     - Hiển thị POPUP THÔNG BÁO với thông tin sản phẩm, số lượng mặc định = 1, thành tiền.
 *     - Người dùng bấm số trên bàn phím (hoặc stepper +/-) để chọn số lượng mong muốn.
 *     - Bấm "Xác nhận" để lưu vào đơn hàng tạm (Phần 2).
 *  2. Khóa số lượng sau khi xác nhận:
 *     - Sau khi xác nhận, popup đóng lại và số lượng được KHÓA trong đơn hàng tạm.
 *     - Camera dù có quét lại sản phẩm đó thì cũng TỰ ĐỘNG BỎ QUA vì đã có trong đơn tempo.
 *  3. Chỉnh sửa số lượng:
 *     - Muốn thay đổi số lượng món nào, người dùng bấm vào sản phẩm đó trong đơn hàng tạm (Phần 2).
 *     - Popup mở lại với số lượng hiện tại để người dùng chỉnh sửa và xác nhận lại.
 *  4. Bố cục tối ưu:
 *     - Bàn phím số POS luôn hiển thị ở dưới cùng (Phần 1).
 *     - Phần 2 tóm tắt gọn gàng: Số món cạnh tổng tiền, nút "Thanh toán" cạnh nút "Xoá hết" (nhỏ hơn).
 *     - Vuốt sang trái để xoá từng món (swipe left to delete).
 *     - Camera (Phần 3) tràn viền qua tai thỏ, nút đổi cam & flash ở trên, âm thanh bíp POS 2000Hz, bounding box động.
 */
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import type { LineItem, ProductView } from '../data/types';
import {
  detectBarcodeFromSource,
  playScanSuccessSound,
  triggerScanHaptic,
} from '../lib/barcode';
import { productApi } from '../lib/catalogApi';
import { vnd } from '../lib/format';
import { colors, font, shadow } from '../theme';
import { T } from './ui';

// ─── Compact Apple-Style Lightning Flash SVG ────────────────────────────────
function FlashLightning({ active, scaleAnim }: { active: boolean; scaleAnim: Animated.Value }) {
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Svg width={18} height={24} viewBox="0 0 18 24" fill="none">
        <Path
          d="M10.5 1L2.5 13.5H9L7.5 23L15.5 10.5H9L10.5 1Z"
          stroke={active ? '#FFD600' : '#FFFFFF'}
          strokeWidth={active ? 1.5 : 1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill={active ? '#FFD600' : 'none'}
        />
      </Svg>
    </Animated.View>
  );
}

// ─── BarcodeIcon ────────────────────────────────────────────────────────────
export function BarcodeIcon({ size = 20, color = colors.primary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2"   y="4" width="2"   height="16" rx="0.5" fill={color} />
      <Rect x="6"   y="4" width="1.5" height="16" rx="0.5" fill={color} />
      <Rect x="9.5" y="4" width="3"   height="16" rx="0.5" fill={color} />
      <Rect x="14.5" y="4" width="1.5" height="16" rx="0.5" fill={color} />
      <Rect x="18"  y="4" width="2"   height="16" rx="0.5" fill={color} />
      <Rect x="21.5" y="4" width="1"  height="16" rx="0.5" fill={color} />
    </Svg>
  );
}

// ─── Props & Types ──────────────────────────────────────────────────────────
export interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  products?: ProductView[];
  cartItems?: LineItem[];
  onAddToCart?: (product: ProductView, delta: number) => void;
  onClearCart?: () => void;
  onCheckout?: () => void;
  onProductScanned?: (product: ProductView, barcode: string, qty: number) => void;
  onBarcodeScanned?: (barcode: string) => void;
  onProductCreated?: (product: ProductView) => void;
  mode?: 'order' | 'input';
}

interface BBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ProductPopupData {
  product: ProductView;
  barcode?: string;
  qty: number;
  isExisting: boolean; // true = sửa số lượng món cũ, false = mới quét nhận diện
}

export function BarcodeScannerModal({
  visible,
  onClose,
  products = [],
  cartItems: externalCartItems,
  onAddToCart,
  onClearCart,
  onCheckout,
  onProductScanned,
  onBarcodeScanned,
  onProductCreated,
  mode = 'order',
}: BarcodeScannerModalProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  // Camera settings
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [torch, setTorch]   = useState(false);

  // Animations (100% useNativeDriver: true)
  const flashScaleAnim  = useRef(new Animated.Value(1)).current;
  const rotateAnim      = useRef(new Animated.Value(0)).current;

  // Scan throttle & timer
  const lastCodeRef      = useRef('');
  const lastTimeRef      = useRef(0);
  const bboxTimerRef     = useRef<any>(null);

  // Bounding box của mã vạch đang được nhận diện
  const [detectedBbox, setDetectedBbox] = useState<BBox | null>(null);

  // Web camera refs
  const videoRef    = useRef<HTMLVideoElement | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const intervalRef = useRef<any>(null);

  // State nội bộ khi dùng standalone (không truyền externalCartItems)
  const [internalItems, setInternalItems] = useState<LineItem[]>([]);
  const [unknownCode, setUnknownCode]     = useState<string | null>(null);

  // POPUP cấu hình số lượng & xác nhận sản phẩm
  const [popupProduct, setPopupProduct] = useState<ProductPopupData | null>(null);
  const isFreshScanRef = useRef(false);

  // State cấu hình món mới khi quét mã chưa có trong danh mục
  const [configModalCode, setConfigModalCode] = useState<string | null>(null);
  const [configName, setConfigName]           = useState('');
  const [configPrice, setConfigPrice]         = useState('');
  const [configUnit, setConfigUnit]           = useState('cái');
  const [configQty, setConfigQty]             = useState(1);
  const [configBusy, setConfigBusy]           = useState(false);
  const [configErr, setConfigErr]             = useState('');
  const [extraProducts, setExtraProducts]     = useState<ProductView[]>([]);

  // Danh mục tra cứu: sản phẩm thật của tiệm (Core, hoặc mockCore khi xem trước) và sản phẩm vừa tạo trong phiên quét.
  // Không trộn dữ liệu mẫu: mã vạch mẫu sẽ ra "sản phẩm ma" có id không tồn tại ở Core, thêm vào đơn rồi checkout bị từ chối.
  const catalog: ProductView[] = useMemo(() => [...products, ...extraProducts], [products, extraProducts]);

  // Đơn hàng hiển thị ở Phần 2: ưu tiên externalCartItems nếu có
  const displayItems = externalCartItems ?? internalItems;
  const totalCount   = displayItems.reduce((s, i) => s + i.qty, 0);
  const totalAmount  = displayItems.reduce((s, i) => s + i.price * i.qty, 0);

  // Cập nhật Bounding Box với timeout tự động ẩn khi không còn barcode trong khung hình
  const updateBbox = (box: BBox) => {
    setDetectedBbox(box);
    if (bboxTimerRef.current) clearTimeout(bboxTimerRef.current);
    bboxTimerRef.current = setTimeout(() => {
      setDetectedBbox(null);
    }, 850);
  };

  // ── Flash Toggle ─────────────────────────────────────────────────────────
  const toggleFlash = () => {
    triggerScanHaptic();
    setTorch((prev) => !prev);
    Animated.sequence([
      Animated.timing(flashScaleAnim, {
        toValue: 1.28,
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(flashScaleAnim, {
        toValue: 1.0,
        friction: 3.5,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // ── Rotate / Flip Camera (100% Native Driver) ────────────────────────────
  const toggleFacing = () => {
    triggerScanHaptic();
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
    rotateAnim.setValue(0);
    Animated.spring(rotateAnim, {
      toValue: 1,
      friction: 5,
      tension: 50,
      useNativeDriver: true,
    }).start();
  };

  // ── Web Camera stream ────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) { stopWeb(); return; }
    if (Platform.OS === 'web') startWeb();
    return () => stopWeb();
  }, [visible, facing]);

  const startWeb = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    stopWeb();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      startScanLoop();
    } catch { /* camera unavailable */ }
  };

  const stopWeb = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startScanLoop = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || popupProduct || configModalCode) return;
      try {
        const r = await detectBarcodeFromSource(videoRef.current);
        if (r?.rawValue) {
          if (r.boundingBox && videoRef.current) {
            const video = videoRef.current;
            const vw = video.videoWidth || 1;
            const vh = video.videoHeight || 1;
            const cw = video.clientWidth || 1;
            const ch = video.clientHeight || 1;

            const videoRatio = vw / vh;
            const containerRatio = cw / ch;
            let scale = 1, offsetX = 0, offsetY = 0;
            if (containerRatio > videoRatio) {
              scale = cw / vw;
              offsetY = (ch - vh * scale) / 2;
            } else {
              scale = ch / vh;
              offsetX = (cw - vw * scale) / 2;
            }

            updateBbox({
              left: r.boundingBox.x * scale + offsetX,
              top: r.boundingBox.y * scale + offsetY,
              width: r.boundingBox.width * scale,
              height: r.boundingBox.height * scale,
            });
          }
          handleCode(r.rawValue);
        }
      } catch { /* continue scanning */ }
    }, 180);
  };

  // ── Native Camera Permission ─────────────────────────────────────────────
  useEffect(() => {
    if (visible && Platform.OS !== 'web' && !permission?.granted) {
      requestPermission().catch(() => {});
    }
  }, [visible, permission]);

  // ── Barcode Handler ──────────────────────────────────────────────────────
  const handleCode = (raw: string) => {
    // Nếu đang mở popup chỉnh sửa hoặc popup cấu hình thì tạm thời không quét thêm
    if (popupProduct || configModalCode) return;

    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    if (lastCodeRef.current === code && now - lastTimeRef.current < 1200) return;
    lastCodeRef.current = code;
    lastTimeRef.current = now;

    if (mode === 'input') {
      playScanSuccessSound();
      triggerScanHaptic();
      onBarcodeScanned?.(code);
      onClose();
      return;
    }

    const cleanCode = code.replace(/\D/g, '');
    const found = catalog.find((p) => {
      if (!p.barcode) return false;
      const bClean = p.barcode.replace(/\D/g, '');
      return p.barcode === code || bClean === cleanCode;
    });

    if (found) {
      // KIỂM TRA ĐẶC BIỆT: Nếu sản phẩm ĐÃ CÓ trong đơn hàng tempo -> BỎ QUA HOÀN TOÀN!
      const alreadyInCart = displayItems.some(
        (i) => i.productId === found.id || i.name === found.name
      );
      if (alreadyInCart) {
        // Đã có trong đơn hàng -> Bỏ qua, không tự động cộng dồn số lượng!
        return;
      }

      // Phát âm thanh tiếng "bíp" máy POS & rung
      playScanSuccessSound();
      triggerScanHaptic();
      setUnknownCode(null);

      // HIỂN THỊ POPUP THÔNG BÁO ĐỂ CHỌN SỐ LƯỢNG VÀ XÁC NHẬN
      setPopupProduct({
        product: found,
        barcode: code,
        qty: 1,
        isExisting: false,
      });
      isFreshScanRef.current = true;
    } else {
      setUnknownCode(code);
    }
  };

  // ── Xác nhận số lượng từ popup (Khoá số lượng và lưu vào đơn) ────────────
  const handleConfirmPopup = () => {
    if (!popupProduct) return;
    triggerScanHaptic();
    const { product, qty, isExisting, barcode } = popupProduct;
    const safeQty = Math.max(1, qty);

    if (isExisting) {
      // Cập nhật lại số lượng của món đã có trong đơn hàng tạm
      const existingItem = displayItems.find(
        (i) => i.productId === product.id || i.name === product.name
      );
      const oldQty = existingItem ? existingItem.qty : 0;
      const delta = safeQty - oldQty;

      if (onAddToCart) {
        onAddToCart(product, delta);
      } else {
        setInternalItems((cur) =>
          cur.map((i) =>
            i.productId === product.id || i.name === product.name
              ? { ...i, qty: safeQty }
              : i
          )
        );
      }
    } else {
      // Thêm sản phẩm mới vào đơn hàng tạm
      if (onAddToCart) {
        onAddToCart(product, safeQty);
      } else {
        setInternalItems((cur) => [
          ...cur,
          {
            productId: product.id,
            name: product.name,
            price: product.sellingPriceVnd,
            qty: safeQty,
          },
        ]);
      }
      onProductScanned?.(product, barcode ?? '', safeQty);
    }

    // Đóng popup -> số lượng được khóa!
    setPopupProduct(null);
  };

  const handleCancelPopup = () => {
    triggerScanHaptic();
    setPopupProduct(null);
  };

  // ── Mở popup cấu hình sản phẩm mới từ mã chưa có ─────────────────────────
  const handleOpenConfig = (code: string) => {
    triggerScanHaptic();
    setConfigModalCode(code);
    setConfigName('');
    setConfigPrice('');
    setConfigUnit('cái');
    setConfigQty(1);
    setConfigErr('');
  };

  const handleCloseConfig = () => {
    triggerScanHaptic();
    setConfigModalCode(null);
    setConfigErr('');
  };

  const handleSaveConfig = async () => {
    const trimmedName = configName.trim();
    if (!trimmedName) {
      setConfigErr('Vui lòng nhập tên sản phẩm');
      return;
    }
    const priceNum = parseInt(configPrice.replace(/\D/g, ''), 10) || 0;
    if (priceNum <= 0) {
      setConfigErr('Vui lòng nhập giá bán hợp lệ');
      return;
    }

    setConfigBusy(true);
    setConfigErr('');

    try {
      let createdProduct: ProductView;
      try {
        createdProduct = await productApi.create({
          name: trimmedName,
          barcode: configModalCode,
          unit: configUnit.trim() || 'cái',
          sellingPriceVnd: priceNum,
          tracked: false,
          stockQuantity: null,
        });
      } catch {
        // Fallback offline / mock
        createdProduct = {
          id: Date.now(),
          shopId: 1,
          categoryId: null,
          name: trimmedName,
          barcode: configModalCode,
          imageUrl: null,
          unit: configUnit.trim() || 'cái',
          sellingPriceVnd: priceNum,
          costPriceVnd: null,
          tracked: false,
          stockQuantity: null,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      setExtraProducts((prev) => [...prev, createdProduct]);
      onProductCreated?.(createdProduct);

      playScanSuccessSound();
      triggerScanHaptic();

      if (mode === 'input') {
        onBarcodeScanned?.(configModalCode ?? '');
        onClose();
      } else {
        if (onAddToCart) {
          onAddToCart(createdProduct, configQty);
        } else {
          setInternalItems((cur) => [
            ...cur,
            {
              productId: createdProduct.id,
              name: createdProduct.name,
              price: createdProduct.sellingPriceVnd,
              qty: configQty,
            },
          ]);
        }
        onProductScanned?.(createdProduct, configModalCode ?? '', configQty);
      }

      setConfigModalCode(null);
      setUnknownCode(null);
    } catch (e: any) {
      setConfigErr(e?.message || 'Không thể lưu sản phẩm');
    } finally {
      setConfigBusy(false);
    }
  };

  // ── Khi bấm vào 1 sản phẩm trong đơn hàng tạm (Phần 2) để thay đổi số lượng ─
  const handleTapItemToEdit = (item: LineItem) => {
    triggerScanHaptic();
    const product = catalog.find((p) => p.id === item.productId || p.name === item.name);
    if (!product) return;

    setPopupProduct({
      product,
      qty: item.qty,
      isExisting: true,
    });
    isFreshScanRef.current = false;
  };

  // ── Xoá một sản phẩm khỏi đơn hàng (qua swipe left) ───────────────────────
  const handleDeleteItem = (productId: string | number) => {
    triggerScanHaptic();
    const product = catalog.find((p) => p.id === productId);
    const currentItem = displayItems.find((i) => i.productId === productId);
    if (!currentItem) return;

    if (onAddToCart && product) {
      onAddToCart(product, -currentItem.qty);
    } else {
      setInternalItems((cur) => cur.filter((i) => i.productId !== productId));
    }
  };

  const handleClearAll = () => {
    triggerScanHaptic();
    if (onClearCart) {
      onClearCart();
    } else {
      setInternalItems([]);
    }
    setPopupProduct(null);
  };

  // ── Bàn phím số POS: Điều khiển số lượng của popup ───────────────────────
  const handleKeypadPress = (char: string) => {
    triggerScanHaptic();
    if (!popupProduct) return;

    let newQty: number;
    if (isFreshScanRef.current) {
      newQty = parseInt(char, 10) || 1;
      isFreshScanRef.current = false;
    } else {
      const curStr = String(popupProduct.qty);
      const nextStr = (curStr + char).slice(0, 4);
      newQty = parseInt(nextStr, 10) || 1;
    }

    setPopupProduct((prev) => (prev ? { ...prev, qty: Math.max(1, newQty) } : null));
  };

  const handleKeypadBackspace = () => {
    triggerScanHaptic();
    if (!popupProduct) return;

    const curStr = String(popupProduct.qty);
    if (curStr.length <= 1) {
      setPopupProduct((prev) => (prev ? { ...prev, qty: 1 } : null));
      isFreshScanRef.current = true;
    } else {
      const nextStr = curStr.slice(0, -1);
      setPopupProduct((prev) => (prev ? { ...prev, qty: parseInt(nextStr, 10) || 1 } : null));
    }
  };

  const handleKeypadClear = () => {
    triggerScanHaptic();
    if (!popupProduct) return;
    setPopupProduct((prev) => (prev ? { ...prev, qty: 1 } : null));
    isFreshScanRef.current = true;
  };

  // ── Layout Calculations: Giới hạn tối đa 50/50 giữa Phần 2 và Phần 3 ────
  const winH = Dimensions.get('window').height;
  const keypadH = 220 + Math.max(insets.bottom, 12);
  const availableUpperH = Math.max(280, winH - keypadH);
  // Phần 2 tối đa chiếm 50% không gian phía trên bàn phím
  const maxPopupH = availableUpperH * 0.50;

  const rotateDeg = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const rotateScale = rotateAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.2, 1],
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={S.root}>
        {/* ════════════════════════════════════════════════════════
            PHẦN 3: CAMERA TRÀN VIỀN (Ở TRÊN)
            - Tràn đỉnh qua tai thỏ / notch
            - Nút đổi Camera & Flash ở Top HUD
            - Bounding box 4 góc bám theo mã vạch khi detect thành công
            ════════════════════════════════════════════════════════ */}
        <View style={S.camSection}>
          {Platform.OS !== 'web' ? (
            permission?.granted ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing={facing === 'environment' ? 'back' : 'front'}
                enableTorch={torch}
                barcodeScannerSettings={{
                  barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'],
                }}
                onBarcodeScanned={(r) => {
                  if (r?.data && !popupProduct) {
                    if (r.bounds) {
                      updateBbox({
                        left: r.bounds.origin.x,
                        top: r.bounds.origin.y,
                        width: r.bounds.size.width,
                        height: r.bounds.size.height,
                      });
                    }
                    handleCode(r.data);
                  }
                }}
              />
            ) : (
              <View style={S.noCamera}>
                <Feather name="camera-off" size={26} color="rgba(255,255,255,0.4)" />
                <T size={13} color="rgba(255,255,255,0.5)" style={{ marginTop: 8 }}>
                  Cần cấp quyền Camera
                </T>
                <Pressable onPress={() => requestPermission()} style={S.permBtn}>
                  <T w="bold" size={13} color={colors.accentInk}>Cấp quyền</T>
                </Pressable>
              </View>
            )
          ) : (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: '#000', overflow: 'hidden' }}>
              <video
                ref={videoRef as any}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
          )}

          {/* ── Bounding Box động: vẽ 4 góc bám theo mã vạch khi detect thành công ── */}
          {detectedBbox && (
            <View
              style={[
                S.bboxContainer,
                {
                  left: detectedBbox.left,
                  top: detectedBbox.top,
                  width: Math.max(detectedBbox.width, 70),
                  height: Math.max(detectedBbox.height, 42),
                },
              ]}
              pointerEvents="none"
            >
              <View style={[S.bboxCorner, S.bboxTL]} />
              <View style={[S.bboxCorner, S.bboxTR]} />
              <View style={[S.bboxCorner, S.bboxBL]} />
              <View style={[S.bboxCorner, S.bboxBR]} />
            </View>
          )}

          {/* ── Top HUD Controls trên khu vực Camera ── */}
          <View style={[S.topHud, { paddingTop: insets.top + 8 }]}>
            {/* Title trung tâm để nhận diện tính năng Quét mã vạch */}
            <View
              style={[
                StyleSheet.absoluteFill,
                { top: insets.top + 8, alignItems: 'center', justifyContent: 'center' },
              ]}
              pointerEvents="none"
            >
              <T w="bold" size={16} color="#FFFFFF">
                Quét mã vạch
              </T>
            </View>

            {/* Nút Đóng (X) */}
            <Pressable onPress={onClose} hitSlop={14} style={S.hudIconBtn}>
              <Feather name="x" size={20} color="#FFFFFF" />
            </Pressable>

            <View style={{ flex: 1 }} />

            <View style={S.hudRightBtns}>
              {/* NÚT ĐỔI CAMERA */}
              <Pressable onPress={toggleFacing} hitSlop={12} style={S.hudIconBtn}>
                <Animated.View
                  style={{
                    transform: [{ rotate: rotateDeg }, { scale: rotateScale }],
                  }}
                >
                  <Feather name="refresh-cw" size={18} color="#FFFFFF" />
                </Animated.View>
              </Pressable>

              {/* NÚT FLASH: KHÔNG CÓ Ô BAO QUANH, icon sấm sét chuẩn Apple gọn gàng */}
              <Pressable onPress={toggleFlash} hitSlop={14} style={S.flashBtn}>
                <FlashLightning active={torch} scaleAnim={flashScaleAnim} />
              </Pressable>
            </View>
          </View>

          {/* ── Cảnh báo mã chưa có trong danh mục & Nút Cấu hình ── */}
          {unknownCode && !configModalCode && (
            <Pressable
              onPress={() => handleOpenConfig(unknownCode)}
              style={({ pressed }) => [S.unknownBanner, pressed && { opacity: 0.92 }]}
            >
              <View style={S.unknownBannerLeft}>
                <BarcodeIcon size={16} color={colors.primary} />
                <View style={{ flex: 1, paddingRight: 6 }}>
                  <T size={12.5} color={colors.ink}>
                    Mã <T w="bold" color={colors.primaryDeep}>{unknownCode}</T> chưa có
                  </T>
                  <T size={11.5} color={colors.muted}>
                    Chạm để cấu hình sản phẩm
                  </T>
                </View>
              </View>

              <View style={S.unknownBannerActions}>
                <View style={S.configActionBtn}>
                  <T w="bold" size={12.5} color={colors.accentInk}>
                    Cấu hình
                  </T>
                  <Feather name="chevron-right" size={15} color={colors.accentInk} />
                </View>

                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    setUnknownCode(null);
                  }}
                  hitSlop={10}
                  style={S.unknownDismissBtn}
                >
                  <Feather name="x" size={15} color={colors.muted} />
                </Pressable>
              </View>
            </Pressable>
          )}
        </View>

        {/* ════════════════════════════════════════════════════════
            POPUP CẤU HÌNH SẢN PHẨM MỚI (KHI QUÉT MÃ CHƯA CÓ)
            ════════════════════════════════════════════════════════ */}
        {configModalCode && (
          <View style={S.configCard}>
            {/* Header */}
            <View style={S.configHeader}>
              <View style={{ flex: 1 }}>
                <T w="bold" size={16} color={colors.ink}>Cấu hình sản phẩm</T>
                <View style={S.barcodeBadge}>
                  <BarcodeIcon size={12} color={colors.primary} />
                  <T w="semibold" size={12} color={colors.primaryDeep}>{configModalCode}</T>
                </View>
              </View>
              <Pressable
                onPress={handleCloseConfig}
                hitSlop={12}
                style={S.popupCloseIconBtn}
              >
                <Feather name="x" size={18} color={colors.muted} />
              </Pressable>
            </View>

            {/* Form Fields */}
            <View style={S.configForm}>
              <View style={S.inputField}>
                <T size={12} color={colors.muted} w="semibold">Tên sản phẩm *</T>
                <TextInput
                  value={configName}
                  onChangeText={(t) => {
                    setConfigName(t);
                    setConfigErr('');
                  }}
                  placeholder="Ví dụ: Sting vàng, Mì xào..."
                  placeholderTextColor={colors.muted}
                  style={S.textInput}
                  autoFocus
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[S.inputField, { flex: 1.5 }]}>
                  <T size={12} color={colors.muted} w="semibold">Giá bán (đ) *</T>
                  <TextInput
                    value={configPrice ? Number(configPrice).toLocaleString('vi-VN') : ''}
                    onChangeText={(t) => {
                      setConfigPrice(t.replace(/\D/g, ''));
                      setConfigErr('');
                    }}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    style={S.textInput}
                  />
                </View>

                <View style={[S.inputField, { flex: 1 }]}>
                  <T size={12} color={colors.muted} w="semibold">Đơn vị</T>
                  <TextInput
                    value={configUnit}
                    onChangeText={setConfigUnit}
                    placeholder="cái, lon..."
                    placeholderTextColor={colors.muted}
                    style={S.textInput}
                  />
                </View>
              </View>

              {mode === 'order' && (
                <View style={S.configQtyRow}>
                  <T size={13} color={colors.ink} w="semibold">Số lượng vào đơn:</T>
                  <View style={S.popupStepper}>
                    <Pressable
                      onPress={() => {
                        triggerScanHaptic();
                        setConfigQty((q) => Math.max(1, q - 1));
                      }}
                      style={S.popupStepBtn}
                      hitSlop={8}
                    >
                      <Feather name="minus" size={16} color={colors.ink} />
                    </Pressable>
                    <View style={S.popupStepDisplay}>
                      <T w="extrabold" size={18} color={colors.primaryDeep}>{configQty}</T>
                    </View>
                    <Pressable
                      onPress={() => {
                        triggerScanHaptic();
                        setConfigQty((q) => q + 1);
                      }}
                      style={S.popupStepBtn}
                      hitSlop={8}
                    >
                      <Feather name="plus" size={16} color={colors.ink} />
                    </Pressable>
                  </View>
                </View>
              )}

              {configErr ? (
                <T size={12} color={colors.red} style={{ marginTop: 2 }}>{configErr}</T>
              ) : null}
            </View>

            {/* Buttons: [ Huỷ ] [ Lưu & Thêm ] */}
            <View style={S.btnRow}>
              <Pressable
                onPress={handleCloseConfig}
                style={S.clearBtn}
                hitSlop={6}
              >
                <T w="bold" size={14} color={colors.muted}>Huỷ</T>
              </Pressable>

              <Pressable
                onPress={handleSaveConfig}
                disabled={configBusy}
                style={({ pressed }) => [
                  S.checkoutBtn,
                  pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                  configBusy && { opacity: 0.6 },
                ]}
              >
                <T w="extrabold" size={15.5} color={colors.accentInk}>
                  {configBusy ? 'Đang lưu...' : mode === 'order' ? 'Lưu & Thêm' : 'Lưu'}
                </T>
                <Feather name="check" size={18} color={colors.accentInk} />
              </Pressable>
            </View>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════
            POPUP SẢN PHẨM: TỐI GIẢN
            - Tên sản phẩm, đơn giá, nút [X] đóng
            - Stepper số lượng & thành tiền
            - Nút ngắn gọn: "Thêm" hoặc "Xong"
            ════════════════════════════════════════════════════════ */}
        {popupProduct && !configModalCode && (
          <View style={S.popupOverlayCard}>
            {/* Header thông tin sản phẩm & nút đóng */}
            <View style={S.popupHeaderRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <T w="bold" size={16} color={colors.ink} numberOfLines={2}>
                  {popupProduct.product.name}
                </T>
                <T size={12.5} color={colors.muted} style={{ marginTop: 2 }}>
                  {vnd(popupProduct.product.sellingPriceVnd)} / {popupProduct.product.unit}
                  {popupProduct.product.tracked && popupProduct.product.stockQuantity != null
                    ? ` · Tồn: ${Math.round(popupProduct.product.stockQuantity)}`
                    : ''}
                </T>
              </View>
              <Pressable onPress={handleCancelPopup} hitSlop={12} style={S.popupCloseIconBtn}>
                <Feather name="x" size={18} color={colors.muted} />
              </Pressable>
            </View>

            {/* Stepper số lượng & thành tiền */}
            <View style={S.popupQtyRow}>
              <View style={S.popupStepper}>
                <Pressable
                  onPress={() => {
                    triggerScanHaptic();
                    setPopupProduct((prev) =>
                      prev ? { ...prev, qty: Math.max(1, prev.qty - 1) } : null
                    );
                    isFreshScanRef.current = false;
                  }}
                  style={S.popupStepBtn}
                  hitSlop={8}
                >
                  <Feather name="minus" size={16} color={colors.ink} />
                </Pressable>

                <View style={S.popupStepDisplay}>
                  <T w="extrabold" size={22} color={colors.primaryDeep}>
                    {popupProduct.qty}
                  </T>
                </View>

                <Pressable
                  onPress={() => {
                    triggerScanHaptic();
                    setPopupProduct((prev) =>
                      prev ? { ...prev, qty: prev.qty + 1 } : null
                    );
                    isFreshScanRef.current = false;
                  }}
                  style={S.popupStepBtn}
                  hitSlop={8}
                >
                  <Feather name="plus" size={16} color={colors.ink} />
                </Pressable>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <T size={11} color={colors.muted}>Thành tiền</T>
                <T w="extrabold" size={18} color={colors.primaryDeep}>
                  {vnd(popupProduct.product.sellingPriceVnd * popupProduct.qty)}
                </T>
              </View>
            </View>

            {/* Nút hành động tối giản: "Thêm" hoặc "Xong" */}
            <Pressable
              onPress={handleConfirmPopup}
              style={({ pressed }) => [
                S.popupConfirmBtn,
                pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
              ]}
            >
              <T w="extrabold" size={15.5} color={colors.accentInk}>
                {popupProduct.isExisting ? 'Xong' : 'Thêm'}
              </T>
            </Pressable>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════
            PHẦN 2: TÓM TẮT ĐƠN HÀNG TẠM
            - Chỉ hiển thị khi đã có sản phẩm trong đơn (!configModalCode && !popupProduct && displayItems.length > 0)
            - Khi chưa có sản phẩm: Tối giản, KHÔNG hiển thị popup/card nào
            - Bấm vào sản phẩm để đổi số lượng
            - Vuốt sang trái để xoá
            ════════════════════════════════════════════════════════ */}
        {!configModalCode && !popupProduct && displayItems.length > 0 && (
          <View style={[S.orderPopupCard, { maxHeight: maxPopupH }]}>
            <ScrollView
              style={S.itemsScrollView}
              contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
              showsVerticalScrollIndicator={false}
            >
              {displayItems.map((item, idx) => (
                <SwipeableItemRow
                  key={`${item.productId ?? item.name}_${idx}`}
                  item={item}
                  onPressItem={() => handleTapItemToEdit(item)}
                  onDelete={() => {
                    if (item.productId != null) {
                      handleDeleteItem(item.productId);
                    }
                  }}
                />
              ))}
            </ScrollView>

            {/* Khu vực tổng kết & Nút hành động tối giản */}
            <View style={S.orderBottomSection}>
              {/* Dòng hiển thị: Số món & Tổng tiền */}
              <View style={S.summaryRow}>
                <T size={14} color={colors.muted}>
                  Tổng cộng · <T w="bold" color={colors.ink}>{totalCount} món</T>
                </T>
                <T w="extrabold" size={21} color={colors.primaryDeep}>
                  {vnd(totalAmount)}
                </T>
              </View>

              {/* Hàng nút bấm tối giản: [ Xoá ] [ Thanh toán ] */}
              <View style={S.btnRow}>
                <Pressable
                  onPress={handleClearAll}
                  style={({ pressed }) => [S.clearBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={6}
                >
                  <Feather name="trash-2" size={15} color={colors.red} />
                  <T w="bold" size={14} color={colors.red}>Xoá</T>
                </Pressable>

                <Pressable
                  onPress={() => {
                    triggerScanHaptic();
                    if (onCheckout) onCheckout();
                    else onClose();
                  }}
                  style={({ pressed }) => [
                    S.checkoutBtn,
                    pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <T w="extrabold" size={16} color={colors.accentInk}>Thanh toán</T>
                  <Feather name="arrow-right" size={18} color={colors.accentInk} />
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════
            PHẦN 1: BÀN PHÍM SỐ POS (LÚC NÀO CŨNG HIỂN THỊ)
            - Dùng để nhập số lượng sản phẩm trên popup
            - 3x4 layout chuẩn máy POS / OTP
            - Hàng 4: [ C (Về 1) ] [ 0 ] [ ⌫ (Xoá lùi) ]
            ════════════════════════════════════════════════════════ */}
        <View style={[S.keypadContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {/* Row 1 */}
          <View style={S.keyRow}>
            <KeyBtn label="1" onPress={() => handleKeypadPress('1')} />
            <KeyBtn label="2" onPress={() => handleKeypadPress('2')} />
            <KeyBtn label="3" onPress={() => handleKeypadPress('3')} />
          </View>

          {/* Row 2 */}
          <View style={S.keyRow}>
            <KeyBtn label="4" onPress={() => handleKeypadPress('4')} />
            <KeyBtn label="5" onPress={() => handleKeypadPress('5')} />
            <KeyBtn label="6" onPress={() => handleKeypadPress('6')} />
          </View>

          {/* Row 3 */}
          <View style={S.keyRow}>
            <KeyBtn label="7" onPress={() => handleKeypadPress('7')} />
            <KeyBtn label="8" onPress={() => handleKeypadPress('8')} />
            <KeyBtn label="9" onPress={() => handleKeypadPress('9')} />
          </View>

          {/* Row 4: [C] [0] [⌫] */}
          <View style={S.keyRow}>
            <Pressable
              onPress={handleKeypadClear}
              style={({ pressed }) => [S.keyBtn, pressed && S.keyPressed]}
            >
              <T w="bold" size={19} color={colors.muted}>C</T>
            </Pressable>

            <KeyBtn label="0" onPress={() => handleKeypadPress('0')} />

            <Pressable
              onPress={handleKeypadBackspace}
              style={({ pressed }) => [S.keyBtn, pressed && S.keyPressed]}
            >
              <Feather name="delete" size={20} color={colors.muted} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Swipeable Item Row (Vuốt sang trái để xoá, chạm để sửa số lượng) ─────
function SwipeableItemRow({
  item,
  onPressItem,
  onDelete,
}: {
  item: LineItem;
  onPressItem: () => void;
  onDelete: () => void;
}) {
  const panX = useRef(new Animated.Value(0)).current;
  const isSwipedRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dy) < 18,
      onPanResponderMove: (_, g) => {
        const base = isSwipedRef.current ? -72 : 0;
        const next = Math.min(0, Math.max(-100, base + g.dx));
        panX.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -40 || (isSwipedRef.current && g.dx < 20)) {
          Animated.spring(panX, {
            toValue: -72,
            friction: 7,
            tension: 50,
            useNativeDriver: true,
          }).start();
          isSwipedRef.current = true;
        } else {
          Animated.spring(panX, {
            toValue: 0,
            friction: 7,
            tension: 50,
            useNativeDriver: true,
          }).start();
          isSwipedRef.current = false;
        }
      },
    })
  ).current;

  const closeSwipe = () => {
    Animated.timing(panX, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
    isSwipedRef.current = false;
  };

  return (
    <View style={S.swipeRowContainer}>
      {/* Nút Xoá nền đỏ phía dưới khi kéo sang trái */}
      <View style={S.deleteActionUnderlay}>
        <Pressable
          onPress={() => {
            closeSwipe();
            onDelete();
          }}
          style={S.deleteActionBtn}
        >
          <Feather name="trash-2" size={17} color="#FFFFFF" />
          <T w="bold" size={11} color="#FFFFFF" style={{ marginTop: 2 }}>
            Xoá
          </T>
        </Pressable>
      </View>

      {/* Hàng sản phẩm: chạm vào để mở popup sửa số lượng */}
      <Animated.View
        style={[
          S.itemRowCard,
          { transform: [{ translateX: panX }] },
        ]}
        {...panResponder.panHandlers}
      >
        <Pressable
          onPress={() => {
            if (isSwipedRef.current) {
              closeSwipe();
            } else {
              onPressItem();
            }
          }}
          style={S.itemRowInner}
        >
          {/* Thông tin tên món & đơn giá */}
          <View style={{ flex: 1, paddingRight: 8 }}>
            <T w="semibold" size={15.5} color={colors.ink} numberOfLines={1}>
              {item.name}
            </T>
            <T size={13} color={colors.muted} style={{ marginTop: 2 }}>
              {vnd(item.price)}
            </T>
          </View>

          {/* Badge số lượng đã khóa */}
          <View style={S.lockedQtyBadge}>
            <T w="extrabold" size={15} color={colors.primaryDeep}>
              ×{item.qty}
            </T>
          </View>

          {/* Thành tiền */}
          <View style={{ minWidth: 72, alignItems: 'flex-end', marginLeft: 8 }}>
            <T w="extrabold" size={15} color={colors.primaryDeep}>
              {vnd(item.price * item.qty)}
            </T>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ─── KeyBtn Component ───────────────────────────────────────────────────────
function KeyBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [S.keyBtn, pressed && S.keyPressed]}
    >
      <T w="bold" size={22} color={colors.ink}>
        {label}
      </T>
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // ─── PHẦN 3: Camera ───────────────────────────────────────────────────────
  camSection: {
    flex: 1,
    minHeight: 160,
    backgroundColor: '#000000',
    overflow: 'hidden',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    position: 'relative',
    ...shadow(2),
  },

  noCamera: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  permBtn: {
    marginTop: 12,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 12,
  },

  // Bounding box 4 góc động bao quanh barcode
  bboxContainer: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(143, 219, 110, 0.4)',
    backgroundColor: 'rgba(143, 219, 110, 0.08)',
    borderRadius: 6,
  },
  bboxCorner: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderColor: '#8FDB6E',
  },
  bboxTL: { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  bboxTR: { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  bboxBL: { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  bboxBR: { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },

  // Top HUD Controls
  topHud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 30,
  },

  hudRightBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  hudIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },

  flashBtn: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── BANNER MÃ CHƯA CÓ TRONG DANH MỤC ────────────────────────────────────
  unknownBanner: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ECE8DF',
    ...shadow(2),
    zIndex: 25,
  },

  unknownBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },

  unknownBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  configActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },

  unknownDismissBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── POPUP CẤU HÌNH SẢN PHẨM MỚI ─────────────────────────────────────────
  configCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 4,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow(2),
  },

  configHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  barcodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
  },

  configForm: {
    gap: 10,
  },

  inputField: {
    gap: 4,
  },

  textInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14.5,
    color: colors.ink,
  },

  configQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },

  // ─── POPUP SẢN PHẨM: TỐI GIẢN & TIỆN LỢI ─────────────────────────────────
  popupOverlayCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 4,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow(2),
  },

  popupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  popupCloseIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
  },

  popupQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },

  popupStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  popupStepBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  popupStepDisplay: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  popupConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    height: 48,
    ...shadow(1),
  },

  // ─── PHẦN 2: TÓM TẮT ĐƠN HÀNG TẠM (RỘNG RÃI & RÕ RÀNG HƠN) ──────────────
  orderPopupCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginHorizontal: 8,
    marginTop: 6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    minHeight: 220,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow(2),
  },

  itemsScrollView: {
    flexGrow: 0,
  },

  swipeRowContainer: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#F7F6F2',
  },

  deleteActionUnderlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 72,
    backgroundColor: colors.red,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  deleteActionBtn: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  itemRowCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ECE8DF',
  },

  itemRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },

  lockedQtyBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Khu vực tổng kết & nút bấm gọn gàng
  orderBottomSection: {
    paddingTop: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#ECE8DF',
    marginTop: 6,
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },

  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  clearBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: colors.redSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },

  checkoutBtn: {
    flex: 2.4,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...shadow(1),
  },

  // ─── PHẦN 1: BÀN PHÍM SỐ POS (LÚC NÀO CŨNG HIỂN THỊ) ──────────────────────
  keypadContainer: {
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 8,
  },

  keyRow: {
    flexDirection: 'row',
    gap: 8,
  },

  keyBtn: {
    flex: 1,
    height: 48,
    backgroundColor: colors.white,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow(0),
  },

  keyPressed: {
    backgroundColor: '#EBE8DF',
    transform: [{ scale: 0.96 }],
  },
});
