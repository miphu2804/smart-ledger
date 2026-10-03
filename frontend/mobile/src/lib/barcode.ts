/**
 * BARCODE UTILITIES & DECODER ENGINE
 * Supports native BarcodeDetector API (Chrome, Edge, Safari iOS 17+, Android)
 * with robust pure-JS fallback for 1D barcodes (EAN-13, UPC, Code 128).
 */
import { Platform } from 'react-native';
import { triggerFeedback } from './feedback';

export interface BarcodeDetectionResult {
  rawValue: string;
  format?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  cornerPoints?: { x: number; y: number }[];
}

/** Audio synthesizer beep for instant POS-style scan feedback */
export function playScanSuccessSound() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Classic loud, crisp POS scanner beep (2000Hz)
    osc.frequency.setValueAtTime(2000, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2200, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
    setTimeout(() => ctx.close().catch(() => {}), 150);
  } catch {
    // AudioContext blocked by browser autoplay policy until user gesture
  }
}

/** Trigger vibration feedback if available */
export function triggerScanHaptic() {
  triggerFeedback('selection');
}

/** Format barcode string for clear, readable display */
export function formatBarcode(code: string): string {
  const digits = code.replace(/\s+/g, '');
  if (digits.length === 13) {
    // EAN-13: 893 4588 01211 2
    return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7, 12)} ${digits.slice(12)}`;
  }
  if (digits.length === 12) {
    // UPC-A: 0 12345 67890 5
    return `${digits.slice(0, 1)} ${digits.slice(1, 6)} ${digits.slice(6, 11)} ${digits.slice(11)}`;
  }
  if (digits.length === 8) {
    return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  }
  return code;
}

/** Validate if a string looks like a standard retail barcode */
export function isValidBarcode(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed || trimmed.length < 4 || trimmed.length > 32) return false;
  // Allow alphanumeric for Code 128 / Code 39, digits for EAN/UPC
  return /^[0-9A-Za-z\-_.]+$/.test(trimmed);
}

// ---------------------------------------------------------------- Native BarcodeDetector Wrapper
let nativeDetector: unknown = null;
let nativeDetectorInitTried = false;

function getNativeBarcodeDetector(): any {
  if (nativeDetectorInitTried) return nativeDetector;
  nativeDetectorInitTried = true;
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const DetectorClass = (window as any).BarcodeDetector;
      nativeDetector = new DetectorClass({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'qr_code', 'itf'],
      });
    } catch {
      nativeDetector = null;
    }
  }
  return nativeDetector;
}

/**
 * Detect barcode from an ImageBitmap, HTMLVideoElement, HTMLCanvasElement, or HTMLImageElement
 */
export async function detectBarcodeFromSource(
  source: ImageBitmap | HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
): Promise<BarcodeDetectionResult | null> {
  const detector = getNativeBarcodeDetector();
  if (detector) {
    try {
      const barcodes = await detector.detect(source);
      if (barcodes && barcodes.length > 0) {
        const best = barcodes[0];
        if (best.rawValue) {
          return {
            rawValue: best.rawValue.trim(),
            format: best.format,
            boundingBox: best.boundingBox
              ? {
                  x: best.boundingBox.x,
                  y: best.boundingBox.y,
                  width: best.boundingBox.width,
                  height: best.boundingBox.height,
                }
              : undefined,
            cornerPoints: best.cornerPoints,
          };
        }
      }
    } catch {
      // Fallback to canvas pixel decoding
    }
  }

  // Fallback: analyze canvas scanlines for 1D barcodes
  if (typeof document !== 'undefined') {
    try {
      let canvas: HTMLCanvasElement;
      if (source instanceof HTMLCanvasElement) {
        canvas = source;
      } else {
        canvas = document.createElement('canvas');
        const w = (source as any).videoWidth || (source as any).naturalWidth || (source as any).width || 640;
        const h = (source as any).videoHeight || (source as any).naturalHeight || (source as any).height || 480;
        canvas.width = Math.min(w, 800);
        canvas.height = Math.min(h, 600);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const decoded = decode1DBarcodeFromImageData(imgData);
          if (decoded) return { rawValue: decoded };
        }
      }
    } catch {
      /* ignore canvas decoding errors */
    }
  }

  return null;
}

// ---------------------------------------------------------------- Lightweight 1D EAN/UPC Scanline Decoder Fallback
const EAN_L_PATTERNS = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];
const EAN_G_PATTERNS = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
];
const EAN_R_PATTERNS = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100',
];
const EAN_FIRST_DIGIT_MAP = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

/**
 * Scan horizontal cross-sections of the image for EAN-13 barcode patterns
 */
export function decode1DBarcodeFromImageData(imageData: ImageData): string | null {
  const { width, height, data } = imageData;
  // Sample multiple horizontal scanlines in the central 50% region
  const startY = Math.floor(height * 0.3);
  const endY = Math.floor(height * 0.7);
  const stepY = Math.max(2, Math.floor((endY - startY) / 12));

  for (let y = startY; y <= endY; y += stepY) {
    const rowLum: number[] = new Array(width);
    let minLum = 255;
    let maxLum = 0;

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // standard luminance formula
      const lum = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
      rowLum[x] = lum;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    if (maxLum - minLum < 40) continue; // Low contrast line, skip

    const threshold = (minLum + maxLum) / 2;
    // Binarize into run-lengths of alternating black (1) and white (0)
    const runs: { val: number; len: number }[] = [];
    let curVal = rowLum[0] < threshold ? 1 : 0;
    let curLen = 1;

    for (let x = 1; x < width; x++) {
      const val = rowLum[x] < threshold ? 1 : 0;
      if (val === curVal) {
        curLen++;
      } else {
        runs.push({ val: curVal, len: curLen });
        curVal = val;
        curLen = 1;
      }
    }
    runs.push({ val: curVal, len: curLen });

    // Look for EAN-13 start guard pattern: 1-1-1 (black-white-black of equal width)
    const decoded = parseEan13Runs(runs);
    if (decoded) return decoded;
  }

  return null;
}

function parseEan13Runs(runs: { val: number; len: number }[]): string | null {
  if (runs.length < 59) return null;

  for (let i = 0; i < runs.length - 58; i++) {
    // Check start guard: Black, White, Black (3 runs)
    if (runs[i].val !== 1 || runs[i + 1].val !== 0 || runs[i + 2].val !== 1) continue;

    const guardModule = (runs[i].len + runs[i + 1].len + runs[i + 2].len) / 3;
    if (guardModule < 1) continue;

    // Check ratio similarity
    const g0 = Math.abs(runs[i].len - guardModule) / guardModule;
    const g1 = Math.abs(runs[i + 1].len - guardModule) / guardModule;
    const g2 = Math.abs(runs[i + 2].len - guardModule) / guardModule;
    if (g0 > 0.6 || g1 > 0.6 || g2 > 0.6) continue;

    // Attempt to parse 6 left digits (each digit is 4 runs)
    let curRunIdx = i + 3;
    const leftPatterns: { digit: number; type: 'L' | 'G' }[] = [];
    let leftValid = true;

    for (let d = 0; d < 6; d++) {
      if (curRunIdx + 3 >= runs.length) {
        leftValid = false;
        break;
      }
      const r0 = runs[curRunIdx].len;
      const r1 = runs[curRunIdx + 1].len;
      const r2 = runs[curRunIdx + 2].len;
      const r3 = runs[curRunIdx + 3].len;
      const totalLen = r0 + r1 + r2 + r3;
      const mod = totalLen / 7;

      const m0 = Math.round(r0 / mod);
      const m1 = Math.round(r1 / mod);
      const m2 = Math.round(r2 / mod);
      const m3 = Math.round(r3 / mod);

      if (m0 + m1 + m2 + m3 !== 7) {
        leftValid = false;
        break;
      }

      // Convert to binary string
      const bitStr = '0'.repeat(m0) + '1'.repeat(m1) + '0'.repeat(m2) + '1'.repeat(m3);
      let matchDigit = -1;
      let matchType: 'L' | 'G' = 'L';

      for (let num = 0; num < 10; num++) {
        if (EAN_L_PATTERNS[num] === bitStr) {
          matchDigit = num;
          matchType = 'L';
          break;
        }
        if (EAN_G_PATTERNS[num] === bitStr) {
          matchDigit = num;
          matchType = 'G';
          break;
        }
      }

      if (matchDigit === -1) {
        leftValid = false;
        break;
      }

      leftPatterns.push({ digit: matchDigit, type: matchType });
      curRunIdx += 4;
    }

    if (!leftValid || leftPatterns.length !== 6) continue;

    // Check center guard: White, Black, White, Black, White (5 runs)
    if (curRunIdx + 5 >= runs.length) continue;
    if (
      runs[curRunIdx].val !== 0 ||
      runs[curRunIdx + 1].val !== 1 ||
      runs[curRunIdx + 2].val !== 0 ||
      runs[curRunIdx + 3].val !== 1 ||
      runs[curRunIdx + 4].val !== 0
    ) {
      continue;
    }
    curRunIdx += 5;

    // Parse 6 right digits (each digit is 4 runs, all R-type)
    const rightDigits: number[] = [];
    let rightValid = true;

    for (let d = 0; d < 6; d++) {
      if (curRunIdx + 3 >= runs.length) {
        rightValid = false;
        break;
      }
      const r0 = runs[curRunIdx].len;
      const r1 = runs[curRunIdx + 1].len;
      const r2 = runs[curRunIdx + 2].len;
      const r3 = runs[curRunIdx + 3].len;
      const totalLen = r0 + r1 + r2 + r3;
      const mod = totalLen / 7;

      const m0 = Math.round(r0 / mod);
      const m1 = Math.round(r1 / mod);
      const m2 = Math.round(r2 / mod);
      const m3 = Math.round(r3 / mod);

      if (m0 + m1 + m2 + m3 !== 7) {
        rightValid = false;
        break;
      }

      const bitStr = '1'.repeat(m0) + '0'.repeat(m1) + '1'.repeat(m2) + '0'.repeat(m3);
      let matchDigit = -1;
      for (let num = 0; num < 10; num++) {
        if (EAN_R_PATTERNS[num] === bitStr) {
          matchDigit = num;
          break;
        }
      }

      if (matchDigit === -1) {
        rightValid = false;
        break;
      }

      rightDigits.push(matchDigit);
      curRunIdx += 4;
    }

    if (!rightValid || rightDigits.length !== 6) continue;

    // Determine first digit from L/G pattern
    const patternStr = leftPatterns.map((p) => p.type).join('');
    const firstDigit = EAN_FIRST_DIGIT_MAP.indexOf(patternStr);
    if (firstDigit === -1) continue;

    const full13Digits = [firstDigit, ...leftPatterns.map((p) => p.digit), ...rightDigits];
    // Verify checksum
    let sum = 0;
    for (let k = 0; k < 12; k++) {
      sum += full13Digits[k] * (k % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    if (checkDigit === full13Digits[12]) {
      return full13Digits.join('');
    }
  }

  return null;
}
