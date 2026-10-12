'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const Engine = require('../lib/garage/GarageSafetyEngine');

const root = path.resolve(__dirname, '..');
let Device;
const load = Module._load;
try {
  Module._load = function(id, parent, main) {
    if (id === 'homey') return { Device: class {} };
    if (id === 'mqtt') return {};
    return load.call(this, id, parent, main);
  };
  Device = require('../drivers/mower/device');
} finally {
  Module._load = load;
}

function mockReturn() {
  const e = Object.create(Engine.prototype);
  e._commandToken = 7;
  e._safeReturnInProgress = true;
  e._returnGuardActive = true;
  e._returnContext = 'RETURN_STARTED';
  e._manualGateStopped = false;
  e._emergencyGateContext = null;
  e._emergencyHoldActive = () => false;
  e.enabled = () => true;
  e.doorState = () => 'closed';
  e._missionOutside = true;
  e._pos = { x: 1500, y: 0, ts: Date.now() };
  e.pos = () => e._pos;
  e.log = () => {};
  e.error = () => {};
  e.markers = {
    rawDangerState: async () => ({ known: true, inside: false, distance: 1500, radius: 700 }),
  };
  e.device = {
    _observedMowerStatus: 'paused',
    _observedMowerStatusAt: Date.now(),
    getData: () => ({ id: 'SIMULATED_NO_HARDWARE' }),
    _api: { pause: async () => true },
    _safeWrite: async (_, fn) => fn(),
    _pylonLifecycleNeedsTransition: () => true,
  };
  return e;
}

test('vendor PAUSED status is not coerced to ERROR by retained fault code 27', () => {
  const src = fs.readFileSync(path.join(root, 'drivers/mower/device.js'), 'utf8');
  assert.match(src, /3:\s*'paused'/);
  assert.match(src, /4:\s*'error'/);
  assert.doesNotMatch(src, /rawStatus === 'paused' && isEffectiveError/);
  assert.doesNotMatch(src, /rawStatus === 'paused' && ERROR_DEVICE_CODES\.has\(effectiveFaultCode\)/);
});

test('a mowing-only native no-go zone must be absent on return', () => {
  const d = Object.create(Device.prototype);
  d.getSetting = k => k === 'garage_mode_enabled' ? true : null;
  assert.equal(d._pylonLifecycleDesiredActive({ lifecycle: 'mowing' }, 'mowing'), true);
  assert.equal(d._pylonLifecycleDesiredActive({ lifecycle: 'mowing' }, 'return'), false);
  assert.equal(d._pylonLifecycleDesiredActive({ lifecycle: 'mowing_return' }, 'return'), true);
});

test('native return zone edit waits for verified pause and fresh clearance', async () => {
  const e = mockReturn();
  let pauses = 0;
  e.device._api.pause = async () => {
    pauses++;
    e.device._observedMowerStatusAt = Date.now();
    return true;
  };
  e._waitForNativePause = async (_token, at) => {
    e._returnLineStopProof = { at: Date.now(), kind: 'native_pause' };
    return true;
  };
  let syncs = 0;
  // Emulate the vendor map readback: after confirmed edit the transition
  // must no longer be reported as pending.
  e.device._pylonLifecycleNeedsTransition = () => syncs === 0;
  e.device._syncPylonLifecyclePhase = async (phase) => {
    assert.equal(phase, 'return');
    assert.equal(e._returnLifecycleMapEditAllowed(), true);
    syncs++;
    return { ok: true, changed: 1 };
  };
  assert.equal((await e._prepareReturnLifecycleForRouting(7)).ok, true);
  assert.equal(pauses, 1);
  assert.equal(syncs, 1);
  assert.equal(e._returnLifecycleMapEditProof, null, 'proof must not leak into later motions');
});

test('no zone write or door opening when danger circle clearance is missing', async () => {
  const e = mockReturn();
  let pauses = 0;
  let writes = 0;
  e.markers.rawDangerState = async () => ({ known: true, inside: true, distance: 600, radius: 700 });
  e.device._api.pause = async () => { pauses++; };
  e.device._syncPylonLifecyclePhase = async () => { writes++; };
  const result = await e._prepareReturnLifecycleForRouting(7);
  assert.equal(result.ok, false);
  assert.equal(pauses, 0);
  assert.equal(writes, 0);
});

test('a verified map-edit proof is invalidated by a moving gate or a new command', () => {
  const e = mockReturn();
  e._returnLifecycleMapEditProof = {
    token: 7, at: Date.now(), pauseRequestedAt: Date.now() - 100,
    kind: 'native_pause', position: { ...e.pos() },
  };
  assert.equal(e._returnLifecycleMapEditAllowed(), true);
  e.doorState = () => 'opening';
  assert.equal(e._returnLifecycleMapEditAllowed(), false);
  e.doorState = () => 'closed';
  e._commandToken = 8;
  assert.equal(e._returnLifecycleMapEditAllowed(), false);
});

test('active return can use verified checkpoint, but no generic moving map edits', async () => {
  const d = Object.create(Device.prototype);
  d._api = {};
  d._mapEditStationary = () => false;
  d._pylonLifecycleNeedsTransition = () => true;
  d._obstacleRulesCache = {};
  d._nativeZonePoliciesCache = {};
  d._activeMapIndex = 0;
  d.log = () => {};
  d._garageSafety = { _returnLifecycleMapEditAllowed: () => false };
  let result = await d._syncPylonLifecyclePhase('return', { reason: 'return_preflight' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'mower_moving');
  d._garageSafety._returnLifecycleMapEditAllowed = () => true;
  result = await d._syncPylonLifecyclePhase('return', { reason: 'return_preflight' });
  assert.equal(result.ok, true);
  d._pylonLifecycleNeedsTransition = () => false;
  d._garageSafety._returnLifecycleMapEditAllowed = () => false;
  result = await d._syncPylonLifecyclePhase('return', { reason: 'return_from_maintenance' });
  assert.equal(result.ok, true, 'a no-op check must not block the dock release');
});

test('maintenance route physically at closed gate is stopped and rerouted, not ignored', async () => {
  const e = mockReturn();
  e._returnContext = 'MAINTENANCE';
  e.isReturnCycleActive = () => true;
  const holds = [];
  e.returnOperationalHold = async reason => { holds.push(reason); };
  assert.equal(await e._routeClosedGateReturnViaMaintenance('closed_gate_return_danger'), false);
  assert.equal(e._maintenanceRouteStalled, true);
  assert.equal(holds[0], 'maintenance_return_stalled_at_closed_gate');
  assert.equal(e._confirmedMaintenanceTransitActive(), false);
  assert.equal(await e._routeClosedGateReturnViaMaintenance('closed_gate_return_danger'), false);
  assert.equal(holds.length, 1, 'duplicate position samples may not spawn parallel recoveries');
});
