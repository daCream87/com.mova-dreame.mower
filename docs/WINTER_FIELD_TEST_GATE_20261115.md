# November 15, 2026 — pre-winter mower field-test gate

Date recorded: 2026-11-03 (Europe/Berlin).
This is a **priority and acceptance plan**, not a promise that all functionality
can be safely finished or validated by the deadline.

## User requirements
- Preserve the entire CORE owner-use integration as a functioning whole.
- Refactor against Andi's upstream 1.1.43 with minimal touches.
- Native MQTT original-app gate safety is the highest-priority field-test milestone.
- PR2 must include practical P1–P5 map touch targets and Repair navigation.
- PR3 combines manual native exclusions **and** their time/mission lifecycle.
- PR4 finishes full overview and human recovery.
- Camera only **after** complete CORE is corrected/accepted; camera must not
  block or contaminate CORE, and video SDK licensing remains unresolved.
- Minimize repeated hardware work: automate regressions, run targeted critical
  physical scenarios and one integrated end-to-end acceptance.

## Pre-winter test priority (not a release commitment)
1. **MQTT / garage original-app Start:** closed-gate native IN_STATION undocking,
   timestamped MQTT receipt, Pause/Stop ACK, physical motor-state witness,
   verified real gate-open signal, and safe continuation (or bounded hold).
   Exercise late/missing MQTT and motor stop failure; ensure no false promise
   of collision prevention when MQTT is delayed or offline.
2. **External return:** real manufacturer-app Dock/Return; early guarded gate
   approach, line/danger state, safe human recovery on insufficient proof.
3. **Manual command compatibility:** Garage Mode OFF (Start/Resume/Pause/Stop/
   Dock, existing Flow cards), update of a preexisting paired device and
   migrated capabilities including cutting_height.
4. **P1–P5:** original app learn, map-scoped confirmation, native 109,
   user labels, primary point, touch UI and return from a verified point.
5. **Native map editing:** unique geometry identity, wrong-ID refusal,
   STOP/idle preflight, serialized user and restore jobs, mandatory opcode 201
   exit even on deadline, verified native MAPD readback.
6. **Native lifecycle:** "return only" protection genuinely active when
   required and cannot disappear silently at the dock; explicit failure/hold
   when no safe checkpoint. Avoid infinite retries and non-g2408 writes.
7. **Whole CORE acceptance:** complete mission, return, garage close/open,
   owner takeover and cleanup with all features present.

## Tests runnable without mower
- Node automated unit/fixture/state-machine tests and existing regression suite
- Homey publish validation, clean install, upgrade/migration fixture
- Capability/Flow-ID comparison with upstream v1.1.43
- MQTT delay/replay, external command race, timer disposal and security flags
- No user/garden hardcoded geometry in distributed sources
- Camera/video absence from CORE and store readme text

## Camera as separate final stage
A camera implementation may be developed only independently after CORE is
completed. Physical camera testing can be considered if the user has time,
but no camera changes, binaries or claims should appear in any CORE PR or
publishable package. Tencent XP2P, Android shim and third-party licensing/
redistribution require independent authorization and verification before
distribution. A camera release by November 15 is **not guaranteed** and must
never shorten the real-mower safety acceptance.

## Safety and completion criteria
- Do not deploy open safety blockers on the real mower.
- No claim of a real-life zero-contact guarantee from reactive MQTT software.
- Record exact tested git SHA, device model, Homey version, physical sensor/
  gate state, commanded action, observed native status, MQTT latency and result.
- A validator passing is not substitute for live safety proof.
- Do not call a branch finished until code, tests, Homey validation and required
  owner field acceptance are all recorded as passed.

## Actual status at creation
- Full CORE integration branch exists; no camera code added.
- Prior initial fixes: remove eight hardcoded owner-garden polygons, bypass
  garage-only Start checks with garage disabled, attempt native final commit 201
  even after map-edit mutation deadline.
- MQTT PR1: read-only native event adapter wired into upstream 1.1.43;
  early gate Pause/STOP/Open/Resume owner **not completed**.
- **Neither full CORE nor camera ready/validated for release.**
