/**
 * The real-catalogue runner, tested through its command line.
 *
 * The runner is a CLI with a `main()` call at the bottom, as `run.ts` is, so a
 * test cannot import it without running it. These cases therefore drive the real
 * entry point the way a person does, and assert on the report it writes. That is
 * also the honest level for this file: the contract worth pinning is what the
 * runner refuses to do, because a report it should not have written is worse
 * than one it failed to write.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../../..', import.meta.url));
const RUNNER = join(REPO, 'backend/ai/evaluation/voice_order/runner/realdata.ts');
const CATALOG = join(REPO, 'backend/ai/evaluation/voice_order/data/real/example_catalog.json');
const LINES = join(REPO, 'backend/ai/evaluation/voice_order/data/real/example_lines.jsonl');
/** A gate with thresholds a five-line example cannot produce on its own. */
const GATE = '--gate';
const GATE_VALUE = '0.3,0.75,0.05';

/** Run the CLI and report its exit code with both streams, without throwing. */
function run(args: string[]): { code: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [RUNNER, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output };
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: string; stderr?: string };
    return { code: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'realdata-'));
}

describe('realdata: the runner refuses what would mislead', () => {
  it('refuses to fit the gate on too few lines', () => {
    // Five lines cannot constrain a three-threshold grid search: the search
    // lands on a floor below every score and reports an unsold product as ASK.
    const { code, output } = run(['--catalog', CATALOG, '--lines', LINES]);
    assert.notEqual(code, 0);
    assert.match(output, /too few to fit the gate/);
  });

  it('refuses a label naming a product the catalogue does not hold', () => {
    const dir = tempDir();
    const lines = join(dir, 'stale.jsonl');
    writeFileSync(
      lines,
      '{"id":"s1","span":"bia tiger","goldProductId":"999","qty":1}\n',
    );
    const { code, output } = run(['--catalog', CATALOG, '--lines', lines, GATE, GATE_VALUE]);
    assert.notEqual(code, 0);
    assert.match(output, /does not hold/);
  });

  it('refuses a row that is not a resolver configuration', () => {
    const { code, output } = run(['--catalog', CATALOG, '--lines', LINES, GATE, GATE_VALUE, '--row', 'R0']);
    assert.notEqual(code, 0);
    assert.match(output, /not a resolver configuration/);
  });

  it('refuses an unknown row', () => {
    const { code, output } = run(['--catalog', CATALOG, '--lines', LINES, GATE, GATE_VALUE, '--row', 'R99']);
    assert.notEqual(code, 0);
    assert.match(output, /unknown row R99/);
  });

  it('refuses a gate it cannot read', () => {
    const { code, output } = run(['--catalog', CATALOG, '--lines', LINES, GATE, 'nope']);
    assert.notEqual(code, 0);
    assert.match(output, /three numbers/);
  });

  it('requires both inputs', () => {
    assert.match(run([]).output, /--catalog is required/);
    assert.match(run(['--catalog', CATALOG]).output, /--lines is required/);
  });

  it('refuses a catalogue file holding more than one shop', () => {
    // backend/ai/evaluation/voice_order/data/catalogs.json is the bake-off registry, which holds six.
    const { code, output } = run(['--catalog', join(REPO, 'backend/ai/evaluation/voice_order/data/catalogs.json'), '--lines', LINES, GATE, GATE_VALUE]);
    assert.notEqual(code, 0);
    assert.match(output, /evaluates one shop/);
  });
});

describe('realdata: the report it writes', () => {
  it('measures the labelled set and names the failure that costs money', () => {
    const dir = tempDir();
    const { code, output } = run([
      '--catalog', CATALOG,
      '--lines', LINES,
      GATE, GATE_VALUE,
      '--out', dir,
      '--run-id', 'test_run',
    ]);
    assert.equal(code, 0, output);

    const path = join(dir, 'test_run.md');
    assert.ok(existsSync(path), `expected a report at ${path}`);
    const report = readFileSync(path, 'utf8');

    // The headline counts the five lines and the four the shop sells.
    assert.match(report, /\| 5 \| 4 \|/);
    // The catalogue is named, so a report cannot be read as a bake-off run.
    assert.match(report, /Row: R2/);
    // A frozen gate is labelled as frozen, not as fitted here.
    assert.match(report, /Gate: frozen from the command line/);
    // Every line appears, including the one that must not be auto-applied.
    assert.match(report, /^\| x5 \| nuoc cam \| \*\(not sold\)\* \| NEW \|/m);
    assert.match(report, /does not measure ASR/);
  });

  it('says so when the gate was fitted on the lines it reports', () => {
    // The warning is the whole reason a fitted gate is allowed at all, so it is
    // pinned: thirty lines is the smallest set the runner will fit on.
    const dir = tempDir();
    const lines = join(dir, 'thirty.jsonl');
    const catalog = join(dir, 'thirty_catalog.json');
    writeFileSync(catalog, JSON.stringify([{ id: '1', name: 'Bia Tiger lon 330ml', unit: 'lon' }]));
    const rows = Array.from({ length: 30 }, (_, i) => JSON.stringify({ id: `t${i}`, span: 'bia tiger', goldProductId: '1', qty: 1 }));
    writeFileSync(lines, `${rows.join('\n')}\n`);

    const { code, output } = run(['--catalog', catalog, '--lines', lines, '--out', dir, '--run-id', 'fitted']);
    assert.equal(code, 0, output);
    const report = readFileSync(join(dir, 'fitted.md'), 'utf8');
    assert.match(report, /tuned on these same 30 lines/);
    assert.match(report, /optimistic/);
  });
});
