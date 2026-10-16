/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextRevealLength } from '../src/lib/smoothText.ts';

describe('nextRevealLength', () => {
  it('always advances by at least one character', () => {
    assert.equal(nextRevealLength(0, 3, 16), 1);
  });

  it('moves faster when more text is waiting', () => {
    assert.ok(nextRevealLength(0, 500, 16) > nextRevealLength(0, 20, 16));
  });

  it('moves faster after a slower frame, so a low frame rate does not fall behind', () => {
    assert.ok(nextRevealLength(0, 200, 50) > nextRevealLength(0, 200, 16));
  });

  it('never passes the target and stops there', () => {
    assert.equal(nextRevealLength(9, 10, 16), 10);
    assert.equal(nextRevealLength(10, 10, 16), 10);
    assert.equal(nextRevealLength(12, 10, 16), 10);
  });

  it('does not swallow a long backlog in one stalled frame', () => {
    assert.ok(nextRevealLength(0, 1000, 5000) < 1000);
  });

  it('catches up to a burst within a second at 60 fps and at 20 fps', () => {
    for (const frameMs of [16, 50]) {
      let shown = 0;
      let elapsed = 0;
      while (shown < 300) {
        shown = nextRevealLength(shown, 300, frameMs);
        elapsed += frameMs;
      }
      assert.ok(elapsed <= 1000, `${frameMs}ms frames took ${elapsed}ms`);
    }
  });
});
