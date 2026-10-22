import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BaselineR0, reconstructUtterance } from '../lib/baselineR0.ts';
import type { CatalogItem } from '../../../../../frontend/mobile/src/lib/resolver/types.ts';

const CATALOG: CatalogItem[] = [
  { id: '117', name: 'Sting dâu chai 330ml' },
  { id: '118', name: 'Sting vàng chai 330ml' },
  { id: '201', name: 'Cà phê đen đá' },
  { id: '202', name: 'Cà phê sữa đá' },
  { id: '310', name: 'Bánh mì thịt' },
];

test('baselineR0: reconstructs a minimal utterance from the line', () => {
  assert.equal(reconstructUtterance({ rawProductSpan: 'sting vàng', qty: 3, unit: 'chai' }), '3 chai sting vàng');
  assert.equal(reconstructUtterance({ rawProductSpan: 'bánh mì thịt' }), 'bánh mì thịt');
});

test('baselineR0: exactly one match and no disambiguation maps to AUTO', () => {
  const r0 = new BaselineR0(CATALOG);
  const result = r0.resolve({ rawProductSpan: 'bánh mì thịt', qty: 2, unit: null });
  assert.equal(result.decision, 'AUTO');
  assert.equal(result.productId, '310');
});

test('baselineR0: a shared prefix maps to ASK', () => {
  const r0 = new BaselineR0(CATALOG);
  const result = r0.resolve({ rawProductSpan: 'cà phê', qty: 1, unit: null });
  assert.equal(result.decision, 'ASK');
  assert.equal(result.productId, null);
});

test('baselineR0: nothing in catalog maps to NEW', () => {
  const r0 = new BaselineR0(CATALOG);
  const result = r0.resolve({ rawProductSpan: 'bánh pía', qty: 1, unit: null });
  assert.equal(result.decision, 'NEW');
  assert.equal(result.productId, null);
});

test('baselineR0: returns the frozen ResolveResult shape with honest gate features', () => {
  const r0 = new BaselineR0(CATALOG);
  const result = r0.resolve({ rawProductSpan: 'sting vàng chai', qty: 1, unit: null });
  assert.deepEqual(Object.keys(result).sort(), ['decision', 'features', 'productId', 'topK']);
  assert.deepEqual(result.topK, []);
  const f = result.features;
  assert.equal(f.len_q, 3); // "sting vàng chai"
  assert.equal(f.unit_ok, 'unknown');
  assert.equal(f.stt_conf, null);
  assert.equal(f.s1, 0);
  assert.equal(f.s2, 0);
  assert.equal(f.margin, 0);
  assert.equal(f.disp, 0);
  assert.equal(f.agree, 0);
  assert.equal(f.jacc, 0);
  assert.equal(f.alias, 0);
});

test('baselineR0: is deterministic', () => {
  const r0 = new BaselineR0(CATALOG);
  const a = r0.resolve({ rawProductSpan: 'cà phê', qty: 1, unit: null });
  const b = r0.resolve({ rawProductSpan: 'cà phê', qty: 1, unit: null });
  assert.deepEqual(a, b);
});
