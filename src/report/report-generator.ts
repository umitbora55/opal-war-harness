import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AnomalyRecord,
  HarnessConfig,
  InvariantResult,
  ReleaseVerdict,
  RunContext,
  SimulationObservation,
  SyntheticAction,
} from '../core/types.js';
import { stableHash } from '../core/hash.js';

export interface ReportInput {
  context: RunContext;
  config: HarnessConfig;
  actions: SyntheticAction[];
  observations: SimulationObservation[];
  invariants: InvariantResult[];
  anomalies: AnomalyRecord[];
  verdict: ReleaseVerdict;
  replayBundlePath: string;
}

export interface RunReportPaths {
  jsonPath: string;
  mdPath: string;
  reportHash: string;
}

export async function generateRunReport(input: ReportInput): Promise<RunReportPaths> {
  await mkdir(input.context.outputDir, { recursive: true });

  const jsonPath = join(input.context.outputDir, 'report.json');
  const mdPath = join(input.context.outputDir, 'report.md');
  const invariantFailures = input.invariants.filter((item) => !item.passed);
  const blockingAnomalies = input.anomalies.filter((item) => item.releaseBlocking);
  const summary = {
    run: input.context,
    config: input.config,
    verdict: input.verdict,
    counts: {
      actions: input.actions.length,
      observations: input.observations.length,
      invariants: input.invariants.length,
      invariantFailures: invariantFailures.length,
      anomalies: input.anomalies.length,
      blockingAnomalies: blockingAnomalies.length,
    },
    featureMatrix: {
      onboarding: input.actions.some((item) => item.kind === 'onboarding.complete'),
      matching: input.actions.some((item) => item.kind === 'match.create'),
      messaging: input.actions.some((item) => item.kind.startsWith('message.')),
      trust: input.actions.some((item) => item.kind.startsWith('trust.')),
      premium: input.actions.some((item) => item.kind.startsWith('premium.')),
      irl: input.actions.some((item) => item.kind.startsWith('irl.')),
    },
    replayBundlePath: input.replayBundlePath,
    reportHash: stableHash(JSON.stringify(input.anomalies) + JSON.stringify(input.invariants)),
  };

  const markdown = [
    `# OPAL WAR HARNESS Report`,
    ``,
    `- Run ID: ${input.context.runId}`,
    `- Mode: ${input.context.mode}`,
    `- Environment: ${input.context.environment}`,
    `- Verdict: ${input.verdict.allowed ? 'ALLOW' : 'BLOCK'}`,
    `- Blocking reasons: ${input.verdict.blockingReasons.join(', ') || 'none'}`,
    `- Advisory reasons: ${input.verdict.advisoryReasons.join(', ') || 'none'}`,
    `- Actions: ${input.actions.length}`,
    `- Observations: ${input.observations.length}`,
    `- Invariants failed: ${invariantFailures.length}`,
    `- Anomalies: ${input.anomalies.length}`,
    ``,
    `## Invariant Failures`,
    ...invariantFailures.map((item) => `- ${item.invariantId}: ${item.message}`),
    ``,
    `## Anomalies`,
    ...input.anomalies.map((item) => `- ${item.anomalyId} [${item.severity}] ${item.message}`),
    ``,
    `## Replay`,
    `- Bundle: ${input.replayBundlePath}`,
    `- To replay: \`opal-war replay --bundle ${input.replayBundlePath}\``,
    ``,
    `## Feature Matrix`,
    ...Object.entries(summary.featureMatrix).map(([key, value]) => `- ${key}: ${value ? 'yes' : 'no'}`),
  ].join('\n');

  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(mdPath, `${markdown}\n`, 'utf8');

  return { jsonPath, mdPath, reportHash: summary.reportHash };
}
