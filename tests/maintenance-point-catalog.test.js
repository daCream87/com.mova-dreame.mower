'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Catalog=require('../lib/maintenance/MaintenancePointCatalog');

function fake(){
 const data=new Map();
 return {
  _activeMapIndex:0,
  _cachedMapData:null,
  getStoreValue:async k=>data.get(k),
  setStoreValue:async (k,v)=>{data.set(k,v)},
  getCapabilityValue:()=> 'idle',
  getSetting:()=> false,
  data
 };
}
test('P1 is the only native point unless actual current-map geometry exists',async()=>{
 const d=fake(),c=new Catalog(d);
 assert.deepEqual((await c.getConfig()).available,[1]);
 await c.save({index:2,name:'Lawn edge',primary:false});
 assert.equal((await c.getConfig()).names['2'],'Lawn edge');
 assert.deepEqual((await c.getConfig()).available,[1]);
 await assert.rejects(()=>c.save({index:2,name:'Lawn edge',primary:true}),/not verified/);
});
test('A removed primary returns to P1 without changing manufacturer geometry',async()=>{
 const d=fake(),c=new Catalog(d);
 d._cachedMapData={nativeMaintenancePoints:[{index:2,x:50,y:60,mapIndex:0}]};
 await c.save({index:2,name:'Side lawn',primary:true});
 assert.equal((await c.getConfig()).selected,2);
 await c.save({index:2,name:'',primary:false});
 assert.equal((await c.getConfig()).selected,1);
 assert.equal((await c.getConfig()).names['2'],undefined);
});
test('native point proof is scoped to the active map',async()=>{
 const d=fake(),c=new Catalog(d);
 d._cachedMapData={nativeMaintenancePoints:[{index:3,x:20,y:40,mapIndex:1}]};
 assert.deepEqual((await c.getConfig()).available,[1]);
 d._activeMapIndex=1;
 assert.deepEqual((await c.getConfig()).available,[1,3]);
});
test('invalid indexes, missing names and moving edits are rejected',async()=>{
 const d=fake(),c=new Catalog(d);
 await assert.rejects(()=>c.save({index:6,name:'Invalid',primary:false}),/1–5/);
 await assert.rejects(()=>c.save({index:2,name:'',primary:true}),/Name the point/);
 d.getCapabilityValue=()=> 'mowing';
 await assert.rejects(()=>c.save({index:1,name:'P1',primary:true}),/stationary/);
});
