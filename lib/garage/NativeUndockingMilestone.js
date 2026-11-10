'use strict';

// Extracted from the field-proven A2 1:1 native station milestone in CORE 1.2.184.
// This module does not send PAUSE, STOP, gate, or start commands: complete
// CORE recovery requires additional native station/task ownership safeguards.
const DEFAULT_MAX_GAP_MS = 30000;

function decodeNativeDockFrame(value) {
  const buf = Array.isArray(value) ? Buffer.from(value) : null;
  if (!buf || buf.length < 20 || buf[0] !== 0xce || buf[19] !== 0xce) return null;
  const b = Number(buf[14]);
  const names = ['IN_STATION','OUT_OF_STATION','PAUSE_DOCKING','FINISH_DOCKING','DOCKING_FAILED','DOCKING_IN_BASE'];
  const code = (b >> 2) & 7;
  const signed8 = (v) => v > 127 ? v - 256 : v;
  return {
    dockingCode: code,
    dockingState: names[code] || `UNKNOWN_${code}`,
    undocking: (b >> 6) & 1,
    locationState: b & 3,
    chargingLive: (buf[11] & 0x80) !== 0,
    pinState: (b >> 5) & 1,
    wifiRssi: signed8(buf[17]),
  };
}

class NativeUndockingMilestone {
  constructor({ now = () => Date.now(), maxGapMs = DEFAULT_MAX_GAP_MS, log = () => {} } = {}) {
    this.now = now;
    this.maxGapMs = maxGapMs;
    this.log = log;
    this.last = null;
    this.lastAt = 0;
    this.seq = 0;
    this.lastEdgeAt = 0;
  }
  observe(value, { garageEnabled = false, observedAt = this.now(), doorState = 'unknown' } = {}) {
    const next = decodeNativeDockFrame(value);
    if (!next) return null;
    const prev = this.last;
    const gapMs = this.lastAt ? observedAt - this.lastAt : null;
    const freshPrev = gapMs !== null && gapMs >= 0 && gapMs <= this.maxGapMs;
    const edge = freshPrev && prev.dockingState === 'IN_STATION'
      && prev.undocking === 0 && next.dockingState === 'IN_STATION'
      && next.undocking === 1;
    this.last = next;
    this.lastAt = observedAt;
    if (!edge) return { type: 'sample', station: next, gapMs };
    this.lastEdgeAt = observedAt;
    const event = {
      type: 'native-undock-edge',
      seq: ++this.seq,
      observedAt,
      gapMs,
      garageEnabled: !!garageEnabled,
      doorState: String(doorState),
      previous: { dockingState: prev.dockingState, undocking: prev.undocking },
      next: { dockingState: next.dockingState, undocking: next.undocking },
      // The CORE engine would own PAUSE -> STOP and recovery here. Deliberately
      // no motor actuation until the full owner/recovery chain has been ported.
      mode: 'observe-only',
    };
    this.log('[native-undock-milestone]', JSON.stringify(event));
    return event;
  }
}

module.exports = { NativeUndockingMilestone, decodeNativeDockFrame };
