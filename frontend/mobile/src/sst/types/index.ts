export type OrderIntent = 'SALE' | 'EXPENSE' | 'MIXED' | 'UNKNOWN';

export interface DisambiguationOption {
  product_id: string;
  name: string;
  unit_price_vnd: number;
  unit: string;
  category?: string;
}

export interface MatchedItem {
  product_id: string | null;
  matched_name: string | null;
  raw_input_name: string;
  quantity: number;
  unit: string | null;
  unit_price_vnd: number;
  subtotal_vnd: number;
  confidence: number;
  needs_disambiguation: boolean;
  disambiguation_options: DisambiguationOption[];
  warning: string | null;
  notes: string | null;
}

export interface ExtractedItem {
  raw_name: string;
  quantity: number;
  unit?: string | null;
  notes?: string | null;
}

export interface ExtractedExpense {
  category: string;
  amount_vnd: number;
  notes?: string | null;
}

export interface DraftOrderResponse {
  request_id: string;
  intent: OrderIntent;
  raw_text: string;
  normalized_text: string;
  total_amount_vnd: number;
  items: MatchedItem[];
  suggested_expenses: ExtractedExpense[];
  overall_warning: string | null;
}

export interface ProductItem {
  id: string;
  shop_id: string;
  name: string;
  price_vnd: number;
  category: string;
  unit: string;
  aliases: string[];
}

export interface HotwordItem {
  keyword: string;
  boost_score: number;
  aliases?: string[];
}

export interface POSMappingConfig {
  shop_id: string;
  version: string;
  hotwords: HotwordItem[];
  common_units: string[];
  number_words: string[];
}

export interface EngineConfig {
  shopId: string;
  apiBaseUrl?: string; // Optional for cloud fallback
  sampleRate?: number; // Default: 16000
  useCloudFallback?: boolean; // Default: false (100% on-device)
}
