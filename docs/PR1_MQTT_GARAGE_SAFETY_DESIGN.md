# PR1 design — native MQTT early original-app gate interception

**Status: native MQTT event adapter, original-app gate-safety observer, and
passive Pause/Resume/Start/Return/Maintenance classification implemented.
Automated tests and Homey publish validation run in GitHub Actions.
Physical gate safety remains UNVALIDATED; do not deploy as a guarantee.**

Base: Andi upstream 1.1.43; no native no-go-zone editing, lifecycle, P2–P5
automation or camera.

## Capability milestone

For the first time, an ordinary Start or Return action issued through the
original MOVA/Dreame app can be *observed* through native MQTT telemetry, then
guarded by Homey when the optional Garage Mode is enabled. This is a reaction
to device events, not an interception before manufacturer command dispatch.

A stopped mower may not be restarted, and a closed/moving/unknown gate may
not be treated as clear passage, until the configured **real** physical
sensor / interlock evidence is sufficient. Fail closed on missing evidence,
never invent door position. Provide operator feedback and a supervised path.

MQTT latency / outage means this software cannot guarantee prevention of
first contact with a physically closed gate. Hardware supervision and targeted
real-mower testing are required; without such safeguards the integration
is not a substitute for a physical interlock.

## Core modules (independent and extensible)

**NativeEventAdapter**
- Normalize the existing upstream authenticated MQTT messages (initially
  available as `lib/mqtt/NativeEventAdapter.js`, read-only).
- Inputs: original topic, packet, broker receipt timestamp and current
  credential generation; reject stale generation and malformed data.
- Outputs: immutable, source-tagged status, dock/undock, position, task and
  return events; dedupe duplicates.
- Never dispatch mower or gate commands.

**OriginalAppMissionObserver**
- Read normalized events, recognize original-app departure/return when no
  Homey command owns the current task, distinguish genuine new start from
  Resume/outdoor movement; keep a bounded, idempotent mission ID.
- No unsafe inference from a generic TASK packet alone.

**GarageStartReturnGuard**
- Is strictly bypassed when `garage_mode_enabled !== true`.
- When enabled and a manufacturer task approaches an unsafe closed/unknown
  gate, issue the native PAUSE/STOP guard and open the gate using the existing
  Homey garage functions, only after fresh real status checks.
- Confirm gate actually open and stabilized before authorizing Resume.
- For external Return, protect entry: hold if gate clearance cannot be proven.
- Timeout, token refresh, offline, sensor failure, duplicate messages and
  a renewed task must have deterministic safe results.
- Use upstream gate capabilities and existing settings; avoid bulk-copying
  the large replacement GarageSafetyEngine from PR #10.

## Behavioural invariant (Garage Mode OFF)

For every user action and observed manufacturer event, the relevant
Start / Resume / Pause / Stop / Dock / P1 / map / Flow path must still behave
like upstream 1.1.43, with no demands for a configured danger area,
A/B safety line, sensor or proprietary coordinates.

## Reviewable acceptance tests

1. Original-app Start while physically docked and gate closed -> early
   MQTT intent detected; request native hold; no Resume before proven open.
2. MQTT signal arrives late / no signal -> must not falsely report safe;
   physical no-contact guarantee cannot be claimed without interlock.
3. Original-app Return toward closed gate -> stop/hold and gate open
   verification, never proceed on estimated-only door timing.
4. Already outside Resume -> no spurious gate opening or docked reclassification.
5. Duplicate, reordered, stale, malformed MQTT -> one bounded reaction.
6. Token expiry and reconnect -> no stale-generation callback resumes task.
7. Garage disabled -> upstream behaviour, all historical capabilities/Flows.
8. Cleanup on disabled/deleted device -> timers/listeners/latches neutralized.
9. Ordinary Homey Start/Stop/Return and vendor actions cannot race to
   unsafely reactivate movement.
10. Homey publish validation and upgrade compatibility against v1.1.43.

## Next PR contract

PR2 consumes the normalized event adapter to learn P2–P5 task/arrival
observations. PR2 supplies its own map touch areas, point labels/geometry
proof and Repair UI. The combined PR3 then extends the **same** map presenter and
safe native map transaction coordinator. PR4 finishes the CORE overview.
Camera is a separate later project and is not part of CORE.

No additional physical end-to-end mower run is expected for purely visual
follow-up changes; **safety-critical changes still require focused hardware
acceptance**.

## Initial code landed

- `lib/mqtt/NativeEventAdapter.js`: bounded read-only normalized event stream
- `drivers/mower/device.js`: minimal import, initialization, observer call and cleanup
- `tests/pr1-native-event-adapter.test.js`: parsing, duplicate, stale topic/generation, reset tests

**Implementation present but not field-approved:** original-app early PAUSE/
STOP, sensor-verified gate opening, guarded command recovery and return owner.
Outstanding: real-world safety acceptance, manufacturer-app protocol traces,
complete compatibility/upgrade coverage and reliable collision-free hardware
interlock. Do not treat passing Homey publish validation as physical proof.

## META/TASK native command bridge for PR2

PR1 provides a read-only interpretation of manufacturer-native task metadata
in `lib/mqtt/NativeMissionMeta.js`. It recognizes native mowing/pause/return/
maintenance status and 2:56 control phases (queued, active/continue, paused,
completed). `TASK` opcode 109 is tagged as maintenance, including its actual
native P1–P5 index **only when explicitly present**; this is not a learning
result or proof of arrival.

The `OriginalAppMissionGuard` retains a time-bounded latest native META
observation. `device.js` holds a bounded RAM-only event ring for PR2 to
correlate task, position, native index, active map and arrival with fresh evidence.
**META itself never sends Start/Pause/Resume/Stop, never invents a waypoint, and
never proves the original-app source.** PR2 adds verified native learning and
maintenance-point-specific command orchestration through PR1's garage interlock.

## Active/Continue interpretation (PR1, passive; PR2-ready)

`NativeCommandStateTracker` correlates native status (2:1), control phases
(2:56), task (2:50), fresh native station-out telemetry, the previously
observed PAUSED state and the current garage owner. An active event alone is
**ambiguous**, not proof of new Start or Resume. A `resume_outside_observed`
diagnostic is emitted only when recent PAUSED and independently fresh OUT_OF_
STATION plus already-outside mission state match. No new cloud command is
sent on this diagnostic. Missing/contradictory evidence leaves a
`continue_ambiguous` event. All snapshots are bounded RAM-only diagnostics;
the P1-P5 learner in PR2 can consume the events without manufacturing an
unconfirmed point or sending a motor command.

### Safe validation steps

1. On PC: `npm ci && npm test && homey app validate --level publish`.
2. Review exact GitHub commit/Actions success; confirm existing installed full
   CORE was backed up before any alternate app installation.
3. Initial observation only: Garage Mode OFF, no automation commanding gate,
   mower stationary and physically prevented from driving into the gate.
4. Controlled pause/continue on a **clear, open test area**, record Homey logs
   `[mqtt-action] pause_observed / resume_outside_observed / continue_ambiguous`.
5. Only with a separate independent physical barrier/interlock and on-site
   person able to stop hardware: test vendor-app original start/return with
   known reliable contact; record MQTT receipt, PAUSE/STOP completion, sensor
   OPEN, and actual mower movement timing.
6. Any unexpected gate actuation, pause failure, stale UI or missing signal:
   stop test, keep physical gate safe, capture logs. Never use software-only
   reactive MQTT as the sole safety device against a closed gate.

## TASK109 precedence — no false normal mowing starts (PR1)

The native A2 status can say `mowing` during a manufacturer maintenance
journey. PR1 therefore keeps the manufacturer's raw state but gives a **fresh
executing/active TASK opcode 109 precedence in the mission classifier**.
The existing `garage_maintenance_transit` display status is used when
appropriate while Garage Mode is active. A native maintenance task does not
invoke the normal-mowing external start fallback; the independently triggered
native undock gate-safety protection remains active.

P1 and P2 are distinct **explicit native point indexes**, never guessed from
names, a generic 2:56 Continue, a previous P1 or the global primary. Missing
point identity remains unknown. Contradictory active P1/P2 evidence is marked
as a conflict and automatic native point dispatch remains forbidden.

A TASK109 must have executable+active evidence to establish maintenance
classification; other 109 packets remain diagnostic hints. The classifier
expires after 20 minutes without new maintenance task confirmation and is
cleared on explicit task completion/return or MQTT reconnect. Status code 75
is only an arrival hint, **not** verified physical point arrival.

PR2 adds actual P1–P5 learning/current-map arrival confirmation, UI labels,
manual point dispatch and Shuffle. These unverified operations are NOT enabled
by PR1.
