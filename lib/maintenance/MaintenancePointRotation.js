'use strict';

/**
 * Deterministic, read-only maintenance-point selection.
 * "alternate" advances to the next VERIFIED native point only when a prior
 * garage mission has been explicitly and successfully completed.
 *
 * This module NEVER triggers motion, gate commands or manufacturer map writes.
 * Caller must supply live, map-scoped, independently verified point indexes.
 */
function nextMaintenancePoint({
  mode = 'fixed', garageEnabled = false, confirmedIndexes = [],
  primary = 1, lastCompletedIndex = null, missionPinnedIndex = null,
  missionActive = false,
} = {}) {
  const available = [...new Set(confirmedIndexes
    .map(Number)
    .filter(i => Number.isInteger(i) && i >= 1 && i <= 5))].sort((a,b)=>a-b);
  const valid = i => available.includes(Number(i));
  // Never change an in-progress point. If proof has been lost, hold instead
  // of guessing an alternate destination.
  if (missionActive) return {
    index: valid(missionPinnedIndex) ? Number(missionPinnedIndex) : null,
    reason: valid(missionPinnedIndex) ? 'pinned_active_mission' : 'hold_missing_pinned_proof',
    rotated: false,
  };
  if (!available.length) return { index: null, reason:'hold_no_native_proof',rotated:false };
  if (!garageEnabled || mode !== 'alternate' || available.length < 2) {
    return {index:valid(primary) ? Number(primary) : null,
      reason:!valid(primary) ? 'hold_primary_not_confirmed' : 'fixed',
      rotated:false};
  }
  const last = Number(lastCompletedIndex);
  const cursor = available.indexOf(last);
  const idx = cursor >= 0 ? (cursor + 1) % available.length
    : available.indexOf(Number(primary));
  return { index: available[idx >= 0 ? idx : 0],
    reason: cursor >= 0 ? 'alternate_after_confirmed_completion' : 'alternate_initial_selection',
    rotated:cursor >= 0 };
}

module.exports = { nextMaintenancePoint };
