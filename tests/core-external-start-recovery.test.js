'use strict';
const assert = require('node:assert/strict');
const { CoreExternalStartRecovery } = require('../lib/garage/CoreExternalStartRecovery');

function frame(undock, dock = 0) {
  const b = Array(20).fill(0);
  b[0] = b[19] = 0xce;
  b[14] = ((dock & 7) << 2) | ((undock & 1) << 6);
  return b;
}
function rig({ task = { o: 100, exe: true, status: true }, sensor = true,
  stopRejected = false, loseStation = false, gateConfirmed = true } = {}) {
  let now = 100000;
  const calls = [], logs = [];
  let controller;
  const garage = {
    _outbound: null, _missionOutside: false, _safeReturnInProgress: false,
    _lastSensorContactState: 'closed', _lastGateOpenHandshakeAt: 0,
    enabled: () => true, sensorEnabled: () => sensor, sensorHealthy: () => sensor,
    isDoorOpenStable: () => garage._lastSensorContactState === 'open',
    _doorOpenReleaseVerified: () => garage._lastSensorContactState === 'open',
    ensureDoorOpen: async () => {
      calls.push('gate:open');
      if (gateConfirmed) {
        garage._lastSensorContactState = 'open';
        garage._lastGateOpenHandshakeAt = now;
      }
      return gateConfirmed;
    },
    _beginOutbound: async () => { calls.push('outbound'); garage._outbound = {}; },
    _markOutboundReleased: async () => { calls.push('release'); },
    safetyWarning: async () => { calls.push('warning'); },
    safetyBlock: async () => { calls.push('blocked'); },
  };
  const device = {
    getSetting: () => true, getData: () => ({ id: 'mower' }), _activeMapIndex: 0,
    _safeWrite: async (name, fn) => {
      calls.push(name);
      try { await fn(); return true; } catch (_) { return false; }
    },
    _api: {
      pause: async () => { calls.push('pause'); return true; },
      stopMowing: async () => {
        calls.push('stop');
        controller.observeNative(frame(loseStation ? 0 : 0, loseStation ? 1 : 0));
        return !stopRejected;
      },
      startMowing: async () => {
        calls.push('start');
        controller.observeNative(frame(1));
        return true;
      },
      startEdgeMowing: async () => { calls.push('edge'); controller.observeNative(frame(1)); return true; },
      startZoneMowing: async () => { calls.push('zone'); controller.observeNative(frame(1)); return true; },
      startSpotMowing: async () => { calls.push('spot'); controller.observeNative(frame(1)); return true; },
    },
  };
  controller = new CoreExternalStartRecovery({
    device, garage, now: () => now, sleep: async (ms) => { now += ms; },
    log: (...args) => logs.push(args),
  });
  controller.observeNative(frame(0));
  now += 20;
  const edge = controller.observeNative(frame(1));
  if (task) controller.observeTask({ t: 'TASK', d: task });
  return { controller, calls, garage, edge };
}
(async () => {
  let r = rig();
  assert.equal(r.edge.type, 'native-undock-edge');
  assert.equal(await r.controller.intercept(), true);
  assert.deepEqual(r.calls.filter((x) => ['pause','stop','gate:open','start'].includes(x)),
    ['pause','stop','gate:open','start']);
  assert.equal(r.controller.phase, 'DONE');

  r = rig({ task: { o: 109, exe: true, status: false } });
  assert.equal(await r.controller.intercept(), false);
  assert.equal(r.calls.includes('start'), false);
  assert.equal(r.calls.includes('warning'), true);
  assert.equal(r.controller.phase, 'OPERATOR_CHECK_REQUIRED');

  r = rig({ task: null });
  assert.equal(await r.controller.intercept(), false);
  assert.equal(r.calls.includes('start'), false);

  r = rig({ gateConfirmed: false });
  assert.equal(await r.controller.intercept(), false);
  assert.equal(r.calls.includes('start'), false);

  r = rig({ sensor: false });
  assert.equal(r.controller.eligible(), false);
  assert.equal(r.calls.length, 0);

  r = rig({ stopRejected: true });
  assert.equal(await r.controller.intercept(), false);
  assert.equal(r.calls.includes('gate:open'), false);

  r = rig({ loseStation: true });
  assert.equal(await r.controller.intercept(), false);
  assert.equal(r.calls.includes('gate:open'), false);

  r = rig({ task: { o: 102, exe: true, status: false, region_id: [2] } });
  assert.equal(await r.controller.intercept(), true);
  assert.equal(r.calls.includes('zone'), true);

  r = rig({ task: { o: 103, exe: true, status: true } });
  assert.equal(await r.controller.intercept(), false);
  assert.equal(r.calls.includes('spot'), false);

  r = rig();
  const p = r.controller.intercept();
  assert.equal(r.controller.eligible(), false, 'parallel event must not re-enter');
  await p;
  r = rig({ stopRejected: true });
  await r.controller.intercept();
  // A failed recovery cannot re-open the gate on an old native replay.
  r.controller.observeNative(frame(0));
  const replay = r.controller.observeNative(frame(1));
  assert.equal(replay.type, 'native-undock-edge');
  const gateCallsBefore = r.calls.filter((v) => v === 'gate:open').length;
  await r.controller.suppressAbortedReplay();
  assert.equal(r.calls.filter((v) => v === 'gate:open').length, gateCallsBefore);
  assert.equal(r.calls.filter((v) => v === 'pause').length, 2);

  console.log('PASS: 11 native external-start recovery tests');
})().catch((e) => { console.error(e); process.exitCode = 1; });
