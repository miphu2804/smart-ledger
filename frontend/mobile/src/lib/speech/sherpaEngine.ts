import { PermissionsAndroid, Platform, TurboModuleRegistry } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { STT_MODEL_URL } from '../../config';
import { debugLog } from '../debug';
import {
  cleanTranscript,
  concatSamples,
  downloadPercent,
  joinTranscript,
  micLevel,
  missingModelFiles,
  modelFileUrl,
  STT_MODEL_FILES,
  STT_MODEL_VERSION,
  STT_SAMPLE_RATE,
} from './core';
import type { PrepareProgress, SpeechCallbacks, SpeechEngine, SpeechSession } from './types';

type SherpaRoot = typeof import('react-native-sherpa-onnx');
type SherpaStt = typeof import('react-native-sherpa-onnx/stt');
type SherpaAudio = typeof import('react-native-sherpa-onnx/audio');
type StreamingEngine = Awaited<ReturnType<SherpaStt['createStreamingSTT']>>;

/**
 * Chỉ nạp thư viện khi cần: bản dev client cũ chưa có mô-đun native `SherpaOnnx`, và `import` thẳng sẽ làm sập màn hình
 * ngay lúc mở. `supported` cho biết bản app đang chạy có mô-đun hay không.
 */
const loadRoot = (): SherpaRoot => require('react-native-sherpa-onnx');
const loadStt = (): SherpaStt => require('react-native-sherpa-onnx/stt');
const loadAudio = (): SherpaAudio => require('react-native-sherpa-onnx/audio');

const supported = Platform.OS === 'android' && TurboModuleRegistry.get('SherpaOnnx') != null;

let engine: StreamingEngine | null = null;
let preparing: Promise<void> | null = null;
const progressListeners = new Set<(p: PrepareProgress) => void>();
const report = (p: PrepareProgress) => progressListeners.forEach((fn) => fn(p));

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function requestPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(permission)) return true;
  const result = await PermissionsAndroid.request(permission, {
    title: 'Cho phép dùng micro',
    message: 'Sổ Nghe Lời dùng micro để nghe bạn đọc đơn hàng.',
    buttonPositive: 'Đồng ý',
    buttonNegative: 'Không',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/** Tải các file model còn thiếu về bộ nhớ của app, trả về thư mục chứa model (đường dẫn tuyệt đối, không có `file://`). */
async function ensureModelFiles(): Promise<string> {
  const base = FileSystem.documentDirectory;
  if (!base) throw new Error('Không truy cập được bộ nhớ của app để lưu model giọng nói.');
  const dir = `${base}stt-model-${STT_MODEL_VERSION}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);

  const sizes: Record<string, number | null> = {};
  for (const f of STT_MODEL_FILES) {
    const info = await FileSystem.getInfoAsync(dir + f.name);
    sizes[f.name] = info.exists && !info.isDirectory ? info.size : null;
  }
  const missing = missingModelFiles(sizes);
  if (missing.length === 0) return dir.replace(/^file:\/\//, '');

  if (!STT_MODEL_URL) {
    throw new Error('Chưa có model giọng nói trên máy và chưa đặt EXPO_PUBLIC_STT_MODEL_URL để tải (xem assets/models/README.md).');
  }
  let done = STT_MODEL_FILES.filter((f) => !missing.includes(f)).reduce((n, f) => n + f.bytes, 0);
  report({ stage: 'download', percent: downloadPercent(done, 0) });
  for (const f of missing) {
    const target = dir + f.name;
    const part = `${target}.part`;
    await FileSystem.deleteAsync(part, { idempotent: true });
    const url = modelFileUrl(STT_MODEL_URL, f.name);
    debugLog('stt', 'tải model', f.name, `${f.bytes} B`);
    const task = FileSystem.createDownloadResumable(url, part, {}, (p) =>
      report({ stage: 'download', percent: downloadPercent(done, p.totalBytesWritten) }),
    );
    let result;
    try {
      result = await task.downloadAsync();
    } catch (e) {
      throw new Error(`Không tải được model từ ${STT_MODEL_URL} (${errText(e)}). Kiểm tra máy chủ và mạng.`);
    }
    if (!result || result.status !== 200) {
      await FileSystem.deleteAsync(part, { idempotent: true });
      throw new Error(`Máy chủ model trả mã ${result ? result.status : '?'} cho ${f.name}.`);
    }
    const info = await FileSystem.getInfoAsync(part);
    const got = info.exists && !info.isDirectory ? info.size : -1;
    if (got !== f.bytes) {
      await FileSystem.deleteAsync(part, { idempotent: true });
      throw new Error(`File ${f.name} tải về sai kích thước (${got} thay vì ${f.bytes} byte).`);
    }
    await FileSystem.deleteAsync(target, { idempotent: true });
    await FileSystem.moveAsync({ from: part, to: target });
    done += f.bytes;
    report({ stage: 'download', percent: downloadPercent(done, 0) });
  }
  return dir.replace(/^file:\/\//, '');
}

function prepare(onProgress?: (p: PrepareProgress) => void): Promise<void> {
  if (!supported) return Promise.reject(new Error('Bản app này chưa có mô-đun giọng nói. Cài bản dev client mới.'));
  if (onProgress) progressListeners.add(onProgress);
  if (engine) {
    if (onProgress) progressListeners.delete(onProgress);
    return Promise.resolve();
  }
  if (!preparing) {
    preparing = (async () => {
      const dir = await ensureModelFiles();
      report({ stage: 'load', percent: 100 });
      const started = Date.now();
      engine = await loadStt().createStreamingSTT({
        modelPath: loadRoot().fileModelPath(dir),
        modelType: 'transducer',
        enableEndpoint: true,
        decodingMethod: 'greedy_search',
        numThreads: 2,
        provider: 'cpu',
      });
      debugLog('stt', 'đã nạp model', `${Date.now() - started} ms`);
    })().finally(() => {
      preparing = null;
    });
  }
  return preparing.finally(() => {
    if (onProgress) progressListeners.delete(onProgress);
  });
}

async function start(cb: SpeechCallbacks): Promise<SpeechSession> {
  if (!engine) throw new Error('Model giọng nói chưa sẵn sàng.');
  if (!(await requestPermission())) {
    throw new Error('Chưa cấp quyền micro. Vào Cài đặt › Ứng dụng › Sổ Nghe Lời › Quyền để bật.');
  }
  const stream = await engine.createStream();
  const mic = loadAudio().createPcmLiveStream({ sampleRate: STT_SAMPLE_RATE, channelCount: 1 });

  const finals: string[] = [];
  let partial = '';
  let queue: Float32Array[] = [];
  let stopped = false;
  let failed = false;
  let chunks = 0;
  let endpoints = 0;
  const startedAt = Date.now();
  const emit = () => cb.onPartial(joinTranscript(finals, partial));
  const fail = (e: unknown) => {
    debugLog('stt', 'lỗi nhận dạng', errText(e));
    if (!failed) cb.onError(`Nhận dạng giọng nói lỗi: ${errText(e)}`);
    failed = true;
  };

  // Bộ nhận dạng xử lý lần lượt: các đoạn âm thanh đến trong lúc đang xử lý được gom lại làm một lần sau, không rơi mất.
  const drain = async () => {
    while (queue.length) {
      const samples = concatSamples(queue);
      queue = [];
      const { result, isEndpoint } = await stream.processAudioChunk(samples, STT_SAMPLE_RATE);
      const text = cleanTranscript(result.text);
      if (isEndpoint) {
        endpoints += 1;
        if (text) finals.push(text);
        partial = '';
        await stream.reset();
      } else {
        partial = text;
      }
      emit();
    }
  };
  let chain: Promise<void> = Promise.resolve();
  const schedule = () => {
    chain = chain.then(drain).catch(fail);
  };

  const offData = mic.onData((samples) => {
    if (stopped) return;
    chunks += 1;
    cb.onLevel(micLevel(samples));
    queue.push(samples);
    schedule();
  });
  const offError = mic.onError((message) => cb.onError(`Mic lỗi: ${message}`));
  try {
    await mic.start();
  } catch (e) {
    offData();
    offError();
    await stream.release().catch(() => undefined);
    throw new Error(`Không bật được micro: ${errText(e)}`);
  }
  debugLog('stt', 'bắt đầu nghe');

  return {
    stop: async () => {
      stopped = true;
      offData();
      offError();
      await mic.stop().catch(() => undefined);
      schedule(); // xử lý nốt phần còn trong hàng
      await chain;
      let last = '';
      try {
        // Đệm 0,5 giây im lặng để bộ nhận dạng nhả nốt các token cuối, rồi giải mã phần còn lại.
        await stream.acceptWaveform(new Array<number>(STT_SAMPLE_RATE / 2).fill(0), STT_SAMPLE_RATE);
        await stream.inputFinished();
        while (await stream.isReady()) await stream.decode();
        last = cleanTranscript((await stream.getResult()).text);
      } catch (e) {
        fail(e);
      }
      await stream.release().catch(() => undefined);
      const text = joinTranscript(finals, last || partial);
      debugLog('stt', 'dừng nghe', `${Date.now() - startedAt} ms`, `${chunks} đoạn âm`, `${endpoints} điểm ngắt`, `${text.length} ký tự`);
      return text;
    },
  };
}

export const sherpaEngine: SpeechEngine = {
  supported,
  isReady: () => engine !== null,
  requestPermission,
  prepare,
  start,
};
