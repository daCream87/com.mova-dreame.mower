# PR2 — cohesive P1–P5 + maintenance map and Repair surface (DRAFT)

This branch was first prototyped before the safety-first reorder.
**PR1 is now MQTT + externally triggered gate safety.** Do not open this
maintenance PR against upstream until PR1's stable event contract is available.

## Why map/widget/Repair belong with P1–P5

Without map-specific hit areas, selected P2–P5 markers, confirmable positions,
the device buttons, and a common Repair entry, point naming by itself would be
incomplete and difficult to use.

## Already present in this draft branch
- DE/EN Repair hub and P1–P5 naming UI, independent of Garage Mode
- A minimal point catalog that refuses to treat a name as native proof
- Non-destructive preservation of upstream capability/Flow behavior
- Baseline catalog tests committed but **not yet executed**

## Complete PR2 acceptance scope — all P1–P5 functions belong here

The following are **one inseparable end-to-end user feature**, not work
postponed to PR4:

1. **Native point detection, mapping and learning:** discover P1–P5 on the
   currently selected manufacturer map; explicit learning mode for an unknown
   point using correlated manufacturer-app MQTT task/arrival observations;
   fresh position + index + map identity proof, verified at physical arrival.
   Never infer an index or real-world coordinate from a Homey label, map tap,
   stale position or task opcode alone.
2. **Editable map UI:** existing map widget and Repair's map view show P1–P5,
   individually tappable markers/rows, point name and native-confirmation
   status, rename and select controls. Existing point names can be changed or
   removed. A visual marker drag does not overwrite the manufacturer's native
   waypoint or enable unauthorized movement.
3. **Repair → Manage mower → Maintenance points:** usable without Garage
   Mode; localized DE/EN, per-point names, ★ primary-point selection,
   native-index/coordinate confirmation, clear state, explicit learning/recheck
   and action feedback; independent of widget installation.
4. **Device / Flows:** backward-compatible P1 button and Flow ID, additional
   P2–P5 commands and actionable UI only when a destination is verified.
   Do not remove or reorder existing capabilities in a way that breaks upgrades.
5. **Maintenance-point rotation / Shuffle (Wechsel):** a Garage Mode setting
   with **Fixed** (manual/★) and **Alternate** (rotate among verified P1–P5)
   modes. Rotation requires at least **two independently confirmed native
   points on the current map**. Use a persistent next-point preference and a
   pinned target for the current garage mission; never change target halfway
   through return, on repeated MQTT status messages, during a manual takeover,
   or following failed/unconfirmed arrival. Upon successful confirmed cycle,
   advance exactly once; avoid a phantom automatic fallback to an unverified P1.
   Keep explicit manual P1–P5 selection available when Garage Mode is OFF,
   without running automatic garage rotation.
6. **Safety integration to PR1:** the selected/pinned native point feeds PR1's
   gate/return coordinator through a narrow, versioned interface. PR2 must
   never duplicate gate safety or introduce garage motion when the mode is
   disabled. A point not genuinely confirmed cannot authorize movement.
7. **Single shared models:** one MaintenancePointService and MapViewModel used
   by Repair, Map widget, device capability and later Total Overview.
   PR4 **consumes** these complete PR2 features; it must not implement naming,
   native learning, rotation or basic touch controls a second time.

**Definition of done:** create/learn/rename/select/rotate/use P1–P5 from the
relevant interfaces, while preserving upstream Garage Mode OFF behaviour and
existing device/Flow migration compatibility. All automatic switch events,
including duplicate MQTT and crash recovery, must have regression coverage.

## Must be added before review
- Real native 109 P1–P5 actions with explicit arming and current-map proof
- Native MQTT task/arrival correlation through PR1's normalized event interface
- Touchable/renamable P1–P5 overlays in the existing map widget and Repair map
- P1–P5 Homey tile buttons, compat-safe migrations and Flow card arguments
- Fixed/Alternate selection including shuffle pinning, persistence and exactly-once rotation
- Point learning/renaming/verification through independently usable touch and Repair surfaces
- A single map read-only DTO for widget + Repair; omit zone writer/lifecycle
- Garage-off behavior and all existing Flow IDs/capabilities unchanged
- Unit/contract tests, publish validation, simulated upgrade, focused acceptance

The existing code is **not** production-ready or a complete P1–P5 contribution.

## Upstream PR sequence

PR1 MQTT early gate interception -> **PR2 this complete P1–P5 feature (including
rotation, learning and editable map/Repair)** -> PR3 combined native zones and
lifecycle rules -> PR4 overview/recovery refinement -> camera later.

See integration branch docs/STAGED_PR_DEPENDENCY_PLAN.md for complete contracts.
