'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const GarageSafetyEngine = require('../lib/garage/GarageSafetyEngine');

function setup() {
  const e = Object.create(GarageSafetyEngine.prototype);
  const point = { x: -2950, y: -4610 };
  let danger = { known: true, inside: false, distance: 4500, radius: 600 };
  let observed = 'idle';
  let requestCount = 0;
  let sampleTs = 0;
  e._commandToken = 10;
  e._outbound = { action: 'EXTERNAL_START', requiresMowingStable: true };
  e._manualGateStopped = false;
  e._returnContext = 'IDLE';
  e._emergencyGateContext = null;
  e.device = {
    _resolveStableMaintenancePoint: async () => point,
    get _observedMowerStatus() { return observed; },
  };
  e.enabled = () => true;
  e.isReturning = () => false;
  e._emergencyHoldActive = () => false;
  e.doorState = () => 'open';
  e.pos = () => ({ x: point.x, y: point.y, ts: Date.now() + (++sampleTs) });
  e.status = () => observed;
  e.markers = { rawDangerState: async () => danger };
  e.log = () => {};
  e.error = (place, message) => { throw new Error(place + ': ' + message); };
  e._clearOutboundStatusTimers = () => {};
  e.refreshTileStatus = async () => {};
  e.requestClose = async (reason, opts) => {
    requestCount++;
    assert.equal(reason, 'native_maintenance_reached_close');
    assert.equal(opts.maintenanceArrivalVerified, true);
    return true;
  };
  return { e, point, get calls() { return requestCount; }, setDanger: d => { danger = d; }, setStatus: s => { observed = s; } };
}

test('verified native maintenance arrival recovers a stale EXTERNAL_START and requests one guarded close', async () => {
  const a = setup();
  a.e._scheduleNativeMaintenanceClose('native_code_75_geometry_confirmed', { ...a.point, ts: Date.now() });
  assert.ok(a.e._nativeMaintenanceCloseTask);
  assert.equal(await a.e._nativeMaintenanceCloseTask, true);
  assert.equal(a.calls, 1);
  assert.equal(a.e._outbound, null);
  assert.equal(a.e._manualMaintenancePhase, 'reached');
});

test('native maintenance observation without arrival provenance cannot initiate closing', () => {
  const a = setup();
  a.e._scheduleNativeMaintenanceClose('status_mowing', { ...a.point, ts: Date.now() });
  assert.equal(a.e._nativeMaintenanceCloseTask, undefined);
  assert.equal(a.calls, 0);
});

test('active return never permits this outbound maintenance-close recovery', () => {
  const a = setup();
  a.e.isReturning = () => true;
  a.e._scheduleNativeMaintenanceClose('native_code_75_geometry_confirmed', { ...a.point, ts: Date.now() });
  assert.equal(a.e._nativeMaintenanceCloseTask, undefined);
  assert.equal(a.calls, 0);
});

test('danger-zone or moving state aborts the pending close when command is superseded', async () => {
  const a = setup();
  a.setDanger({ known: true, inside: true, distance: 100, radius: 600 });
  a.e._scheduleNativeMaintenanceClose('native_code_75_geometry_confirmed', { ...a.point, ts: Date.now() });
  const task = a.e._nativeMaintenanceCloseTask;
  setTimeout(() => { a.e._commandToken += 1; }, 150);
  assert.equal(await task, false);
  assert.equal(a.calls, 0);
});
