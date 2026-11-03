'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Tracker=require('../lib/mqtt/NativeCommandStateTracker');
const {describeTask}=require('../lib/mqtt/NativeMissionMeta');

function harness(){
 let now=200000; const tracker=new Tracker({now:()=>now});
 const next=(value,advance=0,context={})=>{
   now+=advance;
   return tracker.observe({type:'mission_meta',source:'siid:2:piid:50',
     observedAt:now,value},context);
 };
 const task=(index,more={})=>next(describeTask({t:'TASK',d:{o:109,exe:true,status:true,
   ...(index===null?{}:{point:[index]}),...more}}));
 const status=(phase,advance=20,ctx={})=>next({phase},advance,ctx);
 return{tracker,task,status,next};
}
test('P1 and P2 are distinct native point identities; status mowing is maintenance',()=>{
 const x=harness();
 const p1=x.task(1);assert.equal(p1.action,'maintenance_task_observed');
 assert.equal(p1.pointIndex,1);
 const s=x.status('mowing');assert.equal(s.action,'maintenance_transit_observed');
 assert.equal(s.pointIndex,1);assert.equal(s.kind,'maintenance');
 assert.equal(s.motionAuthorized,false);
 x.status('completed');
 const p2=x.task(2);assert.equal(p2.pointIndex,2);
 assert.equal(x.status('active_or_continue').pointIndex,2);
});
test('TASK109 without explicit point number must remain unknown, not P1',()=>{
 const x=harness();
 assert.equal(x.task(null).pointIndex,null);
 const s=x.status('mowing');assert.equal(s.kind,'maintenance');
 assert.equal(s.pointIndex,null);
});
test('conflicting TASK109 P1 then P2 within one active mission fails closed',()=>{
 const x=harness();x.task(1);
 const next=x.task(2);
 assert.equal(next.action,'maintenance_identity_conflict');
 assert.equal(next.pointIndex,null);
 assert.equal(x.tracker.activeMaintenanceContext().identityConflict,true);
 assert.equal(x.status('mowing').pointIndex,null);
});
test('non-executing TASK109 is only a hint and cannot hijack mowing',()=>{
 const x=harness();
 const hint=x.next(describeTask({t:'TASK',d:{o:109,point:[2],exe:false,status:false}}));
 assert.equal(hint.action,'maintenance_task_hint');
 assert.equal(x.tracker.activeMaintenanceContext(),null);
 assert.equal(x.status('mowing').action,'activity_observed');
});
test('generic TASK100 while TASK109 active cannot silently overwrite maintenance',()=>{
 const x=harness();x.task(2);
 const echoed=x.next(describeTask({t:'TASK',d:{o:100,exe:true,status:true}}));
 assert.equal(echoed.action,'mowing_task_during_maintenance_ambiguous');
 assert.equal(x.status('mowing').action,'maintenance_transit_observed');
});
test('pause/continue and resume on P2 remain maintenance, never lawn mowing',()=>{
 const x=harness();x.task(2);
 assert.equal(x.status('paused').action,'maintenance_pause_observed');
 assert.equal(x.status('active_or_continue').action,'maintenance_continue_ambiguous');
 const outside={physicalOutside:true,nativeDockState:'OUT_OF_STATION',
   nativeDockAgeMs:100,garageMissionRecovering:false};
 const resumed=x.status('active_or_continue',400,outside);
 assert.equal(resumed.action,'maintenance_resume_outside_observed');
 assert.equal(resumed.pointIndex,2);assert.equal(resumed.kind,'maintenance');
});
test('maintenance arrival hint is not destination/arrival verification',()=>{
 const x=harness();x.task(2);
 const s=x.status('maintenance_arrival',500);
 assert.equal(s.action,'maintenance_arrival_hint');
 assert.equal(s.pointIndex,2);assert.equal(s.motionAuthorized,false);
});
test('return/completion close maintenance classification window',()=>{
 const x=harness();x.task(1);
 x.status('returning');assert.equal(x.tracker.activeMaintenanceContext(),null);
 assert.equal(x.status('mowing').action,'activity_observed');
 x.task(2);x.status('completed');assert.equal(x.tracker.activeMaintenanceContext(),null);
});
test('stale TASK109 cannot classify a later new mowing mission as maintenance',()=>{
 const x=harness();x.task(2);
 assert.equal(x.status('mowing',1200001).action,'activity_observed');
 assert.equal(x.tracker.activeMaintenanceContext(),null);
});
