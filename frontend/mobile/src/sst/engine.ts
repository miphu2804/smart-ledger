import { AudioStreamBuffer } from './asr/audio_streamer';
import { HotwordBiasingTrie } from './asr/hotword_biasing';
import { MenuHotwordCompiler } from './asr/menu_syncer';
import { ZipformerStreamingASR } from './asr/zipformer_engine';
import { CloudFallbackClient } from './cloud_fallback/api_client';
import { ClientOrderExtractor } from './order_parser/extractor';
import { ClientFuzzyMatcher } from './order_parser/fuzzy_matcher';
import { ClientTextNormalizer } from './order_parser/normalizer';
import { LocalMenuStore } from './storage/local_menu_store';
import {
  DisambiguationOption,
  DraftOrderResponse,
  EngineConfig,
  MatchedItem,
  POSMappingConfig,
  ProductItem,
} from './types';

export type OnRealtimeTextCallback = (transcript: string, isFinal: boolean) => void;
export type OnDraftOrderCallback = (draftOrder: DraftOrderResponse) => void;
export type OnErrorCallback = (error: Error) => void;

/**
 * SmartLedgerVoiceEngine
 * Engine xử lý toàn diện 100% Client-Side (On-Device):
 *
 * 1. Thu nhận Audio 16kHz từ Micro (audio_streamer.ts)
 * 2. Trích xuất đặc trưng Fbank 80-dim (fbank_extractor.ts)
 * 3. Chạy inference Zipformer-30M Streaming + Hotword Biasing Trie on-device (zipformer_engine.ts)
 * 4. Chuẩn hóa & Khử cà lăm / lặp từ / ngữ âm (normalizer.ts)
 * 5. Bóc tách số lượng, quy cách, món, chi phí (extractor.ts)
 * 6. Khớp thực đơn cục bộ & Phân giải biến thể Disambiguation (fuzzy_matcher.ts & disambiguation.ts)
 * 7. Phát sự kiện trả về DraftOrderResponse trong vòng 2 - 5ms!
 */
export class SmartLedgerVoiceEngine {
  private config: EngineConfig;
  private audioBuffer: AudioStreamBuffer;
  private zipformerASR: ZipformerStreamingASR;
  private normalizer: ClientTextNormalizer;
  private extractor: ClientOrderExtractor;
  private matcher: ClientFuzzyMatcher;
  private menuStore: LocalMenuStore;
  private hotwordTrie: HotwordBiasingTrie;
  private cloudFallback: CloudFallbackClient;

  private onRealtimeTextListeners: OnRealtimeTextCallback[] = [];
  private onDraftOrderListeners: OnDraftOrderCallback[] = [];
  private onErrorListeners: OnErrorCallback[] = [];

  constructor(config: EngineConfig) {
    this.config = {
      shopId: config.shopId || 'default',
      apiBaseUrl: config.apiBaseUrl || 'http://localhost:8000',
      sampleRate: config.sampleRate || 16000,
      useCloudFallback: config.useCloudFallback || false,
    };

    this.audioBuffer = new AudioStreamBuffer(this.config.sampleRate);
    this.zipformerASR = new ZipformerStreamingASR();
    this.normalizer = new ClientTextNormalizer();
    this.extractor = new ClientOrderExtractor();
    this.matcher = new ClientFuzzyMatcher();
    this.menuStore = new LocalMenuStore();
    this.hotwordTrie = new HotwordBiasingTrie();
    this.cloudFallback = new CloudFallbackClient(this.config.apiBaseUrl);

    // Kết nối audio stream vào Zipformer ASR
    this.audioBuffer.onChunk((samples) => {
      this.zipformerASR.processAudioSamples(samples);
    });

    // Lắng nghe transcript real-time
    this.zipformerASR.onTranscript((text, isFinal) => {
      for (const cb of this.onRealtimeTextListeners) {
        cb(text, isFinal);
      }
    });
  }

  /**
   * Khởi tạo Engine: Tự động nạp danh mục thực đơn vào Cây Trie
   */
  public async init(customMenu?: ProductItem[], posConfig?: POSMappingConfig): Promise<void> {
    if (customMenu && customMenu.length > 0) {
      this.menuStore.setProducts(this.config.shopId, customMenu);
    }

    const currentMenu = this.menuStore.getProducts(this.config.shopId);
    MenuHotwordCompiler.syncMenuToTrie(currentMenu, this.hotwordTrie);

    if (posConfig) {
      this.hotwordTrie.loadFromPOSConfig(posConfig);
    }

    await this.zipformerASR.load();
    console.log(`[SmartLedgerEngine] Sẵn sàng 100% On-Device với ${currentMenu.length} món trong menu.`);
  }

  /**
   * Bắt đầu phiên thu âm khi người dùng bấm giữ mic
   */
  public startSession(): void {
    this.zipformerASR.reset();
    this.audioBuffer.start();
  }

  /**
   * Đẩy buffer âm thanh Float32Array PCM 16kHz vào engine
   */
  public feedAudioChunk(pcm16kSamples: Float32Array): void {
    this.audioBuffer.pushSamples(pcm16kSamples);
  }

  /**
   * Kết thúc phiên nói và thực thi bóc tách đơn hàng On-Device
   * @param overrideText Cho phép truyền văn bản trực tiếp
   */
  public async stopSessionAndParse(overrideText?: string): Promise<DraftOrderResponse | null> {
    this.audioBuffer.stop();
    const rawText = overrideText || this.zipformerASR.getCurrentTranscript();

    if (!rawText || !rawText.trim()) {
      return null;
    }

    try {
      let draftOrder: DraftOrderResponse;

      if (this.config.useCloudFallback) {
        // Gọi Cloud Backend AI
        draftOrder = await this.cloudFallback.parseViaCloud(this.config.shopId, rawText);
      } else {
        // Thực thi 100% On-Device (Tốc độ 2 - 5ms)
        draftOrder = this.parseOnDevice(rawText);
      }

      // Phát sự kiện ra UI
      for (const cb of this.onDraftOrderListeners) {
        cb(draftOrder);
      }

      return draftOrder;
    } catch (err: any) {
      for (const cb of this.onErrorListeners) {
        cb(err);
      }
      throw err;
    }
  }

  /**
   * Pipeline NLP bóc tách đơn hàng chạy 100% Offline trên máy người dùng
   */
  public parseOnDevice(rawText: string): DraftOrderResponse {
    const startTime = performance.now();

    // Bước 3: Bộ chuẩn hóa & Fuzzy Post-Correction
    const normalizedText = this.normalizer.normalize(rawText);

    // Bước 4: POS Order Extractor
    const { intent, items: extractedItems, expenses } = this.extractor.extract(normalizedText);

    // Bước 5: Khớp Menu cục bộ & Disambiguation
    const catalog = this.menuStore.getProducts(this.config.shopId);
    const matchedItems: MatchedItem[] = [];
    let totalVnd = 0;
    const warnings: string[] = [];
    let hasDisambig = false;

    for (const extItem of extractedItems) {
      const matched = this.matcher.matchItem(extItem, catalog);
      matchedItems.push(matched);
      totalVnd += matched.subtotal_vnd;

      if (matched.needs_disambiguation) {
        hasDisambig = true;
        if (matched.warning) warnings.push(matched.warning);
      } else if (matched.warning) {
        warnings.push(`${matched.raw_input_name}: ${matched.warning}`);
      }
    }

    if (expenses.length > 0) {
      const expStr = expenses.map((e) => `${e.amount_vnd.toLocaleString('vi-VN')}đ (${e.category})`).join(', ');
      warnings.push(`Có phát hiện khoản chi: ${expStr}`);
    }

    let overallWarning: string | null = warnings.length > 0 ? warnings.join(' | ') : null;
    if (hasDisambig && !overallWarning) {
      overallWarning = 'Đơn hàng có món cần chọn biến thể cụ thể';
    }

    const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
    console.log(`[SmartLedgerEngine] Bóc tách On-Device hoàn tất trong ${elapsed} ms.`);

    return {
      request_id: this.generateUUID(),
      intent,
      raw_text: rawText,
      normalized_text: normalizedText,
      total_amount_vnd: totalVnd,
      items: matchedItems,
      suggested_expenses: expenses,
      overall_warning: overallWarning,
    };
  }

  /**
   * Cập nhật món khi người dùng chọn 1 biến thể (Disambiguation $K \rightarrow M$)
   */
  public resolveDisambiguation(
    currentDraft: DraftOrderResponse,
    itemIndex: number,
    selectedOption: DisambiguationOption
  ): DraftOrderResponse {
    const updatedItems = [...currentDraft.items];
    const targetItem = updatedItems[itemIndex];
    if (!targetItem) return currentDraft;

    const unitPrice = selectedOption.unit_price_vnd;
    const subtotal = Math.round(targetItem.quantity * unitPrice);

    updatedItems[itemIndex] = {
      ...targetItem,
      product_id: selectedOption.product_id,
      matched_name: selectedOption.name,
      unit: selectedOption.unit || targetItem.unit,
      unit_price_vnd: unitPrice,
      subtotal_vnd: subtotal,
      needs_disambiguation: false,
      disambiguation_options: [],
      warning: null,
    };

    const newTotal = updatedItems.reduce((sum, item) => sum + item.subtotal_vnd, 0);
    const hasRemaining = updatedItems.some((i) => i.needs_disambiguation);

    return {
      ...currentDraft,
      items: updatedItems,
      total_amount_vnd: newTotal,
      overall_warning: hasRemaining ? currentDraft.overall_warning : null,
    };
  }

  // Quản lý thực đơn cục bộ
  public getLocalMenu(): ProductItem[] {
    return this.menuStore.getProducts(this.config.shopId);
  }

  public updateLocalMenu(products: ProductItem[]): void {
    this.menuStore.setProducts(this.config.shopId, products);
    MenuHotwordCompiler.syncMenuToTrie(products, this.hotwordTrie);
  }

  // Event Subscriptions
  public onRealtimeText(callback: OnRealtimeTextCallback): void {
    this.onRealtimeTextListeners.push(callback);
  }

  public onDraftOrder(callback: OnDraftOrderCallback): void {
    this.onDraftOrderListeners.push(callback);
  }

  public onError(callback: OnErrorCallback): void {
    this.onErrorListeners.push(callback);
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
