import { test } from 'node:test';
import assert from 'node:assert/strict';

import { synthesize, fitWeights, rulesToTags } from '../lib/synth.ts';
import { DEFAULT_SYNTH_WEIGHTS, SYNTH_RULE_NAMES } from '../lib/synth_rules.vi.ts';
import type { SynthRuleWeights } from '../lib/synth_rules.vi.ts';

const INPUTS = [
  'Sting dâu chai 330ml',
  'Nước mắm Nam Ngư 500ml',
  'Cà phê sữa đá',
  'Bánh mì thịt',
  'Trứng gà (vỉ 10)',
];

const NO_RULES: SynthRuleWeights = {
  tone_loss: 0,
  tone_swap: 0,
  initial_merge: 0,
  final_merge: 0,
  syllable_split: 0,
  syllable_merge: 0,
  loanword: 0,
  truncate: 0,
  char_edit: 0,
};

test('synth: same seed reproduces the same text and rules twice', () => {
  for (const input of INPUTS) {
    const a = synthesize(input, { seed: 42 });
    const b = synthesize(input, { seed: 42 });
    assert.equal(a.text, b.text, `text differs for ${input}`);
    assert.deepEqual(a.rules, b.rules, `rules differ for ${input}`);
  }
});

test('synth: output is a deterministic function of the seed (not global RNG)', () => {
  const first = synthesize('Sting dâu chai 330ml', { seed: 7 });
  synthesize('something else entirely', { seed: 999 });
  const again = synthesize('Sting dâu chai 330ml', { seed: 7 });
  assert.equal(first.text, again.text);
});

test('synth: rule weights are data — zero weights leave the input unchanged', () => {
  for (const input of INPUTS) {
    const result = synthesize(input, { seed: 3, weights: NO_RULES, charEditP: 0 });
    assert.equal(result.text, input);
    assert.deepEqual(result.rules, []);
  }
});

test('synth: forcing one weight to 1 fires exactly that rule', () => {
  const toneOnly: SynthRuleWeights = { ...NO_RULES, tone_loss: 1 };
  const result = synthesize('Cà phê sữa đá', { seed: 5, weights: toneOnly, charEditP: 0 });
  assert.ok(result.rules.includes('tone_loss'));
  assert.notEqual(result.text, 'Cà phê sữa đá');
});

test('synth: DEFAULT_SYNTH_WEIGHTS covers every rule with a probability in [0, 1]', () => {
  for (const rule of SYNTH_RULE_NAMES) {
    const value = DEFAULT_SYNTH_WEIGHTS[rule];
    assert.equal(typeof value, 'number', `${rule} missing`);
    assert.ok(value >= 0 && value <= 1, `${rule} out of range: ${value}`);
  }
});

test('synth: no rule ever produces an empty span', () => {
  for (const input of INPUTS) {
    for (let seed = 0; seed < 200; seed += 1) {
      const result = synthesize(input, { seed });
      assert.notEqual(result.text.trim(), '', `empty span for ${input} seed ${seed}`);
    }
  }
});

test('synth: the loanword rule Vietnamises a known token', () => {
  const loanOnly: SynthRuleWeights = { ...NO_RULES, loanword: 1 };
  const result = synthesize('Sting', { seed: 1, weights: loanOnly, charEditP: 0 });
  assert.ok(result.rules.includes('loanword'));
  assert.equal(result.text, 'xì ting');
});

test('synth: the truncate rule drops trailing size/unit tokens', () => {
  const truncOnly: SynthRuleWeights = { ...NO_RULES, truncate: 1 };

  const single = synthesize('Sting dâu chai 330ml', { seed: 1, weights: truncOnly, charEditP: 0 });
  assert.ok(single.rules.includes('truncate'));
  assert.equal(single.text, 'Sting dâu');

  const multi = synthesize('Giấy vệ sinh Pulppy lốc 10 cuộn', { seed: 1, weights: truncOnly, charEditP: 0 });
  assert.equal(multi.text, 'Giấy vệ sinh Pulppy');

  const none = synthesize('Bánh mì thịt', { seed: 1, weights: truncOnly, charEditP: 0 });
  assert.deepEqual(none.rules, []);
  assert.equal(none.text, 'Bánh mì thịt');
});

test('synth: fitWeights returns a weight per rule, clamped to [0, 1]', () => {
  const fitted = fitWeights([
    { reference: 'Cà phê sữa đá', heard: 'Ca phe sua da' },
    { reference: 'Sting', heard: 'xì ting' },
  ]);
  for (const rule of SYNTH_RULE_NAMES) {
    assert.ok(rule in fitted, `${rule} missing from fitted weights`);
    assert.ok(fitted[rule] >= 0 && fitted[rule] <= 1);
  }
});

test('synth: rulesToTags uses the closed vocabulary', () => {
  assert.deepEqual(rulesToTags([]), ['clean']);
  assert.ok(rulesToTags(['loanword']).includes('loanword'));
  assert.ok(rulesToTags(['initial_merge']).includes('dialect'));
  assert.deepEqual(rulesToTags(['char_edit']), []);
});
