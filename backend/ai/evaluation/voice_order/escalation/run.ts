/**
 * Measures LLM escalation of ASK lines against the voice-resolve dev endpoint.
 *
 * Resolves every line through the endpoint with the given pipeline, sends the
 * ASK lines to `LlmDecision`, and writes each line's gate decision, LLM pick
 * and confidence, so the acceptance threshold can be swept afterwards without
 * calling the LLM again.
 *
 *   node backend/ai/evaluation/voice_order/escalation/run.ts --env backend/ai/.env --endpoint http://localhost:8792 \
 *     --pipeline pipeline.json --spoken spoken.json --out escalation.json [--data backend/ai/evaluation/voice_order/data] [--limit 0]
 *   node backend/ai/evaluation/voice_order/escalation/run.ts --env backend/ai/.env --pipeline pipeline.json --lockbox <seed> \
 *     --out escalation.json [--per-dataset 700] [--thinking off]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { buildResolver } from '../../../../../frontend/mobile/src/lib/resolver/index.ts';
import type { GateConfig, ResolverConfig } from '../../../../../frontend/mobile/src/lib/resolver/types.ts';
import type { EvalRecord } from '../lib/corpus.ts';
import { stratifiedSample } from '../runner/harness.ts';
import { lockboxData } from '../search/data.ts';
import { LlmDecision } from './llmDecision.ts';
import type { EscalationInput } from './llmDecision.ts';

const CATALOGS = ['tap_hoa', 'ca_phe', 'quan_com'];
const CONCURRENCY = 4;

interface Line {
  set: string;
  catalogId: string;
  gold: string | null;
  span: string;
  qty: number;
  unit: string | null;
  gate: string;
  gateProductId: string | null;
  candidates: Array<{ productId: string; name: string }>;
}

function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : fallback;
  if (value === undefined) throw new Error(`missing --${name}`);
  return value;
}

function readEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const match = raw.match(/^([A-Z_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

async function resolve(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${endpoint}/resolve`, { method: 'POST', body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`endpoint ${response.status}: ${await response.text()}`);
  return response.json();
}

async function collect(endpoint: string, pipeline: unknown, spokenPath: string, dataDir: string): Promise<Line[]> {
  const lines: Line[] = [];
  const toLine = (set: string, catalogId: string, gold: string | null, l: any): Line => ({
    set, catalogId, gold, span: l.span, qty: l.qty, unit: l.unit, gate: l.decision, gateProductId: l.productId,
    candidates: l.candidates.map((c: any) => ({ productId: c.productId, name: c.name })),
  });
  for (const set of ['d1', 'd2']) {
    const records = readFileSync(`${dataDir}/${set}.jsonl`, 'utf8').trim().split('\n').map((row) => JSON.parse(row));
    for (const catalogId of CATALOGS) {
      const group = records.filter((r) => r.catalogId === catalogId);
      const json = await resolve(endpoint, { catalogId, pipeline, lines: group.map((r) => ({ span: r.line.rawProductSpan, qty: r.line.qty, unit: r.line.unit })) });
      json.lines.forEach((l: any, i: number) => lines.push(toLine(set, catalogId, group[i].goldProductId, l)));
    }
  }
  for (const t of JSON.parse(readFileSync(spokenPath, 'utf8'))) {
    const json = await resolve(endpoint, { catalogId: t.catalogId, pipeline, transcript: t.transcript });
    if (json.lines.length !== t.gold.length) continue;
    json.lines.forEach((l: any, i: number) => lines.push(toLine('spoken', t.catalogId, t.gold[i], l)));
  }
  return lines;
}

/**
 * A fresh lockbox (D2 noise, D3 catalogs, OOC lines from `seed`), resolved
 * in-process with the same `buildResolver` the endpoint runs: the endpoint
 * only serves the three fixture catalogs, and D3 and OOC need generated ones.
 */
function collectLockbox(pipeline: { config: ResolverConfig; gate: GateConfig }, seed: number, limit: number): Line[] {
  const box = lockboxData({ lockbox: { d2Seed: seed, d3Seed: seed, oocSeed: seed, oocFraction: 0.1 } });
  const lines: Line[] = [];
  const byCatalog = new Map<string, EvalRecord[]>();
  for (const record of stratifiedSample(box.records, limit)) byCatalog.set(record.catalogId, [...(byCatalog.get(record.catalogId) ?? []), record]);
  for (const [catalogId, group] of byCatalog) {
    const catalog = box.catalogs[catalogId] ?? [];
    const names = new Map(catalog.map((item) => [item.id, item.name]));
    const resolver = buildResolver({ catalog, config: pipeline.config, gate: pipeline.gate, seeds: [] });
    for (const record of group) {
      const result = resolver.resolve(record.line);
      lines.push({
        set: record.dataset, catalogId, gold: record.goldProductId, span: record.line.rawProductSpan,
        qty: record.line.qty ?? 1, unit: record.line.unit ?? null, gate: result.decision, gateProductId: result.productId,
        candidates: result.topK.map((hit) => ({ productId: hit.productId, name: names.get(hit.productId) ?? hit.productId })),
      });
    }
  }
  return lines;
}

async function main(): Promise<void> {
  const env = readEnv(arg('env'));
  const llm = new LlmDecision({
    baseUrl: env.OPENAI_BASE_URL.replace(/\/v1\/?$/, ''),
    apiKey: env.OPENAI_API_KEY,
    model: env.MODEL_NAME,
    minConfidence: 0,
    timeoutMs: 20_000,
    thinking: arg('thinking', 'on') !== 'off',
  });
  const pipeline = JSON.parse(readFileSync(arg('pipeline'), 'utf8'));
  const lockboxSeed = Number(arg('lockbox', '0'));
  // `backend/ai/evaluation/voice_order/data/` is generated, so a fresh checkout may not have it.
  const lines = lockboxSeed > 0
    ? collectLockbox(pipeline, lockboxSeed, Number(arg('per-dataset', '700')))
    : await collect(arg('endpoint'), pipeline, arg('spoken'), arg('data', new URL('../data', import.meta.url).pathname));
  const limit = Number(arg('limit', '0'));
  const asks = lines.filter((l) => l.gate === 'ASK').slice(0, limit > 0 ? limit : undefined);
  const session = randomUUID();

  const escalated = new Map<Line, unknown>();
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < asks.length) {
      const line = asks[next++];
      const input: EscalationInput = { span: line.span, qty: line.qty, unit: line.unit, candidates: line.candidates };
      try {
        escalated.set(line, await llm.decide(input, session));
      } catch (error) {
        escalated.set(line, { error: String(error) });
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const rows = lines.map((line) => ({ ...line, llm: escalated.get(line) ?? null }));
  writeFileSync(arg('out'), JSON.stringify({ model: env.MODEL_NAME, pipeline: pipeline.id, rows }, null, 1));
  const errors = rows.filter((r) => r.llm && 'error' in (r.llm as object)).length;
  console.log(`${lines.length} lines, ${asks.length} escalated, ${errors} errors`);
}

await main();
