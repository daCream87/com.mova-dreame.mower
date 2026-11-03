# Full CORE integration — full owner-use configuration

The owner's complete set of CORE features is maintained here together.
This branch is not the staged small-PR source for direct merging, and the
unfinished safety remediations are explicitly not certified for live use.

**Safety-first staged sequence:** PR1 MQTT + original-app gate start/return
protection; PR2 P1–P5 + corresponding map widget and Repair UI; PR3 manual
native zones; PR4 lifecycle; PR5 remaining integrated overview/recovery.
See [full staged specification](STAGED_PR_DEPENDENCY_PLAN.md).

This branch is the **complete owner-use integration**, preserved separately
from the staged PR series. Do not merge into upstream until Andi's review
points are corrected and verified.

## Branch purpose
- Keep MQTT, garage, P1–P5, native no-go zones, lifecycle rules, all map
  widgets, manual recovery and the consolidated Repair interface together.
- Treat each finding as an integration regression test.
- Fix the complete version first; extract reviewable, minimal changes for Andy.
- Keep the current PR #10 as a historical reference; do not use it for new
  feature commits.
- Make no camera/video changes here.

## Initial remediation
- Removed shipped fallback garden polygons for all g2408 mowers.
- Normal start with Garage Mode off bypasses garage-only position/gate checks.
  Explicit configured native zone lifecycle preflight is retained.
- Map-edit final COMMIT (opcode 201) must still be attempted when a return
  checkpoint mutation deadline is exhausted.

## Still blocking deployment / PR split
- Return-only zone policy must activate at a demonstrably safe return
  checkpoint or remain explicitly unfulfilled, never silently lost at docking.
- Native zone deletes must revalidate geometry and map identity before opcode
  218; recycled IDs and stale MAP.* cannot authorize destruction.
- Properly serialized native edit/restore jobs.
- Full review of migrations, initialization failure, throttles, timers, widget
  endpoint authorization, latched recovery on disable, timeline opt-in and PRE
  turning_method behavior.
- Automated tests + Homey publish validation for this new branch; field tests
  on the real mower for modified safety flows.

## Planned upstream review sequence

The authoritative sequence is in STAGED_PR_DEPENDENCY_PLAN.md:
1. Original-app MQTT gate safety
2. P1–P5 maintenance with the map/Repair controls that make it usable
3. Manual native no-go zones
4. Native lifecycle rules
5. Full overview/advanced recovery

## Test policy
Run automatic unit / simulated regression and publish validation for each
extracted PR and the merged integration. Use a **single coordinated hardware
acceptance campaign** for the integrated stack, with mandatory focused real
hardware checks for modified gate and native map safety. Existing field logs
are supporting evidence, not a substitute for newly changed critical flows.

**Do not install this branch on the mower until the remaining blockers are fixed
and the critical-path tests are completed.**
