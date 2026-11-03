# PR1 design — native MQTT early original-app gate interception

**Status: design scaffold only; no mower commands or runtime changes in this
branch yet. Not ready to submit or deploy.**

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
- Normalize the existing upstream authenticated MQTT messages.
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
proof and Repair UI. PR3/PR4 then extend the **same** map presenter and
safe native map transaction coordinator.

No additional physical end-to-end mower run is expected for purely visual
follow-up changes; **safety-critical changes still require focused hardware
acceptance**.
