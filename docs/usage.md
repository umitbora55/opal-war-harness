# OPAL WAR HARNESS Usage

## Run modes
- `npm run smoke` - fast deterministic smoke.
- `npm run behavioral` - richer scenario coverage.
- `npm run replay -- --bundle <path>` - replay a stored bundle.
- `npm run certify` - full release-gate run.

## Safety
- Synthetic-only.
- No prod data.
- No exact location.
- No raw biometric or raw message content.

## Outputs
- `reports/runs/<runId>/report.json`
- `reports/runs/<runId>/report.md`
- `reports/runs/<runId>/replay/<bundle>.json`

