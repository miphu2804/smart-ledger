/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageNumbers } from '../src/lib/pageNumbers.ts';

test('few pages are all listed', () => {
  assert.deepEqual(pageNumbers(0, 1), [0]);
  assert.deepEqual(pageNumbers(2, 5), [0, 1, 2, 3, 4]);
});

test('many pages keep first, last and the neighbours of the current page', () => {
  assert.deepEqual(pageNumbers(0, 10), [0, 1, '…', 9]);
  assert.deepEqual(pageNumbers(4, 10), [0, '…', 3, 4, 5, '…', 9]);
  assert.deepEqual(pageNumbers(9, 10), [0, '…', 8, 9]);
});

test('no gap marker when the pages are adjacent', () => {
  assert.deepEqual(pageNumbers(2, 6), [0, 1, 2, 3, '…', 5]);
  assert.deepEqual(pageNumbers(3, 6), [0, '…', 2, 3, 4, 5]);
});
