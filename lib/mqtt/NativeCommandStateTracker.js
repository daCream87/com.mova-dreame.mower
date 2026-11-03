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
    // This is a task-classification HINT only. It is not native map proof,
    // a physical arrival or permission to travel to a P1–P5 coordinate.
    this.activeMaintenance=null;
  }

  activeMaintenanceContext(maxAgeMs=120000) {
    const m=this.activeMaintenance;
    if(!m)return null;
    const age=this.now()-m.observedAt;
    if(age<0||age>maxAgeMs)return null;
    return Object.freeze({...m,active:true,ageMs:age});
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
    const currentMaintenance=this.activeMaintenanceContext();
    if (v.kind==='maintenance') {
      kind='maintenance';
      const explicitIndex=Number.isInteger(v.nativePointIndex)
        && v.nativePointIndex>=1 && v.nativePointIndex<=5
        ? v.nativePointIndex : null;
      // Only an executing/active TASK 109 establishes a native maintenance
      // task context. A generic TASK descriptor may also be a settings echo.
      if(v.executable===true && v.reportedActive===true) {
        const previous=currentMaintenance;
        const conflict=Boolean(previous?.identityConflict
          || (previous && previous.pointIndex!==null
            && explicitIndex!==null && previous.pointIndex!==explicitIndex));
        // An index omitted in a subsequent native report cannot inherit P1/P2.
        // Contradictory P1/P2 reports must NEVER be silently reconciled.
        pointIndex=conflict?null:explicitIndex;
        this.activeMaintenance={pointIndex,identityConflict:conflict,
          observedAt:ts,opcode:109,active:true};
        action=conflict?'maintenance_identity_conflict':'maintenance_task_observed';
      } else {
        pointIndex=explicitIndex;
        action='maintenance_task_hint';
      }
      this.lastTask={kind,pointIndex,opcode:v.opcode,observedAt:ts};
    } else if (v.kind==='mowing') {
      // Do not overwrite an active maintenance mission on a generic cloud
      // TASK. Manufacturer status can still report "mowing" during P1–P5.
      if(currentMaintenance) {
        kind='maintenance';pointIndex=currentMaintenance.pointIndex;
        action='mowing_task_during_maintenance_ambiguous';
      } else {
        kind='mowing';action='mowing_task_observed';
        this.lastTask={kind,pointIndex:null,opcode:v.opcode,observedAt:ts};
      }
    } else if (v.phase==='paused') {
      // PAUSE remains the actual motor state; the task kind stays maintenance.
      if(this.lastState!=='paused') {
        this.pausedAt=ts;
        this.resumedAt=0;
      }
      this.lastState='paused';
      kind=currentMaintenance?'maintenance':null;
      pointIndex=currentMaintenance?.pointIndex??null;
      action=currentMaintenance?'maintenance_pause_observed':'pause_observed';
    } else if (v.phase==='active_or_continue' || v.phase==='mowing') {
      // A generic vendor "mowing/active" status may mean transit to P1–P5.
      // Prefer fresh executing TASK 109 over this generic transport state.
      kind=currentMaintenance?'maintenance':null;
      pointIndex=currentMaintenance?.pointIndex??null;
      if(recentlyPaused && this.resumedAt===this.pausedAt) return null;
      if(recentlyPaused && outside && this.resumedAt!==this.pausedAt) {
        action=currentMaintenance?'maintenance_resume_outside_observed':'resume_outside_observed';
        this.resumedAt=this.pausedAt;
      } else if (recentlyPaused) {
        action=currentMaintenance?'maintenance_continue_ambiguous':'continue_ambiguous';
      } else {
        action=currentMaintenance?'maintenance_transit_observed':'activity_observed';
      }
      if(!action.endsWith('_ambiguous'))this.lastState='mowing';
    } else if(v.phase==='returning') {
      action='return_observed';
      this.lastState='returning';
      this.pausedAt=0;
      this.activeMaintenance=null;
    } else if(v.phase==='completed' || v.phase==='idle' || v.phase==='docked'
      || v.phase==='charging') {
      kind=currentMaintenance?'maintenance':null;
      pointIndex=currentMaintenance?.pointIndex??null;
      action='mission_state_observed';
      if(v.phase==='completed'||v.phase==='idle'||v.phase==='docked') {
        this.lastState=v.phase;this.pausedAt=0;
      }
      if(v.phase==='completed')this.activeMaintenance=null;
    } else if(v.phase==='queued') {
      kind=currentMaintenance?'maintenance':null;
      pointIndex=currentMaintenance?.pointIndex??null;
      action='queued_observed';
    } else if(v.phase==='maintenance_arrival') {
      kind='maintenance';pointIndex=currentMaintenance?.pointIndex??null;
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
