import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type {
  AnomalyRecord,
  HarnessConfig,
  InvariantResult,
  PersonaDefinition,
  RunContext,
  ScenarioDefinition,
  SyntheticAction,
  SimulationObservation,
} from '../core/types.js';
import { stableHash } from '../core/hash.js';

export interface ReplayBundleInput {
  context: RunContext;
  config: HarnessConfig;
  actions: SyntheticAction[];
  observations: SimulationObservation[];
  invariants: InvariantResult[];
  anomalies: AnomalyRecord[];
  scenarios: ScenarioDefinition[];
  personas: PersonaDefinition[];
}

export interface ReplayBundleRecord extends ReplayBundleInput {
  bundleId: string;
  bundleHash: string;
  reportHash: string;
  createdAt: string;
}

export async function createReplayBundle(input: ReplayBundleInput): Promise<string> {
  const bundleId = `${input.context.runId}-bundle`;
  const payload: ReplayBundleRecord = {
    ...input,
    bundleId,
    bundleHash: stableHash(
      JSON.stringify({
        context: input.context,
        config: input.config,
        actions: input.actions,
        observations: input.observations,
        invariants: input.invariants,
        anomalies: input.anomalies,
        scenarios: input.scenarios.map((scenario) => scenario.id),
        personas: input.personas.map((persona) => persona.id),
      }),
    ),
    reportHash: stableHash(JSON.stringify(input.anomalies)),
    createdAt: new Date().toISOString(),
  };

  const target = join(input.context.outputDir, 'replay', `${bundleId}.json`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return target;
}

export async function loadReplayBundle(path: string): Promise<ReplayBundleRecord> {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as ReplayBundleRecord;
}
