/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { exhaustedMessage, PENDING_MAX_MS, PENDING_RETRY_MS, quotaLine, untilSettled, type AiQuota } from '../src/lib/aiQuota.ts';
import { ApiError } from '../src/lib/apiError.ts';

function quota(over: Partial<AiQuota> = {}): AiQuota {
  return {
    effectiveTier: 'FREE',
    limit: 100,
    committed: 10,
    reserved: 0,
    remaining: 90,
    windowStart: '2026-11-23T00:00:00+07:00',
    windowEnd: '2026-11-30T00:00:00+07:00',
    nextResetAt: '2026-11-30T00:00:00+07:00',
    accessExpiresAt: null,
    enforcementEnabled: true,
    ...over,
  };
}

describe('untilSettled', () => {
  it('gửi lại đúng lượt khi Core báo 202 rồi trả kết quả', async () => {
    let calls = 0;
    const waits: number[] = [];
    const result = await untilSettled(
      async () => {
        if (++calls < 3) throw new ApiError(202, 'ai_turn_pending', 'pending');
        return 'answer';
      },
      async (ms) => void waits.push(ms),
      () => 0,
    );
    assert.equal(result, 'answer');
    assert.deepEqual(waits, [PENDING_RETRY_MS, PENDING_RETRY_MS]);
  });

  it('quá thời gian chờ thì ném lại lỗi 202', async () => {
    let clock = 0;
    await assert.rejects(
      untilSettled(
        async () => {
          throw new ApiError(202, 'ai_turn_pending', 'pending');
        },
        async (ms) => void (clock += ms),
        () => clock,
      ),
      (err: unknown) => err instanceof ApiError && err.status === 202,
    );
    assert.ok(clock <= PENDING_MAX_MS);
  });

  it('lỗi khác 202 ném ngay, không chờ', async () => {
    let waited = false;
    await assert.rejects(
      untilSettled(
        async () => {
          throw new ApiError(429, 'ai_quota_exhausted', 'out');
        },
        async () => void (waited = true),
      ),
      (err: unknown) => err instanceof ApiError && err.status === 429,
    );
    assert.equal(waited, false);
  });
});

describe('quotaLine', () => {
  it('không hiện khi Core chưa bật trừ lượt hoặc chưa đọc được', () => {
    assert.equal(quotaLine(null), null);
    assert.equal(quotaLine(quota({ enforcementEnabled: false })), null);
  });

  it('hiện số còn lại, câu đang xử lý và mốc lượt mới', () => {
    const line = quotaLine(quota({ reserved: 1, remaining: 89 }));
    assert.match(line ?? '', /^Còn 89\/100 lượt hỏi Bobi · 1 câu đang xử lý · lượt mới từ \d\d:\d\d (T\d|CN) \d\d\/\d\d$/);
  });

  it('tuần cuối của gói trả phí hiện hạn gói thay cho mốc lượt mới', () => {
    const line = quotaLine(quota({ effectiveTier: 'FULL', limit: 300, nextResetAt: null, accessExpiresAt: '2026-12-01T10:00:00+07:00' }));
    assert.match(line ?? '', /gói dùng đến/);
    assert.doesNotMatch(line ?? '', /lượt mới/);
  });
});

describe('exhaustedMessage', () => {
  it('kèm mốc nextAvailableAt của Core', () => {
    const msg = exhaustedMessage([{ field: 'nextAvailableAt', issue: '2026-11-30T00:00:00+07:00' }]);
    assert.match(msg, /^Bạn đã dùng hết lượt hỏi Bobi\. Lượt mới có từ .+\. Câu hỏi vẫn được giữ/);
  });

  it('không có mốc thì bỏ phần thời gian', () => {
    assert.equal(exhaustedMessage([]), 'Bạn đã dùng hết lượt hỏi Bobi. Câu hỏi vẫn được giữ để gửi lại khi có lượt mới.');
  });
});
