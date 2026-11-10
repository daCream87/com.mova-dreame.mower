# CORE external-start interception – review notes for Andi (1.1.46)

This is a focused, **experimental**, disabled-by-default port of CORE 1.2.184's native MOVA A2 undocking interception path. It does **not** include zone edits, marker learning, map UI, or general CORE restoration code.

## Isolated components

- `lib/garage/NativeUndockingMilestone.js`: decode native `1:1` and report fresh `IN_STATION/u0 → u1` edge.
- `lib/garage/CoreExternalStartRecovery.js`: own a single interception and sequence **PAUSE → STOP → fresh native station proof → gate request → fresh real door contact → exact original mowing task → new departure confirmation**.
- `drivers/mower/device.js`: small MQTT hooks for native station data and manufacturer `2:50 TASK`, plus guard against competing garage status callbacks during ownership.
- `driver.compose.json` and generated `app.json`: **experimental opt-in setting defaults to false**.
- `tests/`: event-edge and fail-closed task/door/station/replay tests.

## Safety properties

- A fresh native physical station undocking edge is mandatory; cloud `mowing` alone never activates this controller.
- The experimental interception requires a working garage-door sensor; no timed-only fallback is permitted.
- No restart if STOP was rejected, station contact was lost, gate sensor confirmation is missing, or the original task cannot be reconstructed.
- Unknown `109` maintenance-point index is **never** replaced by P1 or mowing. Homey emits a warning; user must reissue the vendor command after verified gate opening.
- A failed cycle sets a temporary abort window; the next native undocking replay is intercepted with PAUSE/STOP without automatically reopening the gate.
- Original task is preserved as manufacturer opcode `100/101/102/103` and associated zone/spot/edge IDs, rather than generic resume.

## Scope and important remaining gap

This is **not yet a proven feature-parity replacement for CORE 1.2.184**. The legacy CORE implementation includes a complex geometry-based recovery when native dock contact changes after STOP, as well as fallback start detection when native `1:1` telemetry is delayed or absent. This small PR deliberately fails closed instead of attempting that fallback. It must be validated on the A2 before deployment or upstream submission. Do not describe it as guaranteed collision avoidance; MQTT and cloud timing may still be too slow for narrow garages.

## Checks

- JavaScript syntax validation, config JSON validation.
- 11 mocked integration-path tests plus native milestone decoder/edge tests.
- Pending: Homey CLI run, real MOVA A2 logs and physical safety validation.
- Do not add maintenance-point learning, no-go map edits, or UI rework to this PR.

## Planned follow-up

After supervised hardware logs, either retain fail-closed behavior or port the bounded physical-station/geometry recovery with its independent native position freshness proofs. Submit a PR to Andi only after review of the safety behavior.
