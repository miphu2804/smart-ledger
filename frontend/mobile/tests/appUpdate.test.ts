/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findNewerBuild, parseManifest } from '../src/lib/appUpdate.ts';

const manifest = { versionCode: 42, versionName: '1.0.3', apk: 'https://cdn.example/android/production/builds/a-42.apk' };

function respond(body: unknown, init: { ok?: boolean } = {}): typeof fetch {
  return (async () => ({ ok: init.ok ?? true, json: async () => body })) as unknown as typeof fetch;
}

test('a higher versionCode is offered as an update', async () => {
  assert.deepEqual(await findNewerBuild('https://x/version.json', 41, respond(manifest)), manifest);
});

test('the same or a lower versionCode is not an update', async () => {
  assert.equal(await findNewerBuild('https://x/version.json', 42, respond(manifest)), null);
  assert.equal(await findNewerBuild('https://x/version.json', 43, respond(manifest)), null);
});

test('no update URL or no installed versionCode disables the check', async () => {
  assert.equal(await findNewerBuild('', 1, respond(manifest)), null);
  assert.equal(await findNewerBuild('https://x/version.json', NaN, respond(manifest)), null);
});

test('network errors, bad status and bad JSON never surface as an update', async () => {
  const throwing = (async () => {
    throw new Error('offline');
  }) as unknown as typeof fetch;
  assert.equal(await findNewerBuild('https://x/version.json', 1, throwing), null);
  assert.equal(await findNewerBuild('https://x/version.json', 1, respond(manifest, { ok: false })), null);
  assert.equal(await findNewerBuild('https://x/version.json', 1, respond({ versionCode: '99' })), null);
});

test('a manifest must carry a numeric versionCode and an https APK URL', () => {
  assert.deepEqual(parseManifest(manifest), manifest);
  assert.equal(parseManifest(null), null);
  assert.equal(parseManifest({ ...manifest, versionCode: '42' }), null);
  assert.equal(parseManifest({ ...manifest, versionCode: 4.5 }), null);
  assert.equal(parseManifest({ ...manifest, apk: 'http://cdn.example/a.apk' }), null);
  assert.equal(parseManifest({ ...manifest, versionName: undefined }), null);
});
