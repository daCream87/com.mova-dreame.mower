# Staged A2 CORE integration — safety first, cohesive feature slices

**Goal:** keep the owner's complete A2 CORE integration working as ONE product.
Correct Andi's findings in the separate full-integration branch; offer upstream
small, reviewable increments that integrate cleanly with each other. Never
substitute a partial upstream contribution for the owner's full version.

## One-line dependency graph

```
Upstream v1.1.43
  -> PR1 MQTT native-event adapter + original-app gate safety interlocks
  -> PR2 P1–P5 maintenance + map touch targets + Repair hub + core widgets
  -> PR3 manual native no-go-zone editing using PR2's map surface
  -> PR4 no-go-zone time/phase lifecycle using PR3's transaction interface
  -> PR5 advanced overview/recovery/garage workflows and finishing integration
```

Each PR is made against the latest accepted upstream main, not against the
40k-line monolithic PR #10. The full integration branch contains all functions
throughout. Extract an agreed behavior and its test coverage from there.
PR1/PR2 can be prepared on separate branches while the next PR is in review,
but update their common base once earlier changes are merged.

## PR1 — MQTT + original-app safety, FIRST

This is an end-to-end vertical safety feature, not only telemetry plumbing.

- Preserve upstream MQTT and improve authenticated subscription, token
  reconnect, event parsing (docking/undocking, native status, position, task,
  return) and stale-event filtering through a bounded adapter.
- Recognize vendor-app Start and Return **after the manufacturer has initiated
  them**; this is event-driven intervention, not pre-command network capture.
- If Garage Mode enabled: promptly issue native Pause/STOP when required;
  verify physical gate end state and safety conditions; permit continuation only
  after a guarded open-state handshake.
- For return: intercept approach to a closed/unknown gate; hold if no safe
  clearance proof; do not require P2–P5, zone edits or advanced widgets here.
- Reuse upstream GarageSafetyEngine and existing settings, keep interface small.
  No native no-go-zone lifecycle, no hardcoded obstacle coordinates.
- With Garage Mode **OFF**, Start/Pause/Resume/STOP/Dock, maintenance and
  existing Flows must behave exactly as 1.1.43.
- Test token rotation, duplicate/delayed MQTT, missing events, closed/open/
  moving/unknown gate, sensor dropout, emergency hold, resume and off-mode.
- **Important physical limit:** MQTT is reactive. Detection cannot guarantee a
  safe stop *before first movement* under packet delay/outage. A closed gate must
  not rely exclusively on this software for physical protection; real-mower
  safety acceptance and independent gate safeguards remain necessary.

## PR2 — P1–P5 + map widget + Repair UI, one cohesive user journey

A maintenance point is not complete merely because it has a Homey name.

- Native 109 P1–P5 actions; original P1 backward compatibility; native proof
  of point index and position, map identity and verified task/arrival.
- New unknown points require arming and a matching original-app action.
  Names are not coordinates and stale coordinates do not authorize movement.
- Device buttons, Flow action(s), primary ★ and labels.
- Extend the **existing map widget** and a small reusable map presenter:
  visible P1–P5 markers, touch/click/rename, status, optional hidden layers.
  Map marker movement must not fabricate vendor-native coordinates.
- **Repair → Manage mower** includes Maintenance points, maintenance-map view,
  and Reconnect. The map and Repair UI must function without Garage Mode.
  Garagen-only settings can be mounted in this same menu once PR1 exposes its
  stable configuration and permissions.
- Reuse core map/Repair contracts in PR3/PR4. Do **not** import the entire
  2k-line native no-go-zone editor or the full garage recovery dashboard here.
- Start/Pause/Resume/Stop/Return and existing settings/Flows must still pass
  legacy compatibility checks when Garage Mode is off.

## PR3 — manual native exclusion zones + map edit transaction

- Add native manual zone editing to PR2's existing map surface, not another UI.
- Remove any hardcoded owner garden OBS polygons.
- Authorize mutation via fresh task-free stationary state, current map identity,
  canonical geometry and native MAPD/MAPI readback.
- Never delete by recycled ID alone; re-check polygon geometry immediately
  before opcode 218 and reject ambiguous/stale readback.
- Serialize all map-edit writes, never trust a successful API ACK as proof.
- After opcode 200/204, **always attempt final 201**, even on operation timeout
  or error (bounded and surfaced failure).
- No automatic lifecycle actions yet; widget external flags are not authority
  to send internal lifecycle writes.

## PR4 — lifecycle policy on the proven manual-zone substrate

- Native protection by 3/7/14 days, permanent and mission phases.
- Return-only activation must happen at an actual safe return checkpoint, not
  deferred until the post-docking phase when it can never serve its purpose.
- If no safe checkpoint exists, mark the protection not fulfilled (no fake
  success, no unsafe motion). Correctly clear/restore at mission phase changes.
- Serialize user edits and background restore jobs. No infinite refresh or
  repeated retry on non-A2 firmware. Bounded timers and cleanup on deletion.
- Garage OFF remains equivalent to upstream for users who did not enable a
  specific lifecycle rule.

## PR5 — advanced unified Overview and recovery (if still unmerged)

- Extend the stable map/widget components introduced in PR2, rather than
  replacing them. Add contextual recovery wizard, manual handover, garage
  return through verified P1–P5, rotation, visual declarations and detailed
  status. Keep native sensor and manual statements clearly distinct.
- Gate-specific controls only with Garage Mode enabled; no hidden motion side
  effects when disabled.
- Fix stale state latches, widget API authorization, opt-in timeline notices,
  timer disposal and low-overhead durable route storage.

## Shared module contracts (incremental, no rewrite each PR)

- `NativeEventAdapter`: manufacturer MQTT -> normalized event (source, time,
  map, status, dock, position, command hint). Read-only; no commands.
- `GarageSafetyCoordinator`: consumes normalized native events, sends
  bounded/guarded mower and gate operations **only if enabled**.
- `MaintenancePointService`: point index, names, current map, confidence,
  position proof, native action; exposes read-only marker DTO to map/widget.
- `MapViewModel`: single read-only map snapshot for device card, widget and
  Repair; content can grow as new features are accepted.
- `NativeMapTransaction`: serialized map mutation with physical guard and
  reliable finalizer. Lifecycle layer is a client, not an alternative writer.
- `LifecycleScheduler`: policy intents, pending states and bounded retries,
  all through the transaction coordinator.
- `RepairHub`: stable navigation and conditional settings visibility. Add
  pages and panels by feature; do not move the same controls between PRs.

## Testing and release gates

- Run unit/simulated state-machine checks and complete existing regression
  suite automatically for **each** small PR and each full integration merge.
- Automatically compare garage-OFF command behavior, capabilities and Flow IDs
  with upstream v1.1.43; run a paired-device upgrade/migration smoke test.
- Re-run `homey app validate --level publish` for each candidate.
- Minimize operator burden: perform **targeted real-mower safety acceptance** at
  PR1 gate interception and PR3/4 native map mutations, followed by one end-to-
  end owner acceptance of the full integrated stack. Do not demand a full
  hardware run for every documentation/appearance change.
- No physical claim of "always prevents closed-gate contact" without evidence
  for early arrival of MQTT, STOP latency and fail-safe behavior.

## Current status

- Full integration baseline copied from previous CORE contribution.
- Initial fixes on that branch: no hard-coded garden polygons, garage-off
  Start compatibility, deadline-independent final opcode 201 attempt.
- **Not yet complete:** native geometry identity on delete, return-only
  policy, write serialization, migration and initialization checks, timers,
  polling throttles, endpoint flags and notification permissions.
- No release or code-ready PR claimed by this planning document.
