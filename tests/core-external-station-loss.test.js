'use strict';
const assert = require('node:assert/strict');
const { CoreExternalStartRecovery } = require('../lib/garage/CoreExternalStartRecovery');
const mk = (u, dock = 0) => {
  const a = Array(20).fill(0); a[0] = 0xce; a[19] = 0xce;
  a[14] = ((dock & 7) << 2) | ((u & 1) << 6); return a;
};
function makeScenario({ moved = false, unknownGeometry = false, contactLost = true } = {}) {
  let time = 100000, controller, writes = [];
  const garage = {
    _outbound: null, _missionOutside: false,
    _lastSensorContactState: 'closed', _lastGateOpenHandshakeAt: 0,
    enabled: () => true, sensorEnabled: () => true, sensorHealthy: () => true,
    pos: () => ({ x: 100, y: 100, ts: time }),
    markers: {
      rawDangerState: async () => unknownGeometry ? { known: false } : { known: true, radius: 900, distance: 140, inside: true },
      lineState: async () => ({ known: true, onSegment: true, direction: { known: true, garageSide: -1 }, rawSide: -1 }),
    },
    isDoorOpenStable: () => garage._lastSensorContactState === 'open',
    _doorOpenReleaseVerified: () => garage._lastSensorContactState === 'open',
    ensureDoorOpen: async () => {
      writes.push('gate');
      garage._lastSensorContactState = 'open'; garage._lastGateOpenHandshakeAt = time;
      if (contactLost) controller.observeNative(mk(0, 1));
      return true;
    },
    _beginOutbound: async () => { writes.push('outbound'); garage._outbound = {}; },
    _markOutboundReleased: async () => { writes.push('released'); },
    safetyBlock: async () => { writes.push('blocked'); },
    safetyWarning: async () => { writes.push('warning'); },
  };
  const api = {
    pause: async () => { writes.push('pause'); },
    stopMowing: async () => { writes.push('stop'); controller.observeNative(mk(0)); },
    getMowerPosition: async () => ({x: moved ? 700 : 100, y: 100}),
    getProperties: async () => ({code: 0, data: {result: [{siid: 2, piid: 1, value: 2, code: 0}]}}),
    startMowing: async () => { writes.push('start'); controller.observeNative(mk(1)); },
  };
  const device = {
    homey: {notifications: {createNotification: async () => {}}},
    getSetting: () => true, getData: () => ({id: 'A2'}), _api: api, _dockPos: {x: 0,y:0},
    _activeMapIndex: 0,
    _safeWrite: async (_, fn) => {await fn(); return true;},
  };
  controller = new CoreExternalStartRecovery({
    device, garage, now: () => time, sleep: async(ms) => {time += ms;}, log: () => {},
  });
  controller.observeNative(mk(0)); time += 50; controller.observeNative(mk(1));
  controller.observeTask({t:'TASK', d:{o:100,exe:true,status:true}});
  return {controller,writes};
}
(async () => {
  let r = makeScenario();
  assert.equal(await r.controller.intercept(), true, 'stationary geometry may recover contact loss');
  assert.ok(r.writes.includes('start'));

  r = makeScenario({moved:true});
  assert.equal(await r.controller.intercept(), false, 'moved mower must not restart');
  assert.equal(r.writes.includes('start'), false);

  r = makeScenario({unknownGeometry:true});
  assert.equal(await r.controller.intercept(), false, 'unverified geometry must fail closed');
  assert.equal(r.writes.includes('start'), false);

  r = makeScenario({contactLost:false});
  assert.equal(await r.controller.intercept(), true, 'stable native station path remains available');

  console.log('PASS: 4 native station-contact loss geometry tests');
})().catch(e => { console.error(e); process.exitCode = 1; });
