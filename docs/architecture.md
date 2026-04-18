# Architecture

OPAL WAR HARNESS is a deterministic synthetic-user simulation platform.

Core flow:

1. Load run configuration.
2. Resolve scenario registry and persona registry.
3. Create a deterministic run context.
4. Execute synthetic actions through backend/control-plane adapters.
5. Evaluate invariants and detect anomalies.
6. Persist replay bundle and report artifacts.
7. Emit release gate verdict.

The harness is designed to work in two modes:

- `local`: fully synthetic, no network dependency.
- `http`: real backend adapters against deployed host services.

The first safe version focuses on:

- onboarding
- trust
- messaging
- marketplace distortion
- IRL progression
- premium gating

