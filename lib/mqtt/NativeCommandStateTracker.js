'use strict';

/**
 * Read-only classifier for native manufacturer events.
 *
 * 2:56 "active" does NOT prove a new Start or Resume. A Resume can be labeled
 * only after a recently observed PAUSED state together with fresh live native
 * OUT_OF_STATION evidence and the garage coordinator's already-outside state.
 * No event generated here authorizes an actuator or claims original-app origin.
 */
class NativeCommandStateTracker {
  constructor({ now=Date.now, pauseWindowMs=60000 }={}) {
    this.now=now;
    this.pauseWindowMs=pauseWindowMs;
    this.reset();
  }
  reset() {
    this.lastState=null;
    this.pausedAt=0;
    this.resumedAt=0;
    this.lastAction=null;
    this.lastActionAt=0;
    this.lastTask=null;
  }
  observe(event, context={}) {
    if (event?.type !== 'mission_meta' || !event.value
        || !Number.isFinite(event.observedAt)) return null;
    const ts=event.observedAt, v=event.value, current=this.now();
    if (ts > current+1500 || current-ts > 30000) return null;
    let action=null, kind=null, pointIndex=null;
    const outside= context.physicalOutside===true
      && context.nativeDockState==='OUT_OF_STATION'
      && Number.isFinite(context.nativeDockAgeMs)
      && context.nativeDockAgeMs>=0 && context.nativeDockAgeMs<=10000
      && context.garageMissionRecovering!==true;
    const recentlyPaused=this.pausedAt>0 && ts>=this.pausedAt
      && ts-this.pausedAt<=this.pauseWindowMs;
    if (v.kind==='maintenance') {
      kind='maintenance';
      pointIndex=Number.isInteger(v.nativePointIndex)
        && v.nativePointIndex>=1 && v.nativePointIndex<=5
        ? v.nativePointIndex : null;
      action='maintenance_task_observed';
      this.lastTask={kind,pointIndex,opcode:v.opcode,observedAt:ts};
    } else if (v.kind==='mowing') {
      kind='mowing';
      action='mowing_task_observed';
      this.lastTask={kind,pointIndex:null,opcode:v.opcode,observedAt:ts};
    } else if (v.phase==='paused') {
      // Status 2:1 or control phase 2:56. Neither proves vendor-app origin.
      if(this.lastState!=='paused') {
        this.pausedAt=ts;
        this.resumedAt=0;
      }
      this.lastState='paused';
      action='pause_observed';
    } else if (v.phase==='active_or_continue' || v.phase==='mowing') {
      // Repeated control-active/native-mowing pushes belong to the same
      // already-acknowledged continuation, not a fresh Resume event.
      if(recentlyPaused && this.resumedAt===this.pausedAt) return null;
      if(recentlyPaused && outside && this.resumedAt!==this.pausedAt) {
        action='resume_outside_observed';
        this.resumedAt=this.pausedAt;
      } else if (recentlyPaused) {
        action='continue_ambiguous';
      } else {
        action='activity_observed';
      }
      // In the ambiguous case do not overwrite the PAUSE evidence merely
      // because a stale or generic control notification arrived.
      if(action!=='continue_ambiguous') this.lastState='mowing';
    } else if(v.phase==='returning') {
      action='return_observed';
      this.lastState='returning';
      this.pausedAt=0;
    } else if(v.phase==='completed' || v.phase==='idle' || v.phase==='docked'
      || v.phase==='charging') {
      action='mission_state_observed';
      if(v.phase==='completed'||v.phase==='idle'||v.phase==='docked') {
        this.lastState=v.phase;this.pausedAt=0;
      }
    } else if(v.phase==='queued') {
      action='queued_observed';
    } else if(v.phase==='maintenance_arrival') {
      action='maintenance_arrival_hint';
    } else {
      return null;
    }
    if(!action) return null;
    // Suppress repeated generic state bursts, not distinct native task frames.
    const duplicate = this.lastAction===action
      && this.lastActionAt>0 && ts>=this.lastActionAt
      && ts-this.lastActionAt<1200 && !action.endsWith('task_observed');
    if(duplicate)return null;
    this.lastAction=action;this.lastActionAt=ts;
    return Object.freeze({
      action,kind,pointIndex,observedAt:ts,
      attribution:'native_observation_only',
      source:event.source,
      physicalOutsideConfirmed:outside,
      motionAuthorized:false,
    });
  }
}
module.exports=NativeCommandStateTracker;
