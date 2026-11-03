'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const NativeEventAdapter=require('../lib/mqtt/NativeEventAdapter');
const {describeTask,describeControl,describeNativeStatus}=require('../lib/mqtt/NativeMissionMeta');

test('native TASK 109 is observed without making up a point number',()=>{
  const t=describeTask({t:'TASK',d:{o:109,status:true,exe:true}});
  assert.equal(t.kind,'maintenance');
  assert.equal(t.nativePointIndex,null);
  assert.equal(t.attribution,'native_observation_only');
  assert.equal(describeTask({t:'TASK',d:{o:109,point:[4],status:true,exe:true}}).nativePointIndex,4);
  assert.equal(describeTask({t:'TASK',d:{o:109,point:[42]}}).nativePointIndex,null);
});
test('2:56 control phases do not get classified as start commands',()=>{
  assert.deepEqual(describeControl({status:[[1,0],[1,4],[1,2],[1,-1]]}).map(x=>x.phase),
    ['active_or_continue','paused','completed','queued']);
  assert.deepEqual(describeControl({status:[['bad','n/a']]}),[]);
});
test('native status 1/3/5/75 is safe metadata, not a motion authorization',()=>{
  assert.equal(describeNativeStatus(1).phase,'mowing');
  assert.equal(describeNativeStatus(3).phase,'paused');
  assert.equal(describeNativeStatus(5).phase,'returning');
  assert.equal(describeNativeStatus(75).phase,'maintenance_arrival');
  assert.equal(describeNativeStatus(999),null);
});
test('adapter emits metadata for pause, continue and native maintenance separately',()=>{
 const a=new NativeEventAdapter();
 const props={data:{method:'properties_changed',params:[
  {siid:2,piid:50,value:{t:'TASK',d:{o:109,status:true,exe:true,point:[2]}}},
  {siid:2,piid:56,value:{status:[[0,4],[0,0]]}},
  {siid:2,piid:1,value:75}
 ]}};
 const ev=a.ingest(props,{topic:'t',expectedTopic:'t',receivedAt:1000});
 const meta=ev.filter(x=>x.type==='mission_meta').map(x=>x.value);
 assert.equal(meta.length,4);
 assert.equal(meta[0].nativePointIndex,2);
 assert.deepEqual(meta.slice(1,3).map(x=>x.phase),['paused','active_or_continue']);
 assert.equal(meta[3].phase,'maintenance_arrival');
 assert.ok(meta.every(x=>x.attribution==='native_observation_only'));
});
test('no metadata from an unknown TASK opcode or forged authorizing flags',()=>{
 const a=new NativeEventAdapter();
 const payload={data:{method:'properties_changed',params:[
  {siid:2,piid:50,value:{t:'TASK',d:{o:999,allowMovement:true}}},
 ]}};
 const ev=a.ingest(payload,{receivedAt:100});
 assert.equal(ev.filter(x=>x.type==='mission_meta').length,0);
 assert.equal(ev[0].type,'task_raw');
});
