import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { expo } = require('../app.json');
const configure = require('../app.config.js');

test('Android config blocks the unused data-sync foreground-service permission', () => {
  const config = configure({ config: expo });
  const permission = 'android.permission.FOREGROUND_SERVICE_DATA_SYNC';

  assert.ok(config.android.blockedPermissions.includes(permission));
  assert.ok(!config.android.permissions.includes(permission));
  assert.ok(config.android.permissions.includes('android.permission.RECORD_AUDIO'));
  assert.ok(config.android.permissions.includes('android.permission.CAMERA'));
});
