import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import type { LineItem, Product } from '../data/types';
import {
  detectBarcodeFromSource,
  formatBarcode,
  isValidBarcode,
  playScanSuccessSound,
  triggerScanHaptic,
} from '../lib/barcode';
import { vnd } from '../lib/format';
import { useApp } from '../store/AppStore';
import { colors, font, radius, shadow } from '../theme';
import { useToast } from './brand';
import { Badge, Button, Field, Row, Sheet, T } from './ui';

export function BarcodeIcon({ size = 20, color = colors.primary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="4" width="2" height="16" rx="0.5" fill={color} />
      <Rect x="6" y="4" width="1.5" height="16" rx="0.5" fill={color} />
      <Rect x="9.5" y="4" width="3" height="16" rx="0.5" fill={color} />
      <Rect x="14.5" y="4" width="1.5" height="16" rx="0.5" fill={color} />
      <Rect x="18" y="4" width="2" height="16" rx="0.5" fill={color} />
      <Rect x="21.5" y="4" width="1" height="16" rx="0.5" fill={color} />
    </Svg>
  );
}

export interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  /** Callback when product is scanned and resolved with quantity */
  onProductScanned?: (product: Product, barcode: string, qty: number) => void;
  /** Direct callback when a raw barcode string is scanned */
  onBarcodeScanned?: (barcode: string) => void;
  /** Custom title for scanner */
  title?: string;
  /** If true, opens create product modal immediately when an unknown barcode is found */
  allowCreateNew?: boolean;
  /** Optional mode: 'order' (adds to cart/order) or 'input' (just returns barcode for form field) */
  mode?: 'order' | 'input';
}

const DEMO_PRESETS = [
  { code: '8934563138164', label: 'Mì gói Hảo Hảo' },
  { code: '8934588012112', label: 'Nước suối' },
  { code: '8934588193057', label: 'Sting dâu' },
  { code: '8935049500544', label: 'Nước ngọt Coca' },
  { code: '8931234567890', label: 'Mã mới (Chưa có)' },
];

const QUICK_QTY_PRESETS = [1, 2, 3, 5, 6, 10, 12, 24];

interface RecentScanItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  total: number;
  time: string;
}

export function BarcodeScannerModal({
  visible,
  onClose,
  onProductScanned,
  onBarcodeScanned,
  title = 'Máy POS Quét Mã Vạch',
  allowCreateNew = true,
  mode = 'order',
}: BarcodeScannerModalProps) {
  const app = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [nativePermission, requestNativePermission] = useCameraPermissions();
  const [webCameraPermission, setWebCameraPermission] = useState<boolean | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // POS Keypad & Active product waiting for quantity
  const [activeProductForQty, setActiveProductForQty] = useState<{
    product: Product;
    barcode: string;
  } | null>(null);
  const [qtyInput, setQtyInput] = useState<string>('');

  // Unrecognized barcode state
  const [unrecognizedCode, setUnrecognizedCode] = useState<string | null>(null);
  const [createProductOpen, setCreateProductOpen] = useState(false);

  // Recent scans history in current session
  const [recentScans, setRecentScans] = useState<RecentScanItem[]>([]);

  // New product inline creation states
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdCost, setNewProdCost] = useState('');
  const [newProdStock, setNewProdStock] = useState('20');
  const [newProdCategory, setNewProdCategory] = useState<'drink' | 'food' | 'grocery' | 'fresh' | 'other'>('grocery');

  // Scanner animation & tracking states
  const laserAnim = useRef(new Animated.Value(0)).current;
  const lockAnim = useRef(new Animated.Value(0)).current;
  const keypadSlideAnim = useRef(new Animated.Value(0)).current;
  const lastScanTimestamp = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>('');

  // ML Kit auto-detected bounding location
  const [detectedBounds, setDetectedBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Web video stream refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<any>(null);

  // Calculate cart summary
  const cartSummary = useMemo(() => {
    let totalItems = 0;
    let totalMoney = 0;
    Object.entries(app.cart).forEach(([pid, qty]) => {
      if (qty > 0) {
        totalItems += qty;
        const p = app.products.find((prod) => prod.id === pid);
        if (p) {
          totalMoney += p.price * qty;
        }
      }
    });
    return { totalItems, totalMoney };
  }, [app.cart, app.products]);

  // Laser animation loop
  useEffect(() => {
    if (!visible || !!activeProductForQty) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(laserAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(laserAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, activeProductForQty, laserAnim]);

  // Keypad slide animation
  useEffect(() => {
    if (activeProductForQty) {
      Animated.spring(keypadSlideAnim, {
        toValue: 1,
        tension: 70,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(keypadSlideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [activeProductForQty, keypadSlideAnim]);

  // Request native permission automatically on open
  useEffect(() => {
    if (visible && activeTab === 'camera' && Platform.OS !== 'web') {
      if (!nativePermission?.granted) {
        requestNativePermission().catch(() => {});
      }
    }
  }, [visible, activeTab, nativePermission]);

  // Start & Stop camera stream on Web
  useEffect(() => {
    if (!visible || activeTab !== 'camera') {
      stopWebCamera();
      return;
    }

    if (Platform.OS === 'web') {
      startWebCamera();
    }
    return () => {
      stopWebCamera();
    };
  }, [visible, activeTab, facingMode]);

  // Web physical keyboard support for POS keypad
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeProductForQty) {
        if (e.key >= '0' && e.key <= '9') {
          e.preventDefault();
          handleKeypadPress(e.key);
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          handleKeypadBackspace();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancelQuantityInput();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleConfirmQuantity();
        } else if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          handleKeypadClear();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, activeProductForQty, qtyInput]);

  const startWebCamera = async () => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setWebCameraPermission(false);
      return;
    }

    try {
      stopWebCamera();
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      setWebCameraPermission(true);
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      startScanLoop();
    } catch (err) {
      console.warn('Camera access error:', err);
      setWebCameraPermission(false);
      setCameraActive(false);
    }
  };

  const stopWebCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const toggleTorch = async () => {
    if (Platform.OS !== 'web') {
      setTorchOn((prev) => !prev);
      return;
    }
    if (!mediaStreamRef.current) return;
    const track = mediaStreamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch {
      toast('Đèn pin không được thiết bị hỗ trợ');
    }
  };

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Continuous frame scanning loop
  const startScanLoop = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

    scanIntervalRef.current = setInterval(async () => {
      // Pause camera scanning when keypad is open or modal is busy
      if (!videoRef.current || videoRef.current.readyState < 2 || isProcessing || activeProductForQty) return;

      try {
        const result = await detectBarcodeFromSource(videoRef.current);
        if (result && result.rawValue) {
          handleDetectedBarcode(result.rawValue, result.boundingBox);
        }
      } catch {
        /* continue scanning */
      }
    }, 180);
  };

  const triggerTargetLockAnimation = (bounds?: { x: number; y: number; width: number; height: number }) => {
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      setDetectedBounds(bounds);
    }
    lockAnim.setValue(0);
    Animated.sequence([
      Animated.spring(lockAnim, {
        toValue: 1,
        tension: 90,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.delay(1000),
      Animated.timing(lockAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setDetectedBounds(null);
    });
  };

  const handleDetectedBarcode = (
    rawCode: string,
    bounds?: { x?: number; y?: number; width?: number; height?: number; origin?: { x: number; y: number }; size?: { width: number; height: number } },
  ) => {
    // If already waiting for quantity on a product, do not interrupt
    if (activeProductForQty) return;

    const code = rawCode.trim();
    if (!code) return;

    const now = Date.now();
    // Debounce rapid repeat detection of the same code within 1.2s
    if (lastScannedCodeRef.current === code && now - lastScanTimestamp.current < 1200) {
      return;
    }

    lastScanTimestamp.current = now;
    lastScannedCodeRef.current = code;

    let normalizedBounds: { x: number; y: number; width: number; height: number } | undefined;
    if (bounds) {
      if (bounds.origin && bounds.size) {
        normalizedBounds = {
          x: bounds.origin.x,
          y: bounds.origin.y,
          width: bounds.size.width,
          height: bounds.size.height,
        };
      } else if (typeof bounds.x === 'number' && typeof bounds.y === 'number' && bounds.width && bounds.height) {
        normalizedBounds = {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        };
      }
    }

    triggerTargetLockAnimation(normalizedBounds);
    playScanSuccessSound();
    triggerScanHaptic();

    processBarcodeLookup(code);
  };

  const processBarcodeLookup = (code: string) => {
    // Mode 'input': simply emit barcode to caller (for form fields)
    if (mode === 'input') {
      onBarcodeScanned?.(code);
      toast(`Đã quét mã: ${code}`);
      onClose();
      return;
    }

    // Mode 'order': lookup matching product in store
    const product = app.findProductByBarcode(code);

    if (product) {
      // Product found -> Open POS Keypad for quantity selection (DO NOT default to 1)
      setUnrecognizedCode(null);
      setQtyInput(''); // Start empty, requiring cashier to type quantity or pick preset
      setActiveProductForQty({
        product,
        barcode: code,
      });
    } else {
      // Product not found with this barcode
      setActiveProductForQty(null);
      setUnrecognizedCode(code);
    }
  };

  // Numpad key handlers
  const handleKeypadPress = (digit: string) => {
    triggerScanHaptic();
    setQtyInput((prev) => {
      // Max 4 digits for POS quantity (up to 9999)
      if (prev.length >= 4) return prev;
      if (prev === '0') return digit;
      return prev + digit;
    });
  };

  const handleKeypadBackspace = () => {
    triggerScanHaptic();
    setQtyInput((prev) => prev.slice(0, -1));
  };

  const handleKeypadClear = () => {
    triggerScanHaptic();
    setQtyInput('');
  };

  const handleQuickQtyPreset = (qty: number) => {
    triggerScanHaptic();
    setQtyInput(String(qty));
  };

  const handleAdjustQtyDelta = (delta: number) => {
    triggerScanHaptic();
    const current = parseInt(qtyInput, 10) || 0;
    const next = Math.max(1, current + delta);
    setQtyInput(String(next));
  };

  const handleConfirmQuantity = () => {
    if (!activeProductForQty) return;
    const numQty = parseInt(qtyInput, 10);
    if (!numQty || numQty <= 0) {
      toast('Vui lòng chọn số lượng bằng bàn phím số', 'err');
      return;
    }

    const { product, barcode } = activeProductForQty;

    // Add to cart or trigger callback with chosen quantity
    if (onProductScanned) {
      onProductScanned(product, barcode, numQty);
    } else {
      app.addToCart(product.id, numQty);
    }

    playScanSuccessSound();
    triggerScanHaptic();

    const lineTotal = product.price * numQty;
    toast(`+${numQty} ${product.name} (${vnd(lineTotal)})`);

    // Add to recent scans log
    setRecentScans((prev) => [
      {
        id: `${product.id}-${Date.now()}`,
        name: product.name,
        qty: numQty,
        price: product.price,
        total: lineTotal,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      },
      ...prev.slice(0, 9),
    ]);

    // Reset keypad and return to scanner
    setActiveProductForQty(null);
    setQtyInput('');
  };

  const handleCancelQuantityInput = () => {
    setActiveProductForQty(null);
    setQtyInput('');
  };

  const handleManualSubmit = () => {
    const code = manualCode.trim();
    if (!code) {
      toast('Vui lòng nhập mã vạch');
      return;
    }
    handleDetectedBarcode(code);
    setManualCode('');
  };

  const handleFileUpload = async (event: any) => {
    const file = event.target?.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const result = await detectBarcodeFromSource(img);
      setIsProcessing(false);
      if (result && result.rawValue) {
        handleDetectedBarcode(result.rawValue);
      } else {
        toast('Không tìm thấy mã vạch trong ảnh đã chọn', 'err');
      }
    } catch {
      setIsProcessing(false);
      toast('Lỗi khi đọc file ảnh', 'err');
    }
  };

  const openCreateProductSheet = () => {
    if (!unrecognizedCode) return;
    setNewProdName('');
    setNewProdPrice('');
    setNewProdCost('');
    setNewProdStock('20');
    setNewProdCategory('grocery');
    setCreateProductOpen(true);
  };

  const handleSaveNewProduct = () => {
    if (!unrecognizedCode) return;
    const name = newProdName.trim();
    const priceNum = parseInt(newProdPrice.replace(/\D/g, ''), 10) || 0;
    const costNum = parseInt(newProdCost.replace(/\D/g, ''), 10) || Math.round(priceNum * 0.7);
    const stockNum = parseInt(newProdStock.replace(/\D/g, ''), 10) || 0;

    if (!name || priceNum <= 0) {
      toast('Vui lòng nhập tên và giá bán hợp lệ', 'err');
      return;
    }

    const newProd: Omit<Product, 'id'> = {
      name,
      price: priceNum,
      cost: costNum,
      stock: stockNum,
      tracked: true,
      category: newProdCategory,
      aliases: [name],
      barcode: unrecognizedCode,
    };

    const newId = app.addProduct(newProd);
    toast(`Đã tạo sản phẩm “${name}”`);

    const createdProduct: Product = { ...newProd, id: newId };
    setCreateProductOpen(false);

    // Open POS Keypad for the newly created product so user selects quantity!
    setActiveProductForQty({
      product: createdProduct,
      barcode: unrecognizedCode,
    });
    setQtyInput('');
    setUnrecognizedCode(null);
  };

  const laserTranslateY = laserAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 480],
  });

  const parsedQtyNumber = parseInt(qtyInput, 10) || 0;
  const currentSubtotal = activeProductForQty ? activeProductForQty.product.price * parsedQtyNumber : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Top Header Bar */}
        <Row style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn} hitSlop={10}>
            <Feather name="x" size={22} color={colors.white} />
          </Pressable>

          <View style={{ flex: 1, alignItems: 'center' }}>
            <Row gap={6} style={{ alignItems: 'center' }}>
              <BarcodeIcon size={18} color={colors.accent} />
              <T w="bold" size={16} color={colors.white}>
                {title}
              </T>
            </Row>
            <Row gap={6} style={{ alignItems: 'center', marginTop: 2 }}>
              <View style={styles.posStatusDot} />
              <T w="bold" size={11} color="rgba(255,255,255,0.75)">
                {activeProductForQty ? 'ĐANG CHỌN SỐ LƯỢNG' : 'SẴN SÀNG QUÉT'}
              </T>
            </Row>
          </View>

          <Row gap={8}>
            {activeTab === 'camera' && !activeProductForQty && (
              <>
                <Pressable onPress={toggleTorch} style={styles.headerBtn} hitSlop={10}>
                  <Feather name={torchOn ? 'sun' : 'zap'} size={18} color={torchOn ? colors.accent : colors.white} />
                </Pressable>
                <Pressable onPress={toggleCameraFacing} style={styles.headerBtn} hitSlop={10}>
                  <Feather name="refresh-cw" size={18} color={colors.white} />
                </Pressable>
              </>
            )}
          </Row>
        </Row>

        {/* Mode Switcher Tabs (Camera vs Manual) */}
        {!activeProductForQty && (
          <View style={styles.tabRow}>
            <Pressable
              onPress={() => setActiveTab('camera')}
              style={[styles.tabBtn, activeTab === 'camera' && styles.tabBtnActive]}
            >
              <Feather
                name="camera"
                size={15}
                color={activeTab === 'camera' ? colors.accentInk : 'rgba(255,255,255,0.7)'}
              />
              <T w="bold" size={13} color={activeTab === 'camera' ? colors.accentInk : 'rgba(255,255,255,0.7)'}>
                Camera Quét ML Kit
              </T>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('manual')}
              style={[styles.tabBtn, activeTab === 'manual' && styles.tabBtnActive]}
            >
              <Feather
                name="edit-3"
                size={15}
                color={activeTab === 'manual' ? colors.accentInk : 'rgba(255,255,255,0.7)'}
              />
              <T w="bold" size={13} color={activeTab === 'manual' ? colors.accentInk : 'rgba(255,255,255,0.7)'}>
                Nhập mã vạch tay
              </T>
            </Pressable>
          </View>
        )}

        {/* MAIN BODY AREA */}
        <View style={{ flex: 1, position: 'relative' }}>
          {activeTab === 'camera' ? (
            <View style={styles.cameraWrapper}>
              {/* Native Camera on iOS & Android */}
              {Platform.OS !== 'web' && (
                nativePermission?.granted ? (
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing={facingMode === 'environment' ? 'back' : 'front'}
                    enableTorch={torchOn}
                    barcodeScannerSettings={{
                      barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'qr', 'itf14'],
                    }}
                    onBarcodeScanned={(result) => {
                      if (result?.data && !activeProductForQty) {
                        handleDetectedBarcode(
                          result.data,
                          (result as any).bounds || ((result as any).cornerPoints ? { cornerPoints: (result as any).cornerPoints } : undefined),
                        );
                      }
                    }}
                  />
                ) : null
              )}

              {/* HTML5 Live Video Element on Web */}
              {Platform.OS === 'web' && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#000',
                  }}
                >
                  <video
                    ref={videoRef as any}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      opacity: activeProductForQty ? 0.35 : 1,
                    }}
                  />
                </div>
              )}

              {/* Live Target Lock Animation */}
              {detectedBounds && (
                <Animated.View
                  style={[
                    styles.detectedHighlightBox,
                    {
                      left: Math.max(10, detectedBounds.x),
                      top: Math.max(10, detectedBounds.y),
                      width: Math.max(80, detectedBounds.width),
                      height: Math.max(40, detectedBounds.height),
                      opacity: lockAnim,
                      transform: [
                        {
                          scale: lockAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.85, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                  pointerEvents="none"
                >
                  <View style={styles.lockCornerTL} />
                  <View style={styles.lockCornerTR} />
                  <View style={styles.lockCornerBL} />
                  <View style={styles.lockCornerBR} />
                  <View style={styles.lockBadge}>
                    <Feather name="check" size={11} color={colors.accentInk} />
                    <T w="bold" size={10} color={colors.accentInk}>
                      ML KIT LOCKED
                    </T>
                  </View>
                </Animated.View>
              )}

              {/* HUD Overlay with Laser Line (Only when not in keypad mode) */}
              {!activeProductForQty && (
                <View style={styles.hudOverlay} pointerEvents="none">
                  <View style={styles.omniGuideBadge}>
                    <Feather name="maximize-2" size={13} color={colors.accent} />
                    <T w="semibold" size={12} color={colors.white}>
                      Tự động quét 360° · Đưa mã vào camera
                    </T>
                  </View>

                  <Animated.View
                    style={[
                      styles.fullLaserLine,
                      {
                        transform: [{ translateY: laserTranslateY }],
                      },
                    ]}
                  />

                  <View style={styles.bottomHintBox}>
                    <T size={12} color="rgba(255,255,255,0.9)" style={styles.targetHint}>
                      Quét mã xong máy sẽ mở bàn phím số để chọn số lượng
                    </T>
                  </View>
                </View>
              )}

              {/* Permission Request Fallback */}
              {((Platform.OS !== 'web' && !nativePermission?.granted) ||
                (Platform.OS === 'web' && webCameraPermission === false)) && (
                <View style={styles.noCameraBox}>
                  <Feather name="camera-off" size={40} color={colors.goldBright} />
                  <T w="bold" size={16} color={colors.white} style={{ marginTop: 12 }}>
                    Cần quyền truy cập Camera
                  </T>
                  <T size={13} color="rgba(255,255,255,0.7)" style={{ textAlign: 'center', marginTop: 6, paddingHorizontal: 20 }}>
                    {Platform.OS !== 'web'
                      ? 'Ứng dụng cần quyền Camera để quét mã vạch sản phẩm.'
                      : 'Vui lòng cấp quyền Camera trong trình duyệt hoặc dùng tính năng nhập mã vạch bằng tay.'}
                  </T>
                  <Row gap={10} style={{ marginTop: 18 }}>
                    <Button
                      title="Cấp quyền Camera"
                      variant="primary"
                      small
                      onPress={() => {
                        if (Platform.OS !== 'web') {
                          requestNativePermission();
                        } else {
                          startWebCamera();
                        }
                      }}
                    />
                    <Button title="Nhập tay" variant="gold" small onPress={() => setActiveTab('manual')} />
                  </Row>
                </View>
              )}

              {/* Photo Upload Shortcut on Web */}
              {!activeProductForQty && Platform.OS === 'web' && (
                <View style={styles.cameraBottomTools}>
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                    <View style={styles.photoUploadBtn}>
                      <Feather name="image" size={15} color={colors.white} />
                      <T w="semibold" size={12} color={colors.white}>
                        Quét từ ảnh
                      </T>
                    </View>
                  </label>
                </View>
              )}
            </View>
          ) : (
            /* MANUAL BARCODE INPUT VIEW */
            <ScrollView contentContainerStyle={styles.manualContainer} keyboardShouldPersistTaps="handled">
              <View style={styles.manualCard}>
                <Row gap={8} style={{ marginBottom: 10 }}>
                  <BarcodeIcon size={22} color={colors.primary} />
                  <T w="bold" size={16}>
                    Nhập mã vạch thủ công
                  </T>
                </Row>
                <T size={13} color={colors.muted} style={{ marginBottom: 14 }}>
                  Nhập mã số in bên dưới barcode trên bao bì (VD: 8934588012112)
                </T>

                <Field
                  placeholder="VD: 8934563138164"
                  keyboardType="number-pad"
                  value={manualCode}
                  onChangeText={setManualCode}
                  autoFocus
                  inputStyle={{ fontFamily: font.bold, fontSize: 18, letterSpacing: 1 }}
                  style={{ marginBottom: 14 }}
                />

                <Button
                  title="Tìm sản phẩm & Chọn số lượng"
                  icon="search"
                  disabled={!manualCode.trim()}
                  onPress={handleManualSubmit}
                />
              </View>

              {/* Demo Shortcuts */}
              <View style={styles.demoBox}>
                <T w="bold" size={13} color={colors.muted} style={{ marginBottom: 8 }}>
                  Mã vạch mẫu để thử nghiệm nhanh:
                </T>
                <View style={styles.demoChipsWrap}>
                  {DEMO_PRESETS.map((preset) => (
                    <Pressable
                      key={preset.code}
                      onPress={() => {
                        setManualCode(preset.code);
                        handleDetectedBarcode(preset.code);
                      }}
                      style={({ pressed }) => [styles.demoChip, pressed && { opacity: 0.7 }]}
                    >
                      <T w="semibold" size={12} color={colors.primary}>
                        {preset.label}
                      </T>
                      <T size={11} color={colors.faint}>
                        {preset.code}
                      </T>
                    </Pressable>
                  ))}
                </View>
              </View>
            </ScrollView>
          )}

          {/* ========================================================================= */}
          {/* POS NUMPAD QUANTITY INPUT TERMINAL OVERLAY */}
          {/* ========================================================================= */}
          {activeProductForQty && (
            <Animated.View
              style={[
                styles.posKeypadOverlay,
                {
                  transform: [
                    {
                      translateY: keypadSlideAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [600, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              {/* POS Terminal Header */}
              <View style={styles.posTerminalHeader}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Row gap={6} style={{ alignItems: 'center' }}>
                    <View style={styles.posTerminalLedDot} />
                    <T w="extrabold" size={12} color={colors.accent} style={{ letterSpacing: 0.5 }}>
                      BÀN PHÍM SỐ LƯỢNG POS
                    </T>
                  </Row>
                  <Pressable onPress={handleCancelQuantityInput} hitSlop={8} style={styles.posCloseBtn}>
                    <Feather name="x" size={18} color="rgba(255,255,255,0.7)" />
                  </Pressable>
                </Row>

                {/* Scanned Product Info Card */}
                <View style={styles.posProductCard}>
                  <Row gap={12} style={{ alignItems: 'center' }}>
                    <View style={styles.posProductIcon}>
                      <Feather name="package" size={22} color={colors.accentInk} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T w="extrabold" size={16} color={colors.white} numberOfLines={1}>
                        {activeProductForQty.product.name}
                      </T>
                      <Row gap={8} style={{ alignItems: 'center', marginTop: 3 }}>
                        <T w="bold" size={14} color={colors.accent}>
                          {vnd(activeProductForQty.product.price)}
                        </T>
                        <T size={11} color="rgba(255,255,255,0.6)">
                          Mã: {formatBarcode(activeProductForQty.barcode)}
                        </T>
                        {activeProductForQty.product.tracked && (
                          <T size={11} color="rgba(255,255,255,0.6)">
                            · Tồn: {activeProductForQty.product.stock}
                          </T>
                        )}
                      </Row>
                    </View>
                  </Row>
                </View>
              </View>

              {/* POS LCD Display Screen */}
              <View style={styles.posDisplayScreen}>
                <View style={{ flex: 1 }}>
                  <T w="bold" size={11} color="rgba(143, 219, 110, 0.8)" style={{ letterSpacing: 0.5 }}>
                    SỐ LƯỢNG MÓN
                  </T>
                  <Row gap={8} style={{ alignItems: 'baseline', marginTop: 2 }}>
                    <T w="extrabold" size={32} color={parsedQtyNumber > 0 ? colors.accent : 'rgba(255,255,255,0.3)'}>
                      {qtyInput || '_'}
                    </T>
                    {parsedQtyNumber > 0 ? (
                      <T size={13} color="rgba(255,255,255,0.75)">
                        × {vnd(activeProductForQty.product.price)}
                      </T>
                    ) : (
                      <T size={12} color="rgba(255,255,255,0.4)">
                        (Nhập số lượng bằng phím bên dưới)
                      </T>
                    )}
                  </Row>
                </View>

                {/* Live Total / Subtotal Screen */}
                <View style={{ alignItems: 'flex-end' }}>
                  <T w="bold" size={11} color="rgba(143, 219, 110, 0.8)">
                    THÀNH TIỀN
                  </T>
                  <T w="extrabold" size={20} color={parsedQtyNumber > 0 ? colors.white : 'rgba(255,255,255,0.4)'} style={{ marginTop: 4 }}>
                    {vnd(currentSubtotal)}
                  </T>
                </View>
              </View>

              {/* Quick Quantity Presets */}
              <View style={styles.quickPresetsWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickPresetsScroll}>
                  <T w="bold" size={11} color="rgba(255,255,255,0.5)" style={{ alignSelf: 'center', marginRight: 4 }}>
                    Chọn nhanh:
                  </T>
                  {QUICK_QTY_PRESETS.map((preset) => (
                    <Pressable
                      key={preset}
                      onPress={() => handleQuickQtyPreset(preset)}
                      style={({ pressed }) => [
                        styles.quickPresetBtn,
                        parsedQtyNumber === preset && styles.quickPresetBtnActive,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <T
                        w="bold"
                        size={13}
                        color={parsedQtyNumber === preset ? colors.accentInk : colors.white}
                      >
                        {preset}
                      </T>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => handleAdjustQtyDelta(1)}
                    style={({ pressed }) => [styles.quickPresetBtn, styles.quickStepBtn, pressed && { opacity: 0.7 }]}
                  >
                    <T w="bold" size={13} color={colors.accent}>
                      +1
                    </T>
                  </Pressable>
                  <Pressable
                    onPress={() => handleAdjustQtyDelta(5)}
                    style={({ pressed }) => [styles.quickPresetBtn, styles.quickStepBtn, pressed && { opacity: 0.7 }]}
                  >
                    <T w="bold" size={13} color={colors.accent}>
                      +5
                    </T>
                  </Pressable>
                </ScrollView>
              </View>

              {/* POS Numeric Keypad Grid */}
              <View style={styles.posKeypadGrid}>
                {/* Row 1 */}
                <View style={styles.keypadRow}>
                  {['1', '2', '3'].map((key) => (
                    <Pressable
                      key={key}
                      onPress={() => handleKeypadPress(key)}
                      style={({ pressed }) => [styles.keypadBtn, pressed && styles.keypadBtnPressed]}
                    >
                      <T w="bold" size={24} color={colors.white}>
                        {key}
                      </T>
                    </Pressable>
                  ))}
                </View>

                {/* Row 2 */}
                <View style={styles.keypadRow}>
                  {['4', '5', '6'].map((key) => (
                    <Pressable
                      key={key}
                      onPress={() => handleKeypadPress(key)}
                      style={({ pressed }) => [styles.keypadBtn, pressed && styles.keypadBtnPressed]}
                    >
                      <T w="bold" size={24} color={colors.white}>
                        {key}
                      </T>
                    </Pressable>
                  ))}
                </View>

                {/* Row 3 */}
                <View style={styles.keypadRow}>
                  {['7', '8', '9'].map((key) => (
                    <Pressable
                      key={key}
                      onPress={() => handleKeypadPress(key)}
                      style={({ pressed }) => [styles.keypadBtn, pressed && styles.keypadBtnPressed]}
                    >
                      <T w="bold" size={24} color={colors.white}>
                        {key}
                      </T>
                    </Pressable>
                  ))}
                </View>

                {/* Row 4: Clear, 0, Backspace */}
                <View style={styles.keypadRow}>
                  <Pressable
                    onPress={handleKeypadClear}
                    style={({ pressed }) => [styles.keypadBtn, styles.keypadActionBtn, pressed && styles.keypadBtnPressed]}
                  >
                    <T w="extrabold" size={16} color={colors.red}>
                      C
                    </T>
                    <T size={10} color={colors.red} style={{ marginTop: 2 }}>
                      Xóa
                    </T>
                  </Pressable>

                  <Pressable
                    onPress={() => handleKeypadPress('0')}
                    style={({ pressed }) => [styles.keypadBtn, pressed && styles.keypadBtnPressed]}
                  >
                    <T w="bold" size={24} color={colors.white}>
                      0
                    </T>
                  </Pressable>

                  <Pressable
                    onPress={handleKeypadBackspace}
                    style={({ pressed }) => [styles.keypadBtn, styles.keypadActionBtn, pressed && styles.keypadBtnPressed]}
                  >
                    <Feather name="delete" size={20} color="rgba(255,255,255,0.85)" />
                  </Pressable>
                </View>
              </View>

              {/* Action Buttons: Cancel / Confirm */}
              <Row gap={10} style={styles.posBottomActions}>
                <Pressable
                  onPress={handleCancelQuantityInput}
                  style={({ pressed }) => [styles.posCancelBtn, pressed && { opacity: 0.7 }]}
                >
                  <T w="bold" size={14} color="rgba(255,255,255,0.8)">
                    Bỏ qua
                  </T>
                </Pressable>

                <Pressable
                  onPress={handleConfirmQuantity}
                  disabled={parsedQtyNumber <= 0}
                  style={({ pressed }) => [
                    styles.posConfirmBtn,
                    parsedQtyNumber <= 0 && styles.posConfirmBtnDisabled,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Feather
                    name="plus-circle"
                    size={18}
                    color={parsedQtyNumber > 0 ? colors.accentInk : 'rgba(255,255,255,0.4)'}
                  />
                  <T
                    w="extrabold"
                    size={15}
                    color={parsedQtyNumber > 0 ? colors.accentInk : 'rgba(255,255,255,0.4)'}
                  >
                    {parsedQtyNumber > 0
                      ? `Thêm ${parsedQtyNumber} món · ${vnd(currentSubtotal)}`
                      : 'Chọn số lượng để thêm'}
                  </T>
                </Pressable>
              </Row>
            </Animated.View>
          )}

          {/* ========================================================================= */}
          {/* UNRECOGNIZED BARCODE DIALOG CARD */}
          {/* ========================================================================= */}
          {unrecognizedCode && !activeProductForQty && (
            <View style={styles.unrecognizedCard}>
              <Row gap={12} style={{ alignItems: 'flex-start' }}>
                <View style={styles.unrecognizedIcon}>
                  <Feather name="alert-circle" size={22} color={colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <T w="bold" size={15} color={colors.ink}>
                    Mã vạch chưa có trong danh mục
                  </T>
                  <View style={styles.codeBadge}>
                    <BarcodeIcon size={14} color={colors.muted} />
                    <T w="bold" size={13} color={colors.ink}>
                      {formatBarcode(unrecognizedCode)}
                    </T>
                  </View>
                  <T size={12} color={colors.muted} style={{ marginTop: 6 }}>
                    Sản phẩm này chưa được tạo trong tiệm. Tạo mới để quét và chọn số lượng ngay.
                  </T>
                </View>
              </Row>
              <Row gap={10} style={{ marginTop: 14 }}>
                <Button
                  title="Quét mã khác"
                  variant="outline"
                  small
                  style={{ flex: 1 }}
                  onPress={() => setUnrecognizedCode(null)}
                />
                {allowCreateNew && (
                  <Button
                    title="Tạo sản phẩm ngay"
                    icon="plus"
                    variant="primary"
                    small
                    style={{ flex: 1 }}
                    onPress={openCreateProductSheet}
                  />
                )}
              </Row>
            </View>
          )}
        </View>

        {/* ========================================================================= */}
        {/* BOTTOM REAL-TIME POS CART SUMMARY BAR (When not in keypad mode) */}
        {/* ========================================================================= */}
        {!activeProductForQty && mode === 'order' && (
          <View style={styles.posCartStatusBar}>
            {recentScans.length > 0 && (
              <View style={styles.recentScanRibbon}>
                <Feather name="check-circle" size={12} color={colors.accent} />
                <T size={11} color="rgba(255,255,255,0.85)" numberOfLines={1} style={{ flex: 1 }}>
                  Vừa thêm: <T w="bold" color={colors.accent}>{recentScans[0].qty}x {recentScans[0].name}</T> ({vnd(recentScans[0].total)})
                </T>
              </View>
            )}

            <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <T size={11} color="rgba(255,255,255,0.6)">
                  Đơn hàng hiện tại
                </T>
                <Row gap={6} style={{ alignItems: 'baseline', marginTop: 1 }}>
                  <T w="extrabold" size={18} color={colors.accent}>
                    {vnd(cartSummary.totalMoney)}
                  </T>
                  <T size={12} color="rgba(255,255,255,0.8)">
                    ({cartSummary.totalItems} món)
                  </T>
                </Row>
              </View>

              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.viewCartBtn, pressed && { opacity: 0.8 }]}
              >
                <Feather name="shopping-cart" size={15} color={colors.accentInk} />
                <T w="bold" size={13} color={colors.accentInk}>
                  Xem đơn / Hoàn tất
                </T>
              </Pressable>
            </Row>
          </View>
        )}

        {/* CREATE NEW PRODUCT SHEET PRE-FILLED WITH BARCODE */}
        <Sheet
          visible={createProductOpen}
          onClose={() => setCreateProductOpen(false)}
          title="Tạo sản phẩm từ mã vạch"
        >
          <View style={styles.sheetCodeBox}>
            <BarcodeIcon size={18} color={colors.primary} />
            <T w="bold" size={14} color={colors.primary}>
              Mã vạch: {formatBarcode(unrecognizedCode || '')}
            </T>
          </View>

          <Field
            label="Tên sản phẩm"
            placeholder="VD: Bánh snack khoai tây"
            value={newProdName}
            onChangeText={setNewProdName}
          />

          <Row gap={10} style={{ alignItems: 'flex-start' }}>
            <Field
              label="Giá bán (đ)"
              placeholder="VD: 15000"
              keyboardType="number-pad"
              value={newProdPrice}
              onChangeText={setNewProdPrice}
              style={{ flex: 1 }}
            />
            <Field
              label="Giá vốn (đ)"
              placeholder="Tuỳ chọn"
              keyboardType="number-pad"
              value={newProdCost}
              onChangeText={setNewProdCost}
              style={{ flex: 1 }}
            />
          </Row>

          <Field
            label="Số lượng tồn ban đầu"
            placeholder="20"
            keyboardType="number-pad"
            value={newProdStock}
            onChangeText={setNewProdStock}
          />

          <Button
            title="Lưu & Nhập số lượng bán"
            icon="arrow-right"
            disabled={!newProdName.trim() || !parseInt(newProdPrice, 10)}
            onPress={handleSaveNewProduct}
            style={{ marginTop: 12 }}
          />
        </Sheet>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0D0B',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(10, 13, 11, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 10,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabBtnActive: {
    backgroundColor: colors.accent,
  },
  cameraWrapper: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  hudOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  omniGuideBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(10, 13, 11, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(143, 219, 110, 0.4)',
    alignSelf: 'center',
  },
  fullLaserLine: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 2.5,
    backgroundColor: colors.accent,
    borderRadius: 2,
    opacity: 0.9,
    ...Platform.select({
      web: {
        boxShadow: '0 0 14px #8FDB6E, 0 0 28px #8FDB6E',
      } as any,
    }),
  },
  bottomHintBox: {
    alignItems: 'center',
    marginBottom: 20,
  },
  targetHint: {
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  detectedHighlightBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: 'rgba(143, 219, 110, 0.25)',
    borderRadius: 8,
    zIndex: 99,
  },
  lockCornerTL: { position: 'absolute', top: -3, left: -3, width: 10, height: 10, borderTopWidth: 3, borderLeftWidth: 3, borderColor: colors.accent },
  lockCornerTR: { position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderTopWidth: 3, borderRightWidth: 3, borderColor: colors.accent },
  lockCornerBL: { position: 'absolute', bottom: -3, left: -3, width: 10, height: 10, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: colors.accent },
  lockCornerBR: { position: 'absolute', bottom: -3, right: -3, width: 10, height: 10, borderBottomWidth: 3, borderRightWidth: 3, borderColor: colors.accent },
  lockBadge: {
    position: 'absolute',
    top: -24,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  noCameraBox: {
    position: 'absolute',
    top: '20%',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(20,24,22,0.96)',
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  cameraBottomTools: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  photoUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
  },
  manualContainer: {
    padding: 16,
    gap: 16,
  },
  manualCard: {
    backgroundColor: colors.white,
    padding: 18,
    borderRadius: 18,
    ...shadow(2),
  },
  demoBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    borderRadius: 16,
  },
  demoChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  demoChip: {
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },

  /* POS KEYPAD STYLES */
  posKeypadOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    backgroundColor: 'rgba(12, 16, 13, 0.98)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderTopColor: colors.accent,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    justifyContent: 'space-between',
    zIndex: 100,
    ...shadow(3),
  },
  posTerminalHeader: {
    gap: 8,
  },
  posTerminalLedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    ...Platform.select({
      web: {
        boxShadow: '0 0 8px #8FDB6E',
      } as any,
    }),
  },
  posCloseBtn: {
    padding: 4,
  },
  posProductCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  posProductIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posDisplayScreen: {
    backgroundColor: '#040705',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(143, 219, 110, 0.4)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 6,
    ...Platform.select({
      web: {
        boxShadow: 'inset 0 0 16px rgba(143, 219, 110, 0.1)',
      } as any,
    }),
  },
  quickPresetsWrap: {
    marginVertical: 4,
  },
  quickPresetsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickPresetBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  quickPresetBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  quickStepBtn: {
    backgroundColor: 'rgba(143, 219, 110, 0.18)',
    borderColor: 'rgba(143, 219, 110, 0.4)',
  },
  posKeypadGrid: {
    gap: 7,
    marginVertical: 4,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: 8,
  },
  keypadBtn: {
    flex: 1,
    height: 52,
    backgroundColor: '#1E2420',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    ...shadow(1),
  },
  keypadBtnPressed: {
    backgroundColor: '#303A33',
    borderColor: colors.accent,
  },
  keypadActionBtn: {
    backgroundColor: '#191D1A',
  },
  posBottomActions: {
    marginTop: 6,
    alignItems: 'center',
  },
  posCancelBtn: {
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posConfirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...shadow(2),
  },
  posConfirmBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  /* BOTTOM POS CART STATUS */
  posCartStatusBar: {
    backgroundColor: '#121714',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  recentScanRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(143, 219, 110, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(143, 219, 110, 0.25)',
  },
  viewCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },

  /* UNRECOGNIZED CARD */
  unrecognizedCard: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: colors.white,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.goldSoft,
    ...shadow(3),
    zIndex: 90,
  },
  unrecognizedIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  sheetCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primarySoft,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
});
