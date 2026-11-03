'use strict';

/**
 * Read-only, protocol-native mission metadata for PR1/PR2. It intentionally
 * does not equate a MQTT status/control update with a user command and does
 * not infer manufacturer-app origin from an opcode.
 *
 * MQTT 2:50 carries generic TASK and can describe settings or maintenance.
 * MQTT 2:56 may report the current control-phase. Neither is itself a
 * trustworthy authorization to Start/Pause/Resume or select a P1–P5 index.
 */
const NATIVE_CODES = Object.freeze({
  1: 'mowing', 3: 'paused', 5: 'returning', 6: 'charging',
  13: 'docked', 75: 'maintenance_arrival',
});
const CONTROL_PHASES = Object.freeze({
  '-1':'queued', 0:'active_or_continue', 2:'completed', 4:'paused',
});
const VALID_TASK_OPCODES = new Set([100,101,102,103,109]);
const normalizedIndex = raw => {
  const index=Number(raw);
  return raw !== null && raw !== undefined && raw !== ''
    && Number.isInteger(index) && index>=1 && index<=5 ? index : null;
};

function describeTask(raw) {
  const task = raw && typeof raw === 'object'
    ? (raw.t === 'TASK' && raw.d && typeof raw.d === 'object'
      ? raw.d : ((raw.o !== undefined || raw.opcode !== undefined) ? raw : null))
    : null;
  if (!task) return null;
  const opcode=Number(task.o ?? task.opcode);
  if (!Number.isInteger(opcode) || !VALID_TASK_OPCODES.has(opcode)) return null;
  const point=Array.isArray(task.point) ? task.point[0]
    : task.point_index ?? task.pointIndex ?? task.maintenance_point;
  return Object.freeze({
    kind: opcode===109 ? 'maintenance' : 'mowing',
    opcode,
    nativePointIndex: opcode===109 ? normalizedIndex(point) : null,
    executable: task.exe===true,
    reportedActive:task.status===true,
    attribution:'native_observation_only',
  });
}

function describeControl(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.status)) return [];
  const signals=[];
  for (const entry of raw.status.slice(0,32)) {
    if (!Array.isArray(entry) || entry.length<2) continue;
    const code=Number(entry[1]), phase=CONTROL_PHASES[String(code)];
    if (!phase) continue;
    signals.push(Object.freeze({
      zoneHint: Number.isFinite(Number(entry[0])) ? Number(entry[0]) : null,
      phase, attribution:'native_observation_only',
    }));
  }
  return signals;
}
function describeNativeStatus(raw) {
  const code=Number(raw);
  if (!Number.isInteger(code) || !Object.hasOwn(NATIVE_CODES,code)) return null;
  return Object.freeze({
    nativeCode:code,phase:NATIVE_CODES[code],
    attribution:'native_observation_only',
  });
}
module.exports={describeTask,describeControl,describeNativeStatus};
