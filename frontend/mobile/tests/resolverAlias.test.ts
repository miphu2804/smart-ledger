/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AliasTable } from '../src/lib/resolver/alias.ts';
import { SEED_ALIASES } from '../src/lib/resolver/seed_aliases.vi.ts';
import { folded } from '../src/lib/resolver/normalizer.ts';

describe('AliasTable', () => {
  it('counts repeated confirmations of the same mapping', () => {
    const table = new AliasTable();
    assert.equal(table.confirm('xi ting', 'p1').confirmedCount, 1);
    assert.equal(table.confirm('xi ting', 'p1').confirmedCount, 2);
    assert.equal(table.lookup('xi ting')?.confirmedCount, 2);
  });

  it('restarts the count when the same phrase is pointed at another product', () => {
    const table = new AliasTable();
    table.confirm('xi ting', 'p1');
    table.confirm('xi ting', 'p1');
    const moved = table.confirm('xi ting', 'p2');
    assert.equal(moved.productId, 'p2');
    assert.equal(moved.confirmedCount, 1, 'earlier confirmations were evidence for p1');
  });

  it('is untrusted below the threshold and trusted at it', () => {
    const table = new AliasTable();
    table.confirm('xi ting', 'p1');
    assert.equal(table.isTrusted('xi ting', 2), false);
    table.confirm('xi ting', 'p1');
    assert.equal(table.isTrusted('xi ting', 2), true);
  });

  it('treats an unknown phrase as untrusted', () => {
    assert.equal(new AliasTable().isTrusted('never heard', 1), false);
  });

  it('deletes an alias and reports whether one was there', () => {
    const table = new AliasTable();
    table.confirm('xi ting', 'p1');
    assert.equal(table.delete('xi ting'), true);
    assert.equal(table.delete('xi ting'), false);
    assert.equal(table.lookup('xi ting'), undefined);
  });

  it('does not alias the caller to its own array', () => {
    const entry = { folded: 'a b', productId: 'p1', confirmedCount: 3 };
    const table = new AliasTable([entry]);
    table.confirm('a b', 'p1');
    assert.equal(entry.confirmedCount, 3, 'the seed object must not be mutated');
    assert.equal(table.lookup('a b')?.confirmedCount, 4);
  });
});

describe('seed aliases', () => {
  it('carries the two web regex cases in folded form', () => {
    const byFolded = new Map(SEED_ALIASES.map((alias) => [alias.folded, alias.productName]));
    assert.equal(byFolded.get(folded('xì ting')), 'Sting');
    assert.equal(byFolded.get(folded('tai gơ')), 'Bia Tiger');
  });
});
