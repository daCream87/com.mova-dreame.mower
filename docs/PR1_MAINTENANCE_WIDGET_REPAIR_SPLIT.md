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

## Must be added before review
- Real native 109 P1–P5 actions with explicit arming and current-map proof
- Native MQTT task/arrival correlation through PR1's normalized event interface
- Touchable/renamable P1–P5 overlays in the existing map widget and Repair map
- P1–P5 Homey tile buttons, compat-safe migrations and Flow card arguments
- A single map read-only DTO for widget + Repair; omit zone writer/lifecycle
- Garage-off behavior and all existing Flow IDs/capabilities unchanged
- Unit/contract tests, publish validation, simulated upgrade, focused acceptance

The existing code is **not** production-ready or a complete P1–P5 contribution.

## Upstream PR sequence

PR1 MQTT early gate interception -> **PR2 this feature** -> PR3 manual native
zones -> PR4 lifecycle rules -> PR5 overview/recovery refinement.

See integration branch docs/STAGED_PR_DEPENDENCY_PLAN.md for complete contracts.
