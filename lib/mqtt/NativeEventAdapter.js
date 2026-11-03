'use strict';
const { decodeNativeDock } = require('./NativeDockState');

/**
 * Read-only normalization of the native MOVA/Dreame MQTT channel.
 * It observes events AFTER the manufacturer's action, never intercepts the
 * request before dispatch and NEVER authorizes mower/gate movement by itself.
 *
 * The existing upstream MQTT connection, token refresh and status handling
 * continue to run independently. This class does not import Homey or mqtt.js.
 */
class NativeEventAdapter {
  constructor({ clock = Date.now, dedupeMs = 1000 } = {}) {
    this._clock = clock;
    this._dedupeMs = dedupeMs;
    this._seen = new Map();
    this._lastDockState = null;
  }

  reset() { this._seen.clear(); this._lastDockState = null; }

  ingest(payload, {
    topic = '', expectedTopic = '', generation, currentGeneration,
    receivedAt = this._clock(),
  } = {}) {
    if (expectedTopic && topic !== expectedTopic) return [];
    if (currentGeneration !== undefined && generation !== currentGeneration) return [];
    if (!Number.isFinite(receivedAt)) return [];
    let parsed;
    try {
      const raw = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
      if (typeof raw === 'string') {
        if (raw.length > 256 * 1024) return [];
        parsed = JSON.parse(raw);
      } else parsed = raw;
    } catch (_) { return []; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    const envelope = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
    const method = String(envelope.method || '');
    const events = [];
    const add = (type, source, value, extra = {}) => {
      // No arbitrary client-provided authorization metadata survives parsing.
      const signature = JSON.stringify([topic, type, source, value]);
      const previous = this._seen.get(signature);
      if (previous !== undefined && receivedAt - previous >= 0
          && receivedAt - previous < this._dedupeMs) return;
      this._seen.set(signature, receivedAt);
      events.push(Object.freeze({ type, source, observedAt: receivedAt,
        topic, value, ...extra }));
    };

    if (method === 'properties_changed' && Array.isArray(envelope.params)) {
      for (const prop of envelope.params.slice(0, 200)) {
        if (!prop || typeof prop !== 'object') continue;
        const siid = Number(prop.siid), piid = Number(prop.piid);
        if (!Number.isInteger(siid) || !Number.isInteger(piid)) continue;
        const source = `siid:${siid}:piid:${piid}`;
        if (siid === 1 && piid === 1) {
          const dock = decodeNativeDock(prop.value);
          if (!dock) continue;
          const previous = this._lastDockState;
          this._lastDockState = { ...dock, observedAt: receivedAt };
          add('dock_state',source,dock);
          // Only a witnessed IN_STATION/u0 -> IN_STATION/u1 transition starts
          // the safety owner. Never classify cold-start u1 as reliable intent.
          if (previous && previous.dockingState === 'IN_STATION'
              && previous.undocking === 0 && dock.dockingState === 'IN_STATION'
              && dock.undocking === 1 && receivedAt >= previous.observedAt
              && receivedAt - previous.observedAt <= 120000) {
            add('native_undock_intent',source,dock);
          }
        }
        else if (siid === 1 && piid === 4) add('position_raw', source, prop.value);
        else if (siid === 2 && piid === 1) add('status_raw', source, prop.value);
        else if (siid === 2 && piid === 2) add('error_raw', source, prop.value);
        else if (siid === 2 && piid === 50) {
          // Observe opcode 109 but do not attribute it to the original app;
          // the same opcode may be emitted by Homey.
          const op = prop.value && typeof prop.value === 'object'
            ? Number(prop.value.o ?? prop.value.opcode) : NaN;
          add('task_raw', source, prop.value,
            { hint: op === 109 ? 'maintenance_opcode_observed' : null });
        } else if (siid === 2 && piid === 56) add('control_status_raw', source, prop.value);
      }
    } else if (method === 'event_occured' && Array.isArray(envelope.params)) {
      for (const event of envelope.params.slice(0, 100)) {
        if (!event || typeof event !== 'object') continue;
        if (Number(event.siid) === 4 && Number(event.eiid) === 1)
          add('mission_completion_raw', 'siid:4:eiid:1', event);
      }
    }
    // Keep the cache bounded even when an A2 publishes many unique coordinates.
    if (this._seen.size > 256) {
      for (const [key, time] of this._seen) {
        if (receivedAt - time > this._dedupeMs || this._seen.size > 256) this._seen.delete(key);
      }
    }
    return events;
  }
}

module.exports = NativeEventAdapter;
