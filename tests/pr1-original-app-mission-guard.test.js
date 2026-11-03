'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const OriginalAppMissionGuard=require('../lib/mqtt/OriginalAppMissionGuard');

function fixture({ enabled=true, sensor=true, statusCode=3, open=true, station=true,
   startTask=null }={}){
 const calls=[];
 const device={
   getSetting:key=>key==='garage_mode_enabled' ? enabled : null,
   getData:()=>({id:'mower-fixture'}),
   log:()=>{},error:()=>{},
   _dockCommandIntentUntil:0,
   _activeMapIndex:0,
   _safeWrite:async(label,fn)=>{try{const result=await fn();return result!==false;}catch{return false;}},
 };
 const garage={
   enabled:()=>enabled, sensorEnabled:()=>sensor,sensorHealthy:()=>sensor,
   isDoorOpenStable:()=>open && garage._lastSensorContactState==='open',
   _lastSensorContactState:null,_lastGateOpenHandshakeAt:0,
   _outbound:null,_missionOutside:false,_returnGuardActive:false,
   _safeReturnInProgress:false,_externalReturnHandling:false,
   isReturnCycleActive:()=>false,isDockedHomeStatus:()=>false,
   _beginOutbound:async()=>{calls.push('outbound');},
   ensureDoorOpen:async()=>{calls.push('open');if(!open)return false;
      garage._lastSensorContactState='open';garage._lastGateOpenHandshakeAt=Date.now();return true;},
   _interceptExternalReturn:async()=>{calls.push('return_guard');return true;},
 };
 device._garageSafety=garage;
 let guard;
 device._api={
   pause:async()=>{calls.push('pause');
     if(startTask)guard.noteTask({type:'task_raw',observedAt:Date.now(),value:
       {t:'TASK',d:{...startTask,exe:true,status:true}}});return true;},
   stopMowing:async()=>{calls.push('stop');
     if(station)guard.noteNativeDock({type:'dock_state',observedAt:Date.now(),
       value:{dockingState:'IN_STATION',undocking:0}});
     return true;},
   getDeviceStatus:async()=>statusCode===null?null:{latestStatus:statusCode},
   startMowing:async()=>{calls.push('start');return true;},
   startZoneMowing:async()=>{calls.push('start_zone');return true;},
   startSpotMowing:async()=>{calls.push('start_spot');return true;},
   startEdgeMowing:async()=>{calls.push('start_edge');return true;},
 };
 guard=new OriginalAppMissionGuard(device,{wait:async()=>{}});
 return{device,garage,guard,calls};
}
function undock(guard){
 const now=Date.now();
 guard.noteNativeDock({type:'dock_state',observedAt:now,
   value:{dockingState:'IN_STATION',undocking:1}});
 return guard.onUndockIntent({type:'native_undock_intent',observedAt:now,value:
   {dockingState:'IN_STATION',undocking:1}});
}

test('Garage Mode OFF preserves upstream and sends no commands',async()=>{
 const f=fixture({enabled:false});assert.equal(undock(f.guard),false);
 assert.deepEqual(f.calls,[]);
});
test('early native undock uses PAUSE then STOP, no unknown automatic start',async()=>{
 const f=fixture();assert.equal(undock(f.guard),true);
 await f.guard.inFlight;
 assert.deepEqual(f.calls,['pause','stop','open']);
 assert.equal(f.garage._homeCloseArmed,false);
});
test('known native mowing task restores only after real gate-open handshake',async()=>{
 const f=fixture({startTask:{o:100}});
 assert.equal(undock(f.guard),true);
 await f.guard.inFlight;
 assert.deepEqual(f.calls,['pause','stop','open','outbound','start']);
});
test('native maintenance opcode 109 never falls back to mowing / P1',async()=>{
 const f=fixture({startTask:{o:109}});
 assert.equal(undock(f.guard),true);await f.guard.inFlight;
 assert.deepEqual(f.calls,['pause','stop','open']);
});
test('failed physical door-open proof prevents reissue',async()=>{
 const f=fixture({open:false,startTask:{o:100}});
 assert.equal(undock(f.guard),true);await f.guard.inFlight;
 assert.deepEqual(f.calls,['pause','stop','open']);
});
test('unhealthy or missing sensor cannot auto-open or auto-resume',async()=>{
 const f=fixture({sensor:false,startTask:{o:100}});
 assert.equal(undock(f.guard),true);await f.guard.inFlight;
 assert.deepEqual(f.calls,['pause','stop']);
});
test('without fresh native stationary station proof no gate or motion release',async()=>{
 const f=fixture({station:false,startTask:{o:100}});
 assert.equal(undock(f.guard),true);await f.guard.inFlight;
 assert.deepEqual(f.calls,['pause','stop']);
});
test('META pause/continue alone never starts/pauses/opens gate',async()=>{
 const f=fixture();
 f.guard.noteMissionMeta({type:'mission_meta',observedAt:Date.now(),
   source:'siid:2:piid:56',value:{phase:'active_or_continue',attribution:'native_observation_only'}});
 assert.equal(f.guard.getMissionMeta()?.phase,'active_or_continue');
 assert.deepEqual(f.calls,[]);
});
test('return status reuses existing upstream return safety owner',async()=>{
 const f=fixture();f.garage._missionOutside=true;
 assert.equal(f.guard.onReturnStatus(),true);
 await f.guard.returnInFlight;
 assert.deepEqual(f.calls,['return_guard']);
});
test('deactivation clears the active native META and stops motion ownership',async()=>{
 const f=fixture();
 f.guard.noteMissionMeta({type:'mission_meta',observedAt:Date.now(),
   source:'s',value:{phase:'paused'}});
 f.guard.deactivate();assert.equal(f.guard.getMissionMeta(),null);
 f.guard.dispose();assert.equal(undock(f.guard),false);
 assert.deepEqual(f.calls,[]);
});
