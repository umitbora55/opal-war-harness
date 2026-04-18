import { createSyntheticClock } from './synthetic-clock.js';
import { createSeededRandom } from './prng.js';
import { sortStepsByTime, type ScheduledStep } from './scheduler.js';
import type {
  AnomalyRecord,
  HarnessConfig,
  InvariantResult,
  PersonaDefinition,
  ReleaseVerdict,
  RunContext,
  ScenarioDefinition,
  SyntheticAction,
  SimulationObservation,
} from './types.js';
import { createTelemetryCollector } from '../metrics/telemetry-collector.js';
import { evaluateInvariants } from '../oracles/invariant-engine.js';
import { detectAnomalies } from '../anomaly/anomaly-detector.js';
import { createReplayBundle } from '../replay/replay-bundle.js';
import { generateRunReport } from '../report/report-generator.js';
import { evaluateReleaseVerdict } from '../release/release-gates.js';
import { loadPersonaRegistry } from '../personas/persona-registry.js';
import { loadScenarioRegistry } from '../scenarios/scenario-registry.js';
import { runChaosProfile } from '../chaos/fault-injector.js';
import { stableHash, runIdFromSeed } from './hash.js';
import { persistRunArtifacts } from './artifacts.js';
import { generateSyntheticUsers } from '../simulation/synthetic-user-engine.js';
import { createPool } from '../db/postgres.js';
import { runMigrations } from '../db/migration-runner.js';
import { createRunStore } from '../db/run-store.js';
import { createControlPlaneAdapter } from '../adapters/control-plane/control-plane-client.js';
import { writeGrafanaExport } from '../metrics/export-provider.js';

export interface RunArtifacts {
  context: RunContext;
  selectedScenarioIds: string[];
  selectedPersonaIds: string[];
  actions: SyntheticAction[];
  observations: SimulationObservation[];
  invariants: InvariantResult[];
  anomalies: AnomalyRecord[];
  verdict: ReleaseVerdict;
  replayBundlePath: string;
  reportJsonPath: string;
  reportMdPath: string;
  providerExportPath: string;
}

function buildSyntheticActions(
  scenario: ScenarioDefinition,
  actorMap: Map<string, { syntheticUserId: string; persona: PersonaDefinition }>,
): ScheduledStep[] {
  return scenario.steps.map((step) => {
    const actor =
      actorMap.get(step.actor) ??
      ({
        syntheticUserId: `system-${step.actor}`,
        persona: {
          id: `system-${step.actor}`,
          version: '1.0.0',
          active: true,
          description: `Synthetic system actor for ${step.actor}`,
          intentProfile: 'adversarial',
          pacing: 'normal',
          trustBias: 'medium',
          premiumPropensity: 'low',
          irlPropensity: 'low',
          probabilities: { like: 0, reply: 0, ghost: 0, report: 0, premiumBuy: 0, planMeet: 0, cancelMeet: 0, noShow: 0 },
          constraints: ['system actor'],
        },
      } as { syntheticUserId: string; persona: PersonaDefinition });
    const target = step.target ? actorMap.get(step.target) : undefined;
    return {
      ...step,
      scenarioId: scenario.id,
      syntheticUserId: actor.syntheticUserId,
      targetId: target?.syntheticUserId ?? step.target,
      payload: {
        personaId: actor.persona.id,
        scenarioId: scenario.id,
        actorLabel: step.actor,
        targetLabel: step.target ?? null,
        ...step.payload,
      },
    };
  });
}

export async function runHarness(config: HarnessConfig): Promise<RunArtifacts> {
  const startedAt = new Date().toISOString();
  const runId = runIdFromSeed(config.seed, config.runName);
  const outputDir = `reports/runs/${runId}`;
  const context: RunContext = {
    runId,
    runName: config.runName,
    mode: config.mode,
    environment: config.environment,
    seed: config.seed,
    buildId: process.env.GITHUB_SHA ?? process.env.BUILD_ID ?? 'local-build',
    fixtureHash: stableHash(JSON.stringify(config)),
    configVersion: 'v1',
    clockMode: config.environment === 'local' ? 'deterministic' : 'realtime',
    startedAt,
    outputDir,
  };

  const clock = createSyntheticClock(Date.parse(startedAt));
  const random = createSeededRandom(config.seed);
  const telemetry = createTelemetryCollector(context);
  const controlPlane = createControlPlaneAdapter(
    config.backend.controlPlaneUrl || config.backend.baseUrl,
    config.controlSurface.secret,
  );

  const personaRegistry = loadPersonaRegistry();
  const scenarioRegistry = loadScenarioRegistry();
  const syntheticUsers = generateSyntheticUsers({
    userCount: config.limits.userCount,
    personas: personaRegistry,
    country: config.localeDefaults.country,
    city: config.localeDefaults.city,
    timezone: config.localeDefaults.timezone,
    seed: config.seed,
  });

  const selectedScenarioIds =
    config.mode === 'smoke'
      ? ['CORE-HAPPY-001', 'TRUST-ATTACK-001', 'RESILIENCY-001']
      : config.mode === 'behavioral'
        ? ['CORE-HAPPY-001', 'COLDSTART-001', 'TRUST-ATTACK-001', 'MSG-DRIFT-001']
        : config.mode === 'replay'
          ? ['CORE-HAPPY-001']
          : config.mode === 'certify'
            ? scenarioRegistry.map((item) => item.id)
            : scenarioRegistry.map((item) => item.id);

  const selectedScenarios = scenarioRegistry.filter((item) =>
    selectedScenarioIds.includes(item.id),
  );
  const selectedPersonas = personaRegistry.filter((item) => item.active);

  const dbUrl = config.database.url || process.env.WAR_DATABASE_URL || '';
  const dbEnabled = config.database.enabled && Boolean(dbUrl);
  const pool = dbEnabled ? createPool(dbUrl) : null;
  const runStore = pool ? createRunStore(pool) : null;
  let report: Awaited<ReturnType<typeof generateRunReport>> | null = null;
  let replayBundlePath = '';
  let verdict: ReleaseVerdict = {
    allowed: true,
    blockingReasons: [],
    advisoryReasons: [],
  };
  let providerExportPath = '';

  if (pool) {
    await runMigrations(pool, config.database.migrationsDir, `${config.database.auditTablesPrefix}migrations`);
  }

  if (config.controlSurface.enabled) {
    try {
      await controlPlane.ping();
      const bootstrapResult = await controlPlane.bootstrap({
        reason: 'run bootstrap',
        action: 'bootstrap',
        targetId: context.runId,
        payload: {
          runId: context.runId,
          scenarioCount: selectedScenarios.length,
        },
      });
      if (pool) {
        await pool.query(
          `
            INSERT INTO war_harness_synthetic_tenant (
              tenant_id, bootstrap_token, status, request_id, created_at, cleaned_at
            ) VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (tenant_id) DO UPDATE SET
              bootstrap_token = excluded.bootstrap_token,
              status = excluded.status,
              request_id = excluded.request_id,
              created_at = excluded.created_at,
              cleaned_at = excluded.cleaned_at
          `,
          [
            context.runId,
            bootstrapResult.bootstrapToken,
            'bootstrapped',
            `${context.runId}:bootstrap`,
            context.startedAt,
            null,
          ],
        );
        await pool.query(
          `
            INSERT INTO war_harness_audit_event (
              id, tenant_id, request_id, action, reason, payload_json
            ) VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (id) DO NOTHING
          `,
          [
            `${context.runId}:bootstrap:audit`,
            context.runId,
            `${context.runId}:bootstrap`,
            'bootstrap',
            'run bootstrap',
            JSON.stringify({
              runId: context.runId,
              scenarioCount: selectedScenarios.length,
              synthetic: true,
            }),
          ],
        );
      }
    } catch (error) {
      if (!config.database.allowJsonFallback && config.environment !== 'local') {
        throw error;
      }
    }
  }

  const syntheticActions: SyntheticAction[] = [];
  const observations: SimulationObservation[] = [];

  const userLimit = Math.max(config.limits.userCount, selectedScenarios.length * 2);
  const actorPool = syntheticUsers.slice(0, Math.min(userLimit, syntheticUsers.length));

  for (const scenario of selectedScenarios) {
    const actorLabels = Array.from(
      new Set([
        ...scenario.steps.map((step) => step.actor),
        ...scenario.steps.map((step) => step.target).filter((value): value is string => Boolean(value)),
      ]),
    ).filter((label) => !['control-plane', 'operator', 'brain'].includes(label));
    const shuffledUsers = random.shuffle([
      ...actorPool,
      ...syntheticUsers.filter((user) => scenario.personas.includes(user.personaId)),
    ]);
    const actorMap = new Map<string, { syntheticUserId: string; persona: PersonaDefinition }>();
    actorLabels.forEach((label, index) => {
      const syntheticUser = shuffledUsers[index % shuffledUsers.length] ?? random.pick(actorPool);
      const persona = personaRegistry.find((item) => item.id === syntheticUser.personaId) ?? random.pick(selectedPersonas);
      actorMap.set(label, {
        syntheticUserId: syntheticUser.syntheticUserId,
        persona,
      });
    });
    const scheduled = sortStepsByTime(buildSyntheticActions(scenario, actorMap));
    const createdAtMs = clock.now();

    for (const step of scheduled) {
      const actor =
        actorMap.get(step.actor) ??
        ({
          syntheticUserId: `system-${step.actor}`,
          persona: {
            id: `system-${step.actor}`,
            version: '1.0.0',
            active: true,
            description: `Synthetic system actor for ${step.actor}`,
            intentProfile: 'adversarial',
            pacing: 'normal',
            trustBias: 'medium',
            premiumPropensity: 'low',
            irlPropensity: 'low',
            probabilities: { like: 0, reply: 0, ghost: 0, report: 0, premiumBuy: 0, planMeet: 0, cancelMeet: 0, noShow: 0 },
            constraints: ['system actor'],
          },
        } as { syntheticUserId: string; persona: PersonaDefinition });
      const targetActor = step.target ? actorMap.get(step.target) : undefined;
      const action: SyntheticAction = {
        actionId: `${runId}:${scenario.id}:${step.id}`,
        kind: step.kind,
        actorId: actor.syntheticUserId,
        targetId: targetActor?.syntheticUserId ?? step.target,
        payload: {
          ...step.payload,
          runId,
          runName: context.runName,
          seed: config.seed,
          scenarioId: scenario.id,
          personaId: actor.persona.id,
        },
        plannedAtMs: step.atMs,
      };

      clock.set(createdAtMs + step.atMs);
      action.executedAtMs = clock.now();

      const outcome = await runChaosProfile({
        action,
        scenario,
        persona: actor.persona,
        config,
      });

      action.result = outcome.result;
      action.errorCode = outcome.errorCode;
      syntheticActions.push(action);

      telemetry.captureAction(action, scenario, actor.persona, outcome);

      for (const metric of outcome.observations) {
        observations.push(metric);
        telemetry.captureObservation(metric, scenario, actor.persona);
      }
    }
  }

  const invariantResults = evaluateInvariants({
    run: context,
    config,
    actions: syntheticActions,
    observations,
    scenarios: selectedScenarios,
    personas: selectedPersonas,
  });

  const anomalies = detectAnomalies({
    run: context,
    config,
    actions: syntheticActions,
    observations,
    invariants: invariantResults,
  });

  await persistRunArtifacts({
    context,
    syntheticUsers,
    actions: syntheticActions,
    observations,
    invariants: invariantResults,
    anomalies,
  });

  replayBundlePath = await createReplayBundle({
    context,
    config,
    actions: syntheticActions,
    observations,
    invariants: invariantResults,
    anomalies,
    scenarios: selectedScenarios,
    personas: selectedPersonas,
  });

  verdict = evaluateReleaseVerdict({
    invariants: invariantResults,
    anomalies,
  });

  report = await generateRunReport({
    context,
    config,
    actions: syntheticActions,
    observations,
    invariants: invariantResults,
    anomalies,
    verdict,
    replayBundlePath,
  });

  const providerExport = await writeGrafanaExport(config);
  providerExportPath = providerExport.providerPath;

  if (runStore && pool) {
    await runStore.persistRun({
      context,
      config,
      syntheticUsers,
      actions: syntheticActions,
      observations,
      invariants: invariantResults,
      anomalies,
      report: {
        jsonPath: report.jsonPath,
        mdPath: report.mdPath,
        verdict,
        reportHash: report.reportHash,
      },
      replayBundlePath,
    });
  }

  if (config.controlSurface.enabled) {
    try {
      const cleanupResult = await controlPlane.cleanup({
        reason: 'run cleanup',
        action: 'cleanup',
        targetId: context.runId,
        payload: { runId: context.runId },
      });
      if (pool) {
        await pool.query(
          `
            INSERT INTO war_harness_synthetic_tenant (
              tenant_id, bootstrap_token, status, request_id, created_at, cleaned_at
            ) VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (tenant_id) DO UPDATE SET
              status = excluded.status,
              request_id = excluded.request_id,
              cleaned_at = excluded.cleaned_at
          `,
          [
            context.runId,
            cleanupResult.cleaned ? `cleanup-${context.runId}` : bootstrapResultOrFallback(context.runId),
            'cleaned',
            `${context.runId}:cleanup`,
            context.startedAt,
            new Date().toISOString(),
          ],
        );
        await pool.query(
          `
            INSERT INTO war_harness_audit_event (
              id, tenant_id, request_id, action, reason, payload_json
            ) VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (id) DO NOTHING
          `,
          [
            `${context.runId}:cleanup:audit`,
            context.runId,
            `${context.runId}:cleanup`,
            'cleanup',
            'run cleanup',
            JSON.stringify({ runId: context.runId, synthetic: true }),
          ],
        );
      }
    } catch (error) {
      if (!config.database.allowJsonFallback && config.environment !== 'local') {
        throw error;
      }
    }
  }

  try {
    if (report) {
      await telemetry.flush(report);
    }
  } finally {
    if (pool) {
      await pool.end();
    }
  }

  if (!report) {
    throw new Error('run report was not generated');
  }

  return {
    context,
    selectedScenarioIds,
    selectedPersonaIds: selectedPersonas.map((persona) => persona.id),
    actions: syntheticActions,
    observations,
    invariants: invariantResults,
    anomalies,
    verdict,
    replayBundlePath,
    reportJsonPath: report.jsonPath,
    reportMdPath: report.mdPath,
    providerExportPath,
  };
}

function bootstrapResultOrFallback(runId: string): string {
  return `bootstrap-${runId}`;
}
