# OPAL WAR HARNESS

Synthetic user simulation platform for The Opal.

This package provides:

- synthetic user generation
- persona registry
- scenario registry
- deterministic scheduler and synthetic clock
- invariant/oracle validation
- anomaly detection
- replay bundle generation
- certification report generation
- release gate integration
- chaos/fault injection scaffolding

## Quick start

```bash
cd /Users/umitboragunaydin/Projects/opal-war-harness
npm install
npm run smoke
```

## Commands

- `npm run smoke`
- `npm run behavioral`
- `npm run replay`
- `npm run certify`

## Safety

- Synthetic-only.
- No production data.
- No raw biometric payloads.
- No exact location data.
- No real user targeting.

## Layout

See `docs/architecture.md`.
