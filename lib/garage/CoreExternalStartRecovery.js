'use strict';

/**
 * Isolated native external-start controller for MOVA A2.
 * Ports the CORE 1.2.184 early undock -> PAUSE -> STOP -> verified gate ->
 * original-task recovery flow, with intentionally stricter fail-closed checks.
 *
 * IMPORTANT: This remains opt-in until hardware validation against 1.1.46.
 * Never infer a missing maintenance point index and never resume an old STOP task.
 */
const { decodeNativeDockFrame } = require('./NativeUndockingMilestone');
const sleepDefault = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TASK_CODES = new Set([100, 101, 102, 103, 109]);
const MOW_CODES = new Set([100, 101, 102, 103]);

class CoreExternalStartRecovery {
  constructor({ device, garage, now = Date.now, sleep = sleepDefault, log = () => {} }) {
    this.device = device;
    this.garage = garage;
    this.now = now;
    this.sleep = sleep;
    this.log = log;
    this.station = null;
    this.stationAt = 0;
    this.stationLost = false;
    this.stopProofAt = 0;
    this.task = null;
    this.taskAt = 0;
    this.active = false;
    this.abortUntil = 0;
    this.phase = 'IDLE';
    this.lastEdgeAt = 0;
  }

  get armed() {
    // A device update must never silently start controlling a moving mower.
    return this.device.getSetting('garage_external_core_intercept_enabled') === true;
  }

  emit(phase, fields = {}) {
    this.phase = phase;
    this.log('[core-external-start]', JSON.stringify({
      at: new Date(this.now()).toISOString(), phase, ...fields,
    }));
  }

  observeNative(value) {
    const frame = decodeNativeDockFrame(value);
    if (!frame) return null;
    const previous = this.station;
    const previousAt = this.stationAt;
    this.station = frame;
    this.stationAt = this.now();
    const fresh = !!previousAt && this.stationAt >= previousAt
      && this.stationAt - previousAt <= 30000;
    const edge = fresh && previous.dockingState === 'IN_STATION'
      && previous.undocking === 0 && frame.dockingState === 'IN_STATION'
      && frame.undocking === 1;
    if (this.active) {
      // Only changes AFTER a proven STOP settle invalidate the retained dock window.
      if (this.stopProofAt && (frame.dockingState !== 'IN_STATION' || frame.undocking !== 0)) {
        this.stationLost = true;
      }
      if (frame.dockingState === 'IN_STATION' && frame.undocking === 0 && !this.stopProofAt) {
        this.stopProofAt = this.stationAt;
      }
    }
    return edge ? { type: 'native-undock-edge', at: this.stationAt, frame } : { type: 'sample', frame };
  }

  observeTask(value) {
    const task = value?.t === 'TASK' ? value.d : null;
    if (!task || task.exe !== true || !TASK_CODES.has(Number(task.o))) return false;
    // After STOP, any task with opcode=3 is ignored, and opcode 109 retains priority.
    if (this.active && Number(this.task?.o) === 109) return false;
    this.task = JSON.parse(JSON.stringify(task));
    this.taskAt = this.now();
    this.emit(this.phase, { capturedOpcode: Number(task.o), taskStatus: task.status });
    return true;
  }

  freshStation(maxAgeMs = 5000) {
    const age = this.now() - this.stationAt;
    return this.stationAt && age >= 0 && age <= maxAgeMs ? this.station : null;
  }

  eligible() {
    if (!this.armed || !this.garage?.enabled?.() || this.active || this.now() < this.abortUntil) return false;
    if (this.garage._outbound || this.garage._missionOutside || this.garage._safeReturnInProgress) return false;
    // This first port refuses degraded/time-only gate proofs.
    if (!this.garage.sensorEnabled?.() || !this.garage.sensorHealthy?.()) return false;
    if (this.garage.isDoorOpenStable?.() && this.garage._doorOpenReleaseVerified?.()) return false;
    const dock = this.freshStation();
    return !!dock && dock.dockingState === 'IN_STATION' && dock.undocking === 1;
  }

  async write(label, fn) {
    // Device _safeWrite absorbs failures. Convert false into a hard rejection.
    if (typeof this.device._safeWrite === 'function') {
      return (await this.device._safeWrite(label, async () => {
        const r = await fn();
        if (r === false || (r && typeof r === 'object' && r.code != null && Number(r.code) !== 0)) {
          throw new Error(label + ': device rejected command');
        }
      })) === true;
    }
    const r = await fn();
    return r !== false;
  }

  async until(predicate, durationMs, intervalMs = 100) {
    const begin = this.now();
    while (this.now() - begin < durationMs) {
      if (predicate()) return true;
      await this.sleep(intervalMs);
    }
    return !!predicate();
  }

  stoppedInStation(sinceAt) {
    const dock = this.freshStation(5000);
    return !!dock && dock.dockingState === 'IN_STATION' && dock.undocking === 0
      && this.stationAt >= sinceAt && this.stopProofAt >= sinceAt
      && !this.stationLost;
  }

  gateVerified(requestedAt) {
    return !!this.garage.isDoorOpenStable?.()
      && this.garage._lastSensorContactState === 'open'
      && Number(this.garage._lastGateOpenHandshakeAt || 0) >= requestedAt
      && !!this.garage._doorOpenReleaseVerified?.();
  }

  async dispatchTask(did, task) {
    const api = this.device._api;
    const map = Number(this.device._activeMapIndex || 0);
    const opcode = Number(task.o);
    if (Array.isArray(task.area_id) && task.area_id.length && [100, 103].includes(opcode)) {
      return api.startSpotMowing(did, task.area_id, map);
    }
    if (Array.isArray(task.region_id) && task.region_id.length && [100, 102].includes(opcode)) {
      return api.startZoneMowing(did, task.region_id, map);
    }
    if (opcode === 101) return api.startEdgeMowing(did, map, Array.isArray(task.edge) ? task.edge : null);
    if (opcode === 100) return api.startMowing(did);
    throw new Error('original mowing target missing or unsupported');
  }

  async intercept(source = 'native_undock') {
    if (!this.eligible()) return false;
    this.active = true; // synchronous ownership, before first await
    this.lastEdgeAt = this.now();
    this.stationLost = false;
    this.stopProofAt = 0;
    if (this.now() - this.taskAt > 5000) this.task = null;
    const did = this.device.getData().id;
    let success = false;
    this.emit('INTERCEPT', { source });
    try {
      if (!(await this.write('core_external_pause', () => this.device._api.pause(did)))) {
        throw new Error('PAUSE rejected');
      }
      this.emit('PAUSE_ACK');
      if (!this.task) await this.until(() => !!this.task, 120, 20);
      const stoppedAt = this.now();
      if (!(await this.write('core_external_stop', () => this.device._api.stopMowing(did)))) {
        throw new Error('STOP rejected');
      }
      this.emit('STOP_ACK');
      if (!(await this.until(() => this.stoppedInStation(stoppedAt), 2500, 100))) {
        throw new Error('fresh native IN_STATION/undock=0 proof missing after STOP');
      }
      const openAt = this.now();
      this.emit('OPEN_REQUESTED');
      const opened = await this.garage.ensureDoorOpen('core_external_start', {
        allowOpenFromDanger: true, minWaitMs: 0,
      });
      if (opened !== true || !this.gateVerified(openAt)) {
        throw new Error('gate open not confirmed by fresh physical sensor');
      }
      this.emit('GATE_VERIFIED');
      if (!this.stoppedInStation(stoppedAt)) {
        throw new Error('native dock contact was lost during opening');
      }
      const original = this.task && this.now() - this.taskAt <= 90000 ? this.task : null;
      if (!original || !MOW_CODES.has(Number(original.o))) {
        this.emit('MANUAL_REISSUE_REQUIRED', { opcode: original?.o ?? null });
        await this.garage.safetyWarning?.('external_start_waiting_for_explicit_point');
        return false;
      }
      // Claim outbound ownership before issuing a fresh task. Prevents a
      // secondary native undock event from triggering another PAUSE/STOP.
      await this.garage._beginOutbound('EXTERNAL_CORE_RESTORED', true);
      this.emit('FRESH_START', { opcode: Number(original.o) });
      if (!(await this.write('core_external_fresh_start', () => this.dispatchTask(did, original)))) {
        throw new Error('fresh original task rejected');
      }
      if (!(await this.until(() => {
        const dock = this.freshStation(3000);
        return dock && (dock.undocking === 1 || dock.dockingState === 'OUT_OF_STATION');
      }, 8000, 120))) {
        throw new Error('fresh native departure not confirmed');
      }
      this.garage._missionOutside = true;
      await this.garage._markOutboundReleased();
      this.emit('DONE');
      success = true;
      return true;
    } catch (error) {
      this.emit('BLOCKED', { reason: error?.message || String(error) });
      await this.garage.safetyBlock?.('external_core_start_blocked').catch(() => {});
      return false;
    } finally {
      if (!success) {
        // Hold off automatic replay; do not issue DOCK or blind CLOSE.
        this.abortUntil = this.now() + 5 * 60 * 1000;
        this.emit('OPERATOR_CHECK_REQUIRED');
      }
      this.active = false;
      this.task = null;
    }
  }
}
module.exports = { CoreExternalStartRecovery };
