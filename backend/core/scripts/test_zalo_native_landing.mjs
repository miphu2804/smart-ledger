/** Execute the actual Java-rendered fallback script with synthetic fragments; not APK/device acceptance. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const artifact = JSON.parse(await readFile(fileURLToPath(new URL('../target/zalo-native-landing-test.json', import.meta.url)), 'utf8'));
assert.equal(artifact.synthetic, true);
assert.equal(artifact.target, 'https://core.example.test/mobile/auth/zalo/complete');
const script = artifact.html.match(/<script nonce="[A-Za-z0-9_-]{43}">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script);
const reference = 'r'.repeat(43);
const valid = `#nativeClientId=android-staging&requestId=request-1234567890&purpose=LOGIN&handoffReference=${reference}`;

function execute(fragment) {
  const link = { hidden: true };
  const history = [];
  vm.runInNewContext(script, {
    window: { location: { hash: fragment, pathname: '/mobile/auth/zalo/complete' } },
    history: { replaceState: (...args) => history.push(args) }, URLSearchParams,
    document: { getElementById: id => { assert.equal(id, 'return'); return link; } },
  }, { timeout: 1000 });
  assert.deepEqual(history, [[null, '', '/mobile/auth/zalo/complete']]);
  return link;
}

test('valid LOGIN and LINK preserve only the fixed App Link fragment and remove history credentials', () => {
  for (const fragment of [valid, valid.replace('purpose=LOGIN', 'purpose=LINK')]) {
    assert.deepEqual(execute(fragment), { hidden: false, href: artifact.target + fragment });
  }
});

test('fixed consent/provider errors return to the app without a reference', () => {
  for (const error of ['zalo_consent_denied', 'zalo_session_invalid', 'zalo_session_expired', 'zalo_provider_unavailable', 'zalo_unavailable']) {
    const fragment = valid.replace(`handoffReference=${reference}`, `error=${error}`);
    assert.equal(execute(fragment).href, artifact.target + fragment);
  }
});

test('malformed, duplicate, foreign-client and credential-bearing fragments cannot create a return link', () => {
  for (const fragment of ['', '#', '#next=javascript:alert(1)', valid + '&next=https://evil.test', valid + '&purpose=LINK',
    valid.replace('android-staging', 'android-production'), valid.replace('request-1234567890', 'short'),
    valid.replace('LOGIN', 'OTHER'), valid.replace(reference, 'short'), valid + '&error=zalo_unavailable',
    valid.replace(`handoffReference=${reference}`, 'error=attacker_message'), valid + '&code=private-provider-code',
    valid.replace(reference, '%3C%2Fscript%3E'), valid.replace(reference, '') + '&error=zalo_unavailable',
    valid + '&clientVerifier=' + 'v'.repeat(43), valid + '&firebaseCustomToken=private']) {
    assert.deepEqual(execute(fragment), { hidden: true }, fragment);
  }
});
