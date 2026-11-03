'use strict';

/**
 * Native original-app mission safety, independent of the manufacturer's MQTT
 * transport and Homey UI. Reacts only AFTER a manufacturer MQTT notification.
 *
 * FAIL-SAFE POLICY: a task cannot be automatically resumed unless a real OPEN
 * door contact and stationary native station evidence were observed. Unknown
 * original-app task = hold and ask user to reissue (never invent P1/mowing).
 */
class OriginalAppMissionGuard {
  constructor(device, { now = Date.now, wait = (ms) => new Promise(r => setTimeout(r,ms)) } = {}) {
    this.device = device;
    this.now = now;
    this.wait = wait;
    this.epoch = 0;
    this.inFlight = null;
    this.returnInFlight = null;
    this.lastIntentAt = 0;
    this.latestDock = null;
    this.recoveredStation = null;
    this.taskCandidate = null;
    this.lastReturnAt = 0;
    this.disposed = false;
  }

  enabled() {
    return !this.disposed && this.device.getSetting('garage_mode_enabled') === true
      && this.device._garageSafety?.enabled?.() === true;
  }
  deactivate() {
    this.epoch += 1;
    this.inFlight = null;
    this.returnInFlight = null;
    this.taskCandidate = null;
    this.latestDock = null;
    this.recoveredStation = null;
  }
  dispose() { this.deactivate(); this.disposed = true; }
  _current(epoch) { return this.enabled() && this.epoch === epoch; }
  _notice(message) {
    this.device.log('[mqtt-guard]', message);
    // No unsolicited Timeline notices; user can inspect Homey diagnostics.
  }
  _physicalOpenProven(minAt = 0) {
    const g = this.device._garageSafety;
    const at = Number(g?._lastGateOpenHandshakeAt || 0);
    const age = this.now() - at;
    return !!g?.sensorEnabled?.() && g?._lastSensorContactState === 'open'
      && g?.isDoorOpenStable?.() === true && at > 0 && at >= minAt && age >= 0
      && age <= 120000;
  }
  _ownerOccupied() {
    const g = this.device._garageSafety;
    return !!(g?._outbound || g?._safeReturnInProgress || g?._returnGuardActive
      || g?.isReturnCycleActive?.() || (g?._missionOutside && !this._dockInStation()));
  }
  _dockInStation() {
    const d = this.latestDock;
    return d?.dockingState === 'IN_STATION'
      && this.now() - d.observedAt <= 10000 && this.now() >= d.observedAt;
  }
  noteNativeDock(event) {
    if (!event || event.type !== 'dock_state') return;
    this.latestDock = { ...event.value, observedAt:event.observedAt };
    if (this.inFlight && event.value?.dockingState === 'IN_STATION'
        && Number(event.value.undocking) === 0 && event.observedAt >= this.lastIntentAt) {
      this.recoveredStation = { ...event.value, observedAt:event.observedAt };
    }
    if (this.inFlight && event.value?.dockingState !== 'IN_STATION') {
      this.recoveredStation = null;
    }
  }
  noteTask(event) {
    const task = event?.value?.t === 'TASK' ? event.value.d : null;
    if (!task || task.exe !== true || ![100,101,102,103,109].includes(Number(task.o))) return;
    // A settings/TASK descriptor alone is never treated as a start trigger.
    if (!this.inFlight || event.observedAt < this.lastIntentAt
        || event.observedAt - this.lastIntentAt > 5000) return;
    if (this.taskCandidate?.o === 109 && Number(task.o) !== 109) return;
    this.taskCandidate = JSON.parse(JSON.stringify(task));
  }

  onUndockIntent(event) {
    if (!this.enabled() || !event || event.type !== 'native_undock_intent') return false;
    if (this.inFlight) return true;
    if (this._ownerOccupied()) return false;
    if (this._physicalOpenProven()) return false;
    const now = this.now();
    if (this.lastIntentAt && now - this.lastIntentAt < 60000) return true;
    this.lastIntentAt = now;
    this.recoveredStation = null;
    this.taskCandidate = null;
    const epoch = this.epoch;
    this.inFlight = this._guardDeparture(epoch).catch(e => {
      this.device.error('[mqtt-guard] departure:',e.message);
      return false;
    }).finally(() => { if (epoch === this.epoch) this.inFlight = null; });
    return true;
  }

  /** Suppress legacy unguarded gate OPEN when native mower status is ambiguous. */
  onMowingStatus() {
    if (!this.enabled()) return false;
    if (this._physicalOpenProven() || this._ownerOccupied()) return false;
    if (this.inFlight) return true;
    if (this._dockInStation() && this.latestDock.undocking === 1) {
      this._notice('mowing while in station without confirmed rising edge; no unverified gate action');
    }
    // Do not issue an arbitrary lawn PAUSE when station proof is absent/stale.
    return true;
  }

  async _write(label, fn) {
    if (!this.device._api) return false;
    return this.device._safeWrite ? this.device._safeWrite(label,fn) : fn().then(() => true,()=>false);
  }
  async _nativeStationStopped(epoch) {
    const did = this.device.getData().id;
    for (let attempt = 0; attempt < 8 && this._current(epoch); attempt += 1) {
      const station = this.recoveredStation;
      const latest = this.latestDock;
      if (station && latest && latest.dockingState === 'IN_STATION'
          && Number(latest.undocking) === 0
          && this.now() - station.observedAt >= 0
          && this.now() - station.observedAt <= 15000) {
        const status = await this.device._api.getDeviceStatus(did).catch(() => null);
        const code = Number(status?.latestStatus);
        if ([2,3,6,13,15,16,24,29,75].includes(code)) return true;
      }
      await this.wait(350);
    }
    return false;
  }
  async _guardDeparture(epoch) {
    const g = this.device._garageSafety;
    const did = this.device.getData().id;
    if (!this._current(epoch) || this._ownerOccupied()) return false;
    this._notice('native undock detected: PAUSE -> STOP before door operation');
    const paused = await this._write('pr1_native_external_pause',()=>this.device._api.pause(did));
    if (paused === false || !this._current(epoch)) {
      this._notice('PAUSE unsuccessful; no automatic gate command'); return false;
    }
    const stopped = await this._write('pr1_native_external_stop',()=>this.device._api.stopMowing(did));
    if (stopped === false || !this._current(epoch)) {
      this._notice('STOP unsuccessful; no automatic gate command'); return false;
    }
    if (!await this._nativeStationStopped(epoch) || !this._current(epoch)) {
      this._notice('no fresh stationary native dock proof; gate held for supervised recovery'); return false;
    }
    if (!g.sensorEnabled?.() || !g.sensorHealthy?.()) {
      this._notice('door sensor missing/unhealthy: no automatic gate release');return false;
    }
    const open = await g.ensureDoorOpen('pr1_native_original_app_start',{allowOpenFromDanger:true,minWaitMs:0})
      .catch(() => false);
    if (open !== true || !this._current(epoch) || !this._physicalOpenProven(this.lastIntentAt)) {
      this._notice('real door-open contact not verified; original task remains stopped'); return false;
    }
    // An unknown task remains held for operator reissue. Cached dock telemetry
    // must not automatically close the open gate during this recovery window.
    g._homeCloseArmed = false;
    const task = this.taskCandidate;
    if (!task || ![100,101,102,103].includes(Number(task.o))) {
      this._notice('gate open, original task type not safely recoverable; reissue it manually');
      return false;
    }
    if (!this._current(epoch) || !this._physicalOpenProven(this.lastIntentAt)
        || !this.recoveredStation || this.latestDock?.dockingState !== 'IN_STATION') return false;
    const map = Number(this.device._activeMapIndex || 0);
    let command;
    if (Array.isArray(task.area_id) && task.area_id.length) command=()=>this.device._api.startSpotMowing(did,task.area_id,map);
    else if (Array.isArray(task.region_id) && task.region_id.length && [100,102].includes(Number(task.o)))
      command=()=>this.device._api.startZoneMowing(did,task.region_id,map);
    else if (Number(task.o) === 101) command=()=>this.device._api.startEdgeMowing(did,map,Array.isArray(task.edge)?task.edge:null);
    else if (Number(task.o) === 100) command=()=>this.device._api.startMowing(did);
    if (!command) { this._notice('target IDs incomplete; manual reissue needed');return false; }
    g._homeCloseArmed = true;
    await g._beginOutbound('PR1_NATIVE_START_RECOVERED',true);
    if (!this._current(epoch) || !this._physicalOpenProven(this.lastIntentAt)) return false;
    const accepted = await this._write('pr1_native_start_reissue',command);
    if (accepted === false) {this._notice('reissue rejected; manual recovery required');return false;}
    this._notice('original manufacturer mowing task safely reissued with open contact');
    return true;
  }

  onReturnStatus() {
    if (!this.enabled() || this.inFlight || this.returnInFlight) return false;
    if (this.device._dockCommandIntentUntil > this.now()) return false;
    const g = this.device._garageSafety;
    if (g?._returnGuardActive || g?._safeReturnInProgress || g?._externalReturnHandling) return false;
    if (g?.isDockedHomeStatus?.() && !g?._missionOutside) return false;
    if (this.lastReturnAt && this.now()-this.lastReturnAt < 45000) return true;
    this.lastReturnAt = this.now();
    const epoch=this.epoch;
    // Reuse upstream return route selection; dedicated source requests an
    // earlier PAUSE rather than waiting for an approaching safety-line sample.
    this.returnInFlight=g._interceptExternalReturn('pr1_mqtt_early_return','returning')
      .catch(e=>{this.device.error('[mqtt-guard] return:',e.message);return false;})
      .finally(()=>{if(epoch===this.epoch)this.returnInFlight=null;});
    return true;
  }
}
module.exports = OriginalAppMissionGuard;
