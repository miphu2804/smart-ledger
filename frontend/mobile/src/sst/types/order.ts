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

export interface ExtractedExpense {
  category: string;
  amount_vnd: number;
  notes?: string;
}

export interface ParseVoiceOrderRequest {
  shop_id: string;
  raw_text: string;
  user_id?: string;
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
