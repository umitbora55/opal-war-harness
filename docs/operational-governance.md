# The Opal — Weekly Operational Governance

This document defines the weekly review loop for The Opal now that the certification campaign is sealed. Its purpose is to keep the release-governance boundary intact, ensure evidence remains fresh, and surface regressions before they become release-blocking issues.

Weekly review is required once per week. If any release-blocking condition is present, the week is not green and the issue must be handled before normal operation is considered healthy again.

## 1. Campaign health
- [ ] `current-board.yaml` and `registry.yaml` remain consistent.
- [ ] No feature appears in more than one lane.
- [ ] `doneCount` and `nextCandidates` reflect the sealed state.
- [ ] WIP limits remain within policy.
- [ ] `pause_reason` is empty unless an explicit stop-the-line event is active.

## 2. Evidence freshness
- [ ] Every `release-certified` feature has the required evidence on disk.
- [ ] Evidence timestamps remain inside the configured TTL.
- [ ] No stale evidence count exceeds the release-blocking threshold.
- [ ] Missing evidence is filed in the correct lane, not silently ignored.
- [ ] Stale evidence is never treated as certified.

## 3. Replay and regression health
- [ ] No new replay mismatch has been introduced.
- [ ] Advisory anomalies are reviewed and classified.
- [ ] Replay hash, report hash, and action set remain coherent.
- [ ] Any blocker anomaly triggers replay lock or decertification.
- [ ] Replay-locked features still have a valid lock reason.

## 4. Trust, IRL, and marketplace safety
- [ ] No trust hold bypass is present.
- [ ] No unsafe IRL progression is present.
- [ ] No fake readiness or false-truth condition is present.
- [ ] Fairness, concentration, duplicate match, and read-before-delivered drift remain clear.
- [ ] Premium effects do not bypass the trust floor or locale policy.
- [ ] Operator and control-plane activity retains a complete audit trail.

## 5. Release governance
- [ ] `pre-release-cert` and other gate artifacts are present and current.
- [ ] Gate verdicts match board state.
- [ ] Artifact preservation is intact.
- [ ] Staging-backed GitHub Actions proof still matches the sealed release model.
- [ ] Release workflow behavior remains aligned with governance policy.

## 6. Certification integrity
- [ ] Only legal state transitions appear in the certification registry.
- [ ] Decertification triggers remain active and testable.
- [ ] Invalid transition attempts are rejected.
- [ ] Sealed scope does not reopen `active_certification`.
- [ ] Any new work outside monitoring is captured as an explicit new scope.

## 7. Documentation hygiene
- [ ] `docs/certification-closeout.md` exists.
- [ ] `docs/certification.md` links to the closeout note.
- [ ] Any further docs hygiene is split into its own follow-up change.
- [ ] Release note, milestone, or tag references are recorded if required.

## 8. Weekly decision
- [ ] If the campaign is sealed and no blockers exist, monitoring continues.
- [ ] If stale evidence, replay mismatch, trust bypass, or missing audit appears, an incident is opened.
- [ ] New certification work begins only with an explicit new scope.
- [ ] The weekly verdict is recorded in one sentence.

## Weekly governance verdict
- `GREEN`: sealed state preserved, no blocker anomalies, no stale-evidence breach, no trust or governance regression.
- `YELLOW`: a non-blocking drift or advisory anomaly needs follow-up, but release remains controlled.
- `RED`: a blocker anomaly, stale-evidence breach, trust bypass, replay mismatch, or audit gap is present.

**Example:** `2026-04-XX — GREEN — Certification seal preserved; no blocker anomalies, no stale-evidence threshold breach, no trust or governance regressions detected.`
