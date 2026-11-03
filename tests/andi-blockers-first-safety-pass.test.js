'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const device = fs.readFileSync(path.join(root,'drivers/mower/device.js'),'utf8');
const garage = fs.readFileSync(path.join(root,'lib/garage/GarageSafetyEngine.js'),'utf8');
const api = fs.readFileSync(path.join(root,'lib/MovaApi.js'),'utf8');

test('hard-coded A2 garden polygons are not shipped as an obstacle fallback', () => {
  assert.doesNotMatch(device, /_knownA2ObstacleFallback/);
  assert.doesNotMatch(device, /restored 8 last-known A2 pylons/);
  assert.doesNotMatch(device, /\[-328,-55\],\[-338,-65\]/);
});

test('garage-off start bypasses the garage marker and outside-proof gate', () => {
  const method = garage.slice(garage.indexOf('  async startRequested(source, fn) {'));
  const until = method.indexOf('    if (this._emergencyCommandBlocked');
  assert.ok(until > 0);
  const offBlock = method.slice(0, until);
  assert.match(offBlock, /if \(!this\.enabled\(\)\)/);
  assert.match(offBlock, /return fn\(\)/);
  assert.match(offBlock, /_hasConfiguredNativeLifecycleRules/);
});

test('map-edit final o=201 bypasses the mutation deadline', () => {
  const transaction = api.slice(api.indexOf('  async runMapEditTransaction('),api.indexOf('  // Native map edit-frame coordinates'));
  assert.match(transaction, /const isFinalCommit = name === 'commit' && Number\(payload\?\.o\) === 201/);
  assert.match(transaction, /const deadlineAt = isFinalCommit \? 0 : Number\(options\.deadlineAt \|\| 0\)/);
  assert.match(transaction, /await send\('commit', \{ m: 'a', p: 1, o: 201 \}/);
});
