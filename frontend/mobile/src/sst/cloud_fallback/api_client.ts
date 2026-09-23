import { DraftOrderResponse } from '../types';

/**
 * Client dự phòng gọi Backend AI khi cần phân tích ngữ cảnh phức tạp
 * Sử dụng native fetch (Zero external dependencies).
 */
export class CloudFallbackClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8000') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public async parseViaCloud(shopId: string, rawText: string): Promise<DraftOrderResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/ai/parse-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop_id: shopId,
        raw_text: rawText,
      }),
    });

    if (!response.ok) {
      throw new Error(`Cloud parse failed with HTTP status ${response.status}`);
    }

    const data = (await response.json()) as DraftOrderResponse;
    return data;
  }
}
