# Staged A2 CORE integration — safety first, cohesive feature slices

**Goal:** keep the owner's complete A2 CORE integration working as ONE product.
Correct Andi's findings in the separate full-integration branch; offer upstream
small, reviewable increments that integrate cleanly with each other. Never
substitute a partial upstream contribution for the owner's full version.

## Architecture decision — complete CORE product, minimal upstream delta

**Two deliverables, one implementation:** maintain the user's complete, usable
CORE integration on the separate integration branch while submitting small,
cohesive, reviewable feature slices to Andi. We must not create five competing
implementations or throw away tested workflows. All slices reuse shared,
versioned contracts and the full integration is assembled/tested after each
accepted change.

**Baseline invariant:** begin from upstream **1.1.43** and retain its existing
control methods, status mapping, PRE read-modify-write, capabilities, Flow IDs,
existing settings, migrations, authentication and poll lifecycle wherever
possible. Do not replace the full `drivers/mower/device.js` or
`lib/garage/GarageSafetyEngine.js` with wholesale revised copies.

**Implementation pattern:** extend at narrow, explicit integration seams:

1. **Vendor MQTT adapter** reads and normalizes native events without issuing
   motion/door commands. Existing upstream polling and MQTT survive; adapter
   events contain observation timestamps, freshness, map/device identity and
   source so duplicate/late events cannot authorize movement.
2. **Garage coordinator** subscribes only while explicitly enabled and
   passes events to existing garage safety APIs. Every upstream direct
   Start/Pause/Resume/Stop/Return path preserves its original behavior with
   Garage Mode OFF. It must be possible to disable the coordinator and recover
   the exact default upstream behavior.
3. **MaintenancePointService** owns P1–P5 index, Homey names, the selected
   primary, native proof of location/arrival, map identity, and native
   dispatch. A point name never grants physical command authority.
4. **Read-only MapViewModel + RepairHub** expose the same point and map
   states to the device, map widget, overview and Repair UI. The first point
   release must already support practical touch targets, naming and status
   through the map and Repair; later releases extend existing views instead
   of shipping parallel editors.
5. **NativeMapTransaction** is the sole writer for manual and lifecycle
   exclusion-zone operations. It serializes user edits and background work,
   checks task-free stationarity/current map/fresh geometry, never deletes
   based on recycled native ID alone, always attempts the final opcode 201,
   and verifies actual MAPD/MAPI geometry rather than trusting API ACKs.
6. **LifecycleScheduler** only declares desired protection/pending outcomes
   through the native transaction interface; it never edits separately and
   never treats a failed or deferred return-only activation as protection.

**Compatibility nuance:** with Garage Mode OFF *and no new feature explicitly
configured*, ordinary commands and Flows must match 1.1.43. If a user opts
into a non-garage zone lifecycle policy, its documented protection may
explicitly hold a start until safe geometry is present. This must not leak into
a user who did not opt in.

**User installation policy:** the full integration branch retains the complete
feature set and user configuration. Do not suggest installing a half-featured
upstream PR as a replacement for the user's working stack. Separate feature
branches do not delete existing user features; they are review deliverables.
No camera/video dependencies in CORE.

## Andi's review findings — required resolution and owner modules

| Finding | Required change / regression guarantee | Owner |
|---|---|---|
| Start fails with Garage Mode OFF | Bypass all garage marker/danger-area proofs and route to upstream Start when optional feature disabled; verify lawn resume and all other ordinary controls | MQTT/Garage + integration |
| Eight hardcoded garden polygons | Delete source fallback and any persistence path that injects these into unrelated g2408 devices; rely on verified per-device data | Shared map/telemetry |
| Return-only protection absent | Apply at a genuine safe return checkpoint, verify native geometry, preserve pending/error if unavailable; prevent post-dock phantom success | Lifecycle |
| Recycled native ID used to delete | Verify current map/geometry/unique identity immediately before deletion; refuse ambiguous or stale MAP.* | NativeMapTransaction |
| Deadline prevents opcode 201 | Final commit/exit must be attempted in a bounded cleanup path regardless of earlier transaction expiry; report failure | NativeMapTransaction |
| Reorder migration loses capabilities | Restore missing capability additions non-destructively and preserve old Flow bindings/IDs | Compatibility/shared |
| onInit fails on garage error/capability UI | Isolate optional component errors; keep standard mower available; catch/report setCapabilityOptions errors | Compatibility/shared |
| Full route saved every 20 s | Keep bounded in-memory route and checkpoint/delta persistence | Map/telemetry |
| Endless map refresh retry | Bounded retries, model support checks, backoff and cancellation | NativeMapTransaction + lifecycle |
| User edit races restore | Single authoritative mutex/queue for all map writes | NativeMapTransaction |
| Widget accepts lifecycleInternal flag | Server must derive trusted internal authority; reject/remove client-provided privileged flags | Widget API + NativeMapTransaction |
| Garage disable retains manual latches | Explicit safe state transition and cleanup, without accidentally releasing a hazardous physical movement | MQTT/Garage |
| Device removal leaks timers | Unified dispose/abort and timer ownership; no callbacks after delete | Shared infrastructure |
| Timeline events not opt-in | No routine unsolicited notifications; require user opt-in, preserve explicit safety Flow events | MQTT/Garage + UI |
| turning_method polls PRE and disappears | Cache support capability carefully, avoid mutation based on one short/partial PRE reply | Compatibility/shared |
| Stale .homeycompose/app.json | Edit source-of-truth compose only; regenerate build output, avoid stale generated copies in PR | Packaging |
| readme.txt advertises video | Remove video marketing from CORE documentation and Homey store description | Packaging |

### Validation rules

1. Each finding has a **failing regression test first**, then the smallest
   implementation change that fixes it. Use realistic stale/recycled-ID,
   MQTT-delay and map-transaction failure fixtures.
2. Automate `npm test`, `homey app validate --level publish`, and compare
   capabilities, settings, actions/triggers and garage-OFF control behavior
   against upstream v1.1.43 for each candidate.
3. Run an automated upgrade/migration smoke test with old device state.
   Re-run the full integration suite after applying each extracted slice.
4. **Real physical mower acceptance cannot be replaced by mocks** for
   closed-gate interception or native map deletion. Minimize repeated hardware
   work with one coordinated end-to-end acceptance plus targeted safety
   retests only when gate/navigation/map-write logic changes.
5. The full integration is not considered safe to deploy merely because a
   PR is split or the Homey publish validator passes; close every critical
   issue, run validation and explicitly record results first.

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
