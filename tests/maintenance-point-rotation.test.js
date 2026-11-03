'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { nextMaintenancePoint } = require('../lib/maintenance/MaintenancePointRotation');

test('garage-off never auto-rotates and permits verified primary only',()=>{
 const result=nextMaintenancePoint({mode:'alternate',garageEnabled:false,
   confirmedIndexes:[1,2,3],primary:2,lastCompletedIndex:2});
 assert.deepEqual(result,{index:2,reason:'fixed',rotated:false});
});
test('alternate cycles only through verified native destinations',()=>{
 const input={mode:'alternate',garageEnabled:true,confirmedIndexes:[1,3,5],primary:1};
 assert.equal(nextMaintenancePoint({...input,lastCompletedIndex:1}).index,3);
 assert.equal(nextMaintenancePoint({...input,lastCompletedIndex:3}).index,5);
 assert.equal(nextMaintenancePoint({...input,lastCompletedIndex:5}).index,1);
});
test('one verified native point is not a shuffle; missing primary holds',()=>{
 assert.deepEqual(nextMaintenancePoint({garageEnabled:true,mode:'alternate',
   confirmedIndexes:[3],primary:3,lastCompletedIndex:3}),
   {index:3,reason:'fixed',rotated:false});
 assert.equal(nextMaintenancePoint({garageEnabled:true,mode:'alternate',
   confirmedIndexes:[],primary:1}).index,null);
 assert.equal(nextMaintenancePoint({garageEnabled:false,confirmedIndexes:[2],
   primary:1}).index,null);
});
test('active mission cannot change pinned target on repeated status',()=>{
 const args={garageEnabled:true,mode:'alternate',confirmedIndexes:[1,2,3],
   missionActive:true,missionPinnedIndex:2,lastCompletedIndex:2};
 assert.deepEqual(nextMaintenancePoint(args),nextMaintenancePoint(args));
 assert.equal(nextMaintenancePoint(args).index,2);
 assert.equal(nextMaintenancePoint({...args,confirmedIndexes:[1,3]}).index,null);
});
test('names and map taps are not inputs; no unverified fallback',()=>{
 const result=nextMaintenancePoint({garageEnabled:true,mode:'alternate',
   confirmedIndexes:[2,4],lastCompletedIndex:4,primary:1});
 assert.equal(result.index,2);
 assert.equal(result.rotated,true);
});
