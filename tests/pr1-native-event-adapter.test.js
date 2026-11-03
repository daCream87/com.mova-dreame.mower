'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const NativeEventAdapter = require('../lib/mqtt/NativeEventAdapter');

test('read-only adapter normalizes native events without inventing movement authorization', () => {
  const adapter = new NativeEventAdapter();
  const packet = {data:{method:'properties_changed',params:[
    {siid:1,piid:1,value:{dockingState:'IN_STATION',undocking:1}},
    {siid:2,piid:1,value:5},
    {siid:2,piid:50,value:{o:109,d:{point:[2]}}},
  ]}};
  const events = adapter.ingest(packet,{topic:'/status/mower/',expectedTopic:'/status/mower/',receivedAt:100});
  assert.deepEqual(events.map(x=>x.type),['dock_raw','status_raw','task_raw']);
  assert.equal(events[2].hint,'maintenance_opcode_observed');
  assert.equal(events[2].origin,undefined);
  assert.equal(events.some(x=>x.allowMovement===true),false);
  assert.equal(Object.isFrozen(events[0]),true);
});
test('no repeated action hint on duplicate packets inside bounded window', () => {
  const adapter = new NativeEventAdapter();
  const p={data:{method:'properties_changed',params:[{siid:2,piid:50,value:{o:109}}]}};
  assert.equal(adapter.ingest(p,{receivedAt:1000}).length,1);
  assert.equal(adapter.ingest(p,{receivedAt:1200}).length,0);
  assert.equal(adapter.ingest(p,{receivedAt:2100}).length,1);
});
test('stale generation or wrong MQTT topic is refused',()=>{
  const adapter = new NativeEventAdapter();
  const p={method:'properties_changed',params:[{siid:2,piid:1,value:5}]};
  assert.deepEqual(adapter.ingest(p,{topic:'wrong',expectedTopic:'right'}),[]);
  assert.deepEqual(adapter.ingest(p,{topic:'right',expectedTopic:'right',generation:2,currentGeneration:3}),[]);
  assert.equal(adapter.ingest(p,{topic:'right',expectedTopic:'right',generation:3,currentGeneration:3}).length,1);
});
test('non-json/invalid/unknown packets cannot produce events',()=>{
  const adapter = new NativeEventAdapter();
  assert.deepEqual(adapter.ingest('{'),[]);
  assert.deepEqual(adapter.ingest([]),[]);
  assert.deepEqual(adapter.ingest({data:{method:'properties_changed',params:[{}]}}),[]);
  assert.deepEqual(adapter.ingest({data:{method:'unrecognized',params:[{siid:2,piid:1,value:5}]}}),[]);
});
test('disposal/reset clears deduplication state',()=>{
  const adapter = new NativeEventAdapter();
  const p={data:{method:'properties_changed',params:[{siid:2,piid:1,value:5}]}};
  assert.equal(adapter.ingest(p,{receivedAt:100}).length,1);
  assert.equal(adapter.ingest(p,{receivedAt:100}).length,0);
  adapter.reset();
  assert.equal(adapter.ingest(p,{receivedAt:100}).length,1);
});
