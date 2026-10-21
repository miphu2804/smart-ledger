/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { folded, phon, toned } from '../src/lib/resolver/normalizer.ts';

describe('normalizer: folded', () => {
  it('"Sting Dâu" folds to "sting dau"', () => {
    assert.equal(folded('Sting Dâu'), 'sting dau');
  });

  it('"Đường" folds to "duong" (đ has no NFD decomposition)', () => {
    assert.equal(folded('Đường'), 'duong');
  });

  it('folds every tone and modifier letter', () => {
    assert.equal(folded('Nước mắm Nam Ngư 500ml'), 'nuoc mam nam ngu 500ml');
    assert.equal(folded('Bia Sài Gòn'), 'bia sai gon');
    assert.equal(folded('Sữa đặc Ông Thọ'), 'sua dac ong tho');
  });

  it('punctuation becomes a space and runs collapse', () => {
    assert.equal(folded('Coca-Cola   lon, 330ml!'), 'coca cola lon 330ml');
  });

  it('NFD input equals NFC input', () => {
    const nfc = 'Đường trắng 1kg';
    const nfd = nfc.normalize('NFD');
    assert.notEqual(nfc, nfd);
    assert.equal(folded(nfd), folded(nfc));
    assert.equal(toned(nfd), toned(nfc));
  });
});

describe('normalizer: toned', () => {
  it('unifies the two tone-placement styles', () => {
    assert.equal(toned('hòa'), toned('hoà'));
    assert.equal(toned('hòa'), 'hòa');
  });

  it('unifies them inside a sentence and mixed with NFD', () => {
    assert.equal(toned('Nước hoà'), toned('Nước hòa'.normalize('NFD')));
  });

  it('places the tone on the last vowel of a closed syllable', () => {
    assert.equal(toned('việt'), 'việt');
    assert.equal(toned('được'), 'được');
    assert.equal(toned('mắm'), 'mắm');
  });

  it('places the tone on the middle vowel of a three-vowel nucleus', () => {
    assert.equal(toned('ngoài'), 'ngoài');
    assert.equal(toned('người'), 'người');
  });

  it('keeps a tone the text already places canonically', () => {
    for (const word of ['hòa', 'khỏe', 'thúy', 'tùy', 'oái', 'mắm', 'được', 'việt', 'người', 'quý', 'quán', 'quyển', 'già', 'giếng', 'giường']) {
      assert.equal(toned(word), word);
    }
  });

  it('lowercases and strips punctuation', () => {
    assert.equal(toned('  Hảo Hảo,  tôm!  '), 'hảo hảo tôm');
  });
});

describe('normalizer: phon', () => {
  it('phon("xì ting") == phon("sì ting")', () => {
    assert.equal(phon('xì ting'), phon('sì ting'));
  });

  it('collapses the merged initials of the rule set', () => {
    assert.equal(phon('xà'), phon('sà'));
    assert.equal(phon('chai'), phon('trai'));
    assert.equal(phon('cua'), phon('kua'));
    assert.equal(phon('da'), phon('gia'));
  });

  it('keeps "kh" as its own onset', () => {
    // Regression: the longest-first lookup fell through to the one-character
    // "k" (which maps to "c"), so every kh- syllable collapsed onto ch-/tr-.
    assert.equal(phon('khăn'), 'khan');
    assert.equal(phon('chăn'), 'chan');
    assert.notEqual(phon('khăn'), phon('chăn'));
  });

  it('collapses the merged finals of the rule set', () => {
    assert.equal(phon('tan'), phon('tang'));
    assert.equal(phon('tac'), phon('tat'));
  });

  it('rewrites an already-canonical syllable to the canonical group member', () => {
    // `s` collapses onto `x` and the coda `ng` onto `n`, so `sting` is expected
    // to move: the key is for matching, not for reading.
    assert.equal(phon('sting'), 'xtin');
    assert.equal(phon('sai'), 'xai');
  });

  it('is idempotent', () => {
    for (const word of ['xì ting', 'đường trắng', 'coca cola', 'bia sài gòn']) {
      assert.equal(phon(phon(word)), phon(word));
    }
  });
});
