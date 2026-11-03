'use strict';

/** Protocol observation, not a motion command or physical safety proof. */
function decodeNativeDock(value) {
  if (!Array.isArray(value) || value.length < 20 || value.length > 256) return null;
  if (value.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
  const buf = Buffer.from(value);
  if (buf[0] !== 0xce || buf[19] !== 0xce) return null;
  const dockingCode = (buf[14] >> 2) & 7;
  const names = ['IN_STATION','OUT_OF_STATION','PAUSE_DOCKING','FINISH_DOCKING','DOCKING_FAILED','DOCKING_IN_BASE'];
  return Object.freeze({
    dockingState: names[dockingCode] || 'UNKNOWN',
    dockingCode,
    undocking: (buf[14] >> 6) & 1,
    chargingLive: Boolean(buf[11] & 0x80),
    locationState: buf[14] & 3,
  });
}
module.exports = { decodeNativeDock };
