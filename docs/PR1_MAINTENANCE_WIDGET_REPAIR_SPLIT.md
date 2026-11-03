# PR1 — P1–P5 maintenance + independent Repair/Widget foundation

## Purpose
Start with the existing upstream v1.1.43 behaviour. Preserve every existing
capability, Flow-card ID, start/pause/resume/return path and Garage Mode setting.

### Initial safe foundation in this commit
- Repair hub with independent P1–P5 point naming and a separate reauthentication view
- Localized DE/EN Repair UI
- Native point coordinates cannot be created from labels
- P2–P5 are not marked available or selected until independently verified native coordinates exist
- No modifications to startRequested(), map transactions, no-go-zone lifecycle, garage safety or MQTT command interception

### Remaining work before asking Andi for review
- Add independently verified manufacturer-app P2–P5 learning with explicit arming,
  fresh native task/position/arrival evidence and map-scoped identity; no guesswork
- Add indexed device buttons and Flow support without removing existing capability IDs
- Add standalone widget / overview changes in a small, garage-independent way;
  reuse the upstream map renderer rather than copying the huge PR #10 UI
- Test all P1–P5 user operations without Garage Mode
- Execute `npm test`, `homey app validate --level publish`, upgrade/Flow smoke test
- Confirm **Start/Pause/Resume/Return with Garage Mode OFF match upstream 1.1.43**

### Later PRs (separate from PR1)
2. MQTT manufacturer-app interception and optional Garage Mode enhancements.
3. Manual native no-go zones with safe map transactions.
4. Time/phase lifecycle rules after manual zones are reviewed.
5. Garage-specific full overview/recovery controls after the garage core is merged.

**DRAFT ONLY** until the remaining tasks and validation are complete.
