/**
 * LLM escalation for lines the resolver gate leaves at ASK.
 *
 * The gate's AUTO and NEW stand. An ASK line is sent, with its top-K
 * candidates, to an LLM that picks one candidate id or says none fits. The
 * reply only turns into AUTO when it names a shortlisted id with confidence
 * at or above `minConfidence`; "none" becomes NEW; anything else stays ASK.
 * So the LLM can never auto-apply a product the retrievers did not shortlist.
 *
 * Eval-only: it needs a gateway key, which must not ship in the mobile app.
 * The gateway is the AI service's (`backend/ai/.env`): OpenCode Go speaking
 * the Anthropic Messages API, which requires `x-opencode-session`.
 */

import type { Decision } from '../../frontend/mobile/src/lib/resolver/types.ts';

export interface EscalationCandidate {
  productId: string;
  name: string;
}

export interface EscalationInput {
  span: string;
  qty: number;
  unit: string | null;
  candidates: EscalationCandidate[];
}

export interface EscalationResult {
  decision: Decision;
  productId: string | null;
  /** The LLM's raw pick: a candidate id, "NONE", or null when the reply was unusable. */
  pick: string | null;
  confidence: number;
  ms: number;
  /** The reply text, kept so an unusable reply can be read afterwards. */
  raw: string;
  /** Thinking tokens the gateway reported, to confirm `thinking: false` took effect. */
  thinkingTokens: number;
}

export interface LlmDecisionConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  minConfidence: number;
  timeoutMs: number;
  /** False sends `thinking: disabled`; true leaves the model's default. */
  thinking: boolean;
}

const SYSTEM = `Bạn chọn sản phẩm cho một dòng đơn hàng nói bằng tiếng Việt tại một cửa hàng nhỏ.
Dòng nói có thể sai chính tả do nhận dạng giọng nói, viết tắt, hoặc thiếu dấu.
Chỉ chọn trong danh sách ứng viên. Nếu không ứng viên nào đúng là món được nói, trả "NONE".
Trả về đúng một JSON: {"pick": "<id hoặc NONE>", "confidence": <0..1>}`;

export class LlmDecision {
  private readonly config: LlmDecisionConfig;

  constructor(config: LlmDecisionConfig) {
    this.config = config;
  }

  async decide(input: EscalationInput, sessionId: string): Promise<EscalationResult> {
    const started = performance.now();
    const { text: reply, thinkingTokens } = await this.ask(input, sessionId);
    const ms = performance.now() - started;
    const parsed = this.parse(reply);
    if (!parsed) return { decision: 'ASK', productId: null, pick: null, confidence: 0, ms, raw: reply, thinkingTokens };
    return { ...this.toDecision(parsed, input), pick: parsed.pick, confidence: parsed.confidence, ms, raw: reply, thinkingTokens };
  }

  private async ask(input: EscalationInput, sessionId: string): Promise<{ text: string; thinkingTokens: number }> {
    const lines = input.candidates.map((c) => `- ${c.productId}: ${c.name}`).join('\n');
    const user = `Dòng nói: "${input.span}" (số lượng ${input.qty}${input.unit ? `, đơn vị "${input.unit}"` : ''})\nỨng viên:\n${lines}`;
    const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      signal: AbortSignal.timeout(this.config.timeoutMs),
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'user-agent': 'smartledger-eval/0.1.0',
        'x-opencode-session': sessionId,
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
        ...(this.config.thinking ? {} : { thinking: { type: 'disabled' } }),
      }),
    });
    if (!response.ok) throw new Error(`LLM ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const json = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage?: { output_tokens_details?: { thinking_tokens?: number } };
    };
    return {
      text: json.content.filter((part) => part.type === 'text').map((part) => part.text ?? '').join(''),
      thinkingTokens: json.usage?.output_tokens_details?.thinking_tokens ?? 0,
    };
  }

  private parse(reply: string): { pick: string; confidence: number } | null {
    const match = reply.match(/\{[^}]*\}/);
    if (!match) return null;
    try {
      const value = JSON.parse(match[0]) as { pick?: unknown; confidence?: unknown };
      if (typeof value.pick !== 'string') return null;
      const confidence = typeof value.confidence === 'number' ? value.confidence : 0;
      return { pick: value.pick.trim(), confidence };
    } catch {
      return null;
    }
  }

  private toDecision(parsed: { pick: string; confidence: number }, input: EscalationInput): Pick<EscalationResult, 'decision' | 'productId'> {
    if (parsed.pick.toUpperCase() === 'NONE') return { decision: 'NEW', productId: null };
    const shortlisted = input.candidates.some((c) => c.productId === parsed.pick);
    if (shortlisted && parsed.confidence >= this.config.minConfidence) return { decision: 'AUTO', productId: parsed.pick };
    return { decision: 'ASK', productId: null };
  }
}
