import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { choosePictureSize, fitsCoreLimits, type PickedImage } from '../lib/productPhoto';
import { colors } from '../theme';
import { T } from './ui';

/**
 * Màn chụp ảnh mặt hàng (Android/iOS): dùng camera có sẵn của app (expo-camera), không cần thư viện chọn ảnh.
 * Camera được đặt ở cỡ ảnh nằm trong giới hạn của Core (mỗi cạnh ≤ 2048 px) vì app chưa thu nhỏ được ảnh trên máy.
 * Trên web không dùng màn này: `pickImageOnWeb` mở hộp chọn file của trình duyệt.
 */
export function ProductPhotoCamera({
  visible,
  onClose,
  onPicked,
}: {
  visible: boolean;
  onClose: () => void;
  onPicked: (image: PickedImage) => void;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (visible && !permission?.granted) requestPermission().catch(() => {});
  }, [visible, permission, requestPermission]);

  useEffect(() => {
    if (visible) return;
    setReady(false);
    setBusy(false);
    setErr('');
  }, [visible]);

  const onCameraReady = async () => {
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
      setPictureSize(choosePictureSize(sizes ?? []));
    } catch {
      /* giữ cỡ mặc định của máy; ảnh vượt giới hạn sẽ bị chặn sau khi chụp */
    }
    setReady(true);
  };

  const shoot = async () => {
    if (!cameraRef.current || !ready || busy) return;
    setBusy(true);
    setErr('');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (!fitsCoreLimits(photo.width, photo.height)) {
        setErr(`Ảnh chụp được (${photo.width}×${photo.height}) lớn hơn giới hạn 2048 px mỗi cạnh nên chưa lưu được.`);
        return;
      }
      onPicked({ uri: photo.uri, width: photo.width, height: photo.height, mimeType: 'image/jpeg' });
    } catch {
      setErr('Không chụp được ảnh. Vui lòng thử lại');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} hitSlop={14} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Đóng">
            <Feather name="x" size={20} color="#FFFFFF" />
          </Pressable>
          <T w="bold" size={15} color="#FFFFFF">
            Chụp ảnh mặt hàng
          </T>
          <Pressable
            onPress={() => {
              setReady(false);
              setFacing((current) => (current === 'back' ? 'front' : 'back'));
            }}
            hitSlop={14}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Đổi camera"
          >
            <Feather name="refresh-cw" size={18} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.preview}>
          {permission?.granted ? (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
              pictureSize={pictureSize}
              onCameraReady={onCameraReady}
              onMountError={() => setErr('Không mở được camera. Vui lòng thử lại')}
            />
          ) : (
            <View style={styles.noCamera}>
              <Feather name="camera-off" size={26} color="rgba(255,255,255,0.4)" />
              <T size={13} color="rgba(255,255,255,0.6)" style={{ marginTop: 8 }}>
                Cần cấp quyền Camera
              </T>
              <Pressable onPress={() => requestPermission()} style={styles.permBtn} accessibilityRole="button">
                <T w="bold" size={13} color={colors.brandInk}>
                  Cấp quyền
                </T>
              </Pressable>
            </View>
          )}
        </View>

        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          {err ? (
            <T size={12.5} color="#FFB4A8" style={{ textAlign: 'center', marginBottom: 12 }}>
              {err}
            </T>
          ) : (
            <T size={12.5} color="rgba(255,255,255,0.6)" style={{ textAlign: 'center', marginBottom: 12 }}>
              Đưa mặt hàng vào giữa khung rồi bấm nút chụp
            </T>
          )}
          <Pressable
            onPress={shoot}
            disabled={!ready || busy || !permission?.granted}
            style={({ pressed }) => [styles.shutter, (!ready || busy || !permission?.granted) && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.95 }] }]}
            accessibilityRole="button"
            accessibilityLabel="Chụp ảnh"
          >
            {busy ? <ActivityIndicator color={colors.ink} /> : <View style={styles.shutterInner} />}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F1014' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  preview: { flex: 1, marginHorizontal: 12, borderRadius: 28, overflow: 'hidden', backgroundColor: '#000000' },
  noCamera: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  permBtn: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.brand },
  bottomBar: { paddingTop: 16, paddingHorizontal: 24, alignItems: 'center' },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF' },
});
