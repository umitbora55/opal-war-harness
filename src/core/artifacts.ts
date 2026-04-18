import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonFile } from './json.js';
import type {
  AnomalyRecord,
  InvariantResult,
  RunContext,
  SimulationObservation,
  SyntheticAction,
  SyntheticUserProfile,
} from './types.js';

export interface PersistRunArtifactsInput {
  context: RunContext;
  syntheticUsers: SyntheticUserProfile[];
  actions: SyntheticAction[];
  observations: SimulationObservation[];
  invariants: InvariantResult[];
  anomalies: AnomalyRecord[];
}

export async function persistRunArtifacts(input: PersistRunArtifactsInput): Promise<void> {
  await mkdir(input.context.outputDir, { recursive: true });
  await writeJsonFile(join(input.context.outputDir, 'run.json'), input.context);
  await writeJsonFile(join(input.context.outputDir, 'synthetic-users.json'), input.syntheticUsers);
  await writeJsonFile(join(input.context.outputDir, 'actions.json'), input.actions);
  await writeJsonFile(join(input.context.outputDir, 'observations.json'), input.observations);
  await writeJsonFile(join(input.context.outputDir, 'invariants.json'), input.invariants);
  await writeJsonFile(join(input.context.outputDir, 'anomalies.json'), input.anomalies);
}
