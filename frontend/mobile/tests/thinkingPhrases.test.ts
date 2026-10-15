/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { THINKING_PHRASES, nextThinkingPhrase } from '../src/lib/thinkingPhrases.ts';

describe('THINKING_PHRASES', () => {
  it('has 80 distinct phrases ending with an ellipsis', () => {
    assert.equal(THINKING_PHRASES.length, 80);
    assert.equal(new Set(THINKING_PHRASES).size, 80);
    for (const phrase of THINKING_PHRASES) assert.match(phrase, /^Đang .+…$/);
  });

  it('never repeats the current phrase', () => {
    const current = THINKING_PHRASES[0];
    for (const r of [0, 0.5, 0.999]) assert.notEqual(nextThinkingPhrase(current, () => r), current);
  });
});
