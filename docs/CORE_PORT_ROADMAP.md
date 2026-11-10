# MOVA A2 / Andi upstream: sequential CORE port roadmap
Base: Andi 1.1.46 (2026-11-10). Version numbers below are **internal milestone labels**, not promised upstream release numbers.

## Gate 1 — PR 1: Finish CORE external-start parity (CURRENT, NOT COMPLETE)
Existing branch: `feat/core-native-undocking-milestone-1146`.
Keep the PR focused on the original-app start / closed-garage safety sequence.

Already implemented on branch:
- Decode native docking/undocking 1:1 messages.
- Experimental opt-in PAUSE -> STOP -> fresh station proof -> confirmed real door sensor -> exact supported task replay.
- Exclusive startup owner; bounded stale-task replay guard; unknown maintenance point does not silently become P1.
- Isolated modules and mocked control-path tests.

**Must be completed BEFORE describing PR 1 as finished or submitting upstream:**
1. Compare functional behavior and extracted code against the actual CORE 1.2.184 sources; account for every early native trigger, STOP/dock-contact loss, and time/position freshness check. No guessed replacements.
2. Add robust native-command capture for original maintenance-point TASK (opcode 109) and its unknown-target manual-reissue branch, with an explicit, visible Homey message and verified gate-open release. Do not send an invented point index.
3. Restore exact original-task semantics for each supported manufacturer command, and explicitly reject unsupported commands.
4. Add handling for transient lost physical dock contact after STOP, using only fresh corroborated native/station/position evidence; fail closed if unconfirmed.
5. Check missed/delayed MQTT frame fallback and idempotence (parallel callbacks, restarts, duplicate status transitions, failed API writes, stale tasks, sensor offline).
6. Run real Homey app validation, additional mocked fault tests, and **supervised MOVA A2 measurements**. For closed-door tests ensure independent physical emergency stop, unobstructed clearance and verified early interception. If early interception cannot be guaranteed, do not authorize automatic closed-gate starts.
7. Rebase onto Andi's latest main, trim diff, and open PR only after the above acceptance gates; attach anonymized log evidence and concise rationale.

Acceptance criterion: for **all supported task types**, the controller never resumes a task before reliable stop, station proof, full gate-open proof, and original-task preservation. On unsupported/ambiguous requests it stops, does not select P1, and provides an actionable Homey notice. Safety failures leave mower inhibited and gate behavior explicitly safe. Hardware behavior is documented and matches CORE 1.2.184 or deviations are called out.

## Gate 2 — PR 2: Maintenance point availability + temporary learning (separate)
- Preflight Homey Flow request for P1-P5; reject a **proven absent** point (e.g. P4) before opcode 109 with clear Homey error. Distinguish unavailable from unknown; don't fabricate availability.
- On native original-app travel and verified arrival at P2/P3/etc, associate verified point with correct map and persist as an observational/temporary marker, with correct expiration and model limits.
- Display matching device tile/button only for verified usable points; update when settings/mapping changes.
- Dedicated UI/map regression tests and A2 checks.

## Gate 3 — PR 3: Restricted/no-go zones
- Port CORE restriction-zone priority and state, preserving Andi's map processing.
- Verify command interlocks, activation/deactivation, errors, persistence.
- Keep independent from PR 1 and PR 2.

## Gate 4 — PR 4: CORE UI parity
- Harmonize cards, buttons, menus, selection/dropdowns, legends and map presentation.
- No underlying gate/motor behavior changes; retain Andi's baseline APIs and device IDs.
- Screenshot-level review and Homey UI checks.

## Shared release discipline
- One focused PR at a time; no bulk CORE app overwrite, secrets, restore endpoints, or unrelated debug tools.
- Rebase each PR on latest upstream; tests + rollback plan + supervised hardware evidence.
- Do not announce upstream version numbers or claim CORE parity solely from unit tests.
