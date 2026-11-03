'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Tracker=require('../lib/mqtt/NativeCommandStateTracker');
function fixture(){
  let now=100000;
  const t=new Tracker({now:()=>now});
  const observe=(phase,ctx={},ts=now)=>{
    const event={type:'mission_meta',source:'siid:2:piid:56',
      observedAt:ts,value:{phase,attribution:'native_observation_only'}};
    return t.observe(event,ctx);
  };
  const outside={physicalOutside:true,nativeDockState:'OUT_OF_STATION',
    nativeDockAgeMs:200,garageMissionRecovering:false};
  return{t,observe,outside,advance:ms=>{now+=ms}};
}
test('paused outside with fresh station-out proof -> observed resume, never auto action',()=>{
  const x=fixture();x.observe('paused');x.advance(500);
  const a=x.observe('active_or_continue',x.outside);
  assert.equal(a.action,'resume_outside_observed');
  assert.equal(a.motionAuthorized,false);
  assert.equal(a.attribution,'native_observation_only');
});
test('control active without paused history -> activity not start',()=>{
  const x=fixture(),a=x.observe('active_or_continue',x.outside);
  assert.equal(a.action,'activity_observed');assert.equal(a.motionAuthorized,false);
});
test('paused with closed/unknown gate or stale dock stays ambiguous',()=>{
  const x=fixture();x.observe('paused');x.advance(400);
  const a=x.observe('active_or_continue',{physicalOutside:true,nativeDockState:'IN_STATION',
    nativeDockAgeMs:100});
  assert.equal(a.action,'continue_ambiguous');
  x.advance(2000);
  assert.equal(x.observe('active_or_continue',{physicalOutside:true,
    nativeDockState:'OUT_OF_STATION',nativeDockAgeMs:20000}).action,'continue_ambiguous');
});
test('missing garage coordinator evidence cannot turn pause into resume',()=>{
  const x=fixture();x.observe('paused');x.advance(1000);
  const a=x.observe('mowing',{nativeDockState:'OUT_OF_STATION',nativeDockAgeMs:100});
  assert.equal(a.action,'continue_ambiguous');
});
test('recovery owner prevents resume misclassification',()=>{
  const x=fixture();x.observe('paused');x.advance(1000);
  const a=x.observe('active_or_continue',{...x.outside,garageMissionRecovering:true});
  assert.equal(a.action,'continue_ambiguous');
});
test('duplicate active events do not produce second auto resume',()=>{
  const x=fixture();x.observe('paused');x.advance(200);
  assert.equal(x.observe('active_or_continue',x.outside).action,'resume_outside_observed');
  x.advance(100);assert.equal(x.observe('active_or_continue',x.outside),null);
});
test('native maintenance opcode 109 preserves explicit index but cannot authorize movement',()=>{
  const x=fixture();
  const a=x.t.observe({type:'mission_meta',observedAt:100000,source:'siid:2:piid:50',
    value:{kind:'maintenance',opcode:109,nativePointIndex:4}});
  assert.equal(a.action,'maintenance_task_observed');assert.equal(a.pointIndex,4);
  assert.equal(a.motionAuthorized,false);
  const b=x.t.observe({type:'mission_meta',observedAt:100000,source:'siid:2:piid:50',
    value:{kind:'maintenance',opcode:109,nativePointIndex:null}});
  assert.equal(b.pointIndex,null);
});
test('return telemetry is observation and clears paused resume context',()=>{
  const x=fixture();x.observe('paused');x.advance(500);
  const r=x.observe('returning',x.outside);
  assert.equal(r.action,'return_observed');x.advance(1500);
  assert.equal(x.observe('active_or_continue',x.outside).action,'activity_observed');
});
test('stale META packets ignored for safety classification',()=>{
  const x=fixture();
  assert.equal(x.observe('paused',{},50000),null);
  assert.equal(x.observe('paused',{},150000),null);
});
test('garage disabled does not suppress passive observability or authorize actuators',()=>{
  const x=fixture();x.observe('paused');x.advance(100);
  const a=x.observe('active_or_continue',{...x.outside,garageEnabled:false});
  assert.equal(a.action,'resume_outside_observed');assert.equal(a.motionAuthorized,false);
});
