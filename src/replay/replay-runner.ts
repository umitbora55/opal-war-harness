import { readFile } from 'node:fs/promises';
import type { ReplayBundleRecord } from './replay-bundle.js';
import { evaluateInvariants } from '../oracles/invariant-engine.js';
import { detectAnomalies } from '../anomaly/anomaly-detector.js';
import { evaluateReleaseVerdict } from '../release/release-gates.js';
import { generateRunReport } from '../report/report-generator.js';

export async function replayBundle(path: string): Promise<{
  bundle: ReplayBundleRecord;
  verdict: ReturnType<typeof evaluateReleaseVerdict>;
  report: Awaited<ReturnType<typeof generateRunReport>>;
}> {
  const raw = await readFile(path, 'utf8');
  const bundle = JSON.parse(raw) as ReplayBundleRecord;
  const invariants = evaluateInvariants({
    run: bundle.context,
    config: bundle.config,
    actions: bundle.actions,
    observations: bundle.observations,
    scenarios: bundle.scenarios,
    personas: bundle.personas,
  });
  const anomalies = detectAnomalies({
    run: bundle.context,
    config: bundle.config,
    actions: bundle.actions,
    observations: bundle.observations,
    invariants,
  });
  const verdict = evaluateReleaseVerdict({ invariants, anomalies });
  const report = await generateRunReport({
    context: bundle.context,
    config: bundle.config,
    actions: bundle.actions,
    observations: bundle.observations,
    invariants,
    anomalies,
    verdict,
    replayBundlePath: path,
  });
  return { bundle, verdict, report };
}

export async function compareReplayBundles(
  baselinePath: string,
  candidatePath: string,
): Promise<{
  baseline: ReplayBundleRecord;
  candidate: ReplayBundleRecord;
  identical: boolean;
  diff: string[];
}> {
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as ReplayBundleRecord;
  const candidate = JSON.parse(await readFile(candidatePath, 'utf8')) as ReplayBundleRecord;
  const diff: string[] = [];

  if (baseline.bundleHash !== candidate.bundleHash) {
    diff.push('bundleHash');
  }
  if (baseline.reportHash !== candidate.reportHash) {
    diff.push('reportHash');
  }
  if (baseline.config.seed !== candidate.config.seed) {
    diff.push('seed');
  }
  if (baseline.context.configVersion !== candidate.context.configVersion) {
    diff.push('configVersion');
  }

  return {
    baseline,
    candidate,
    identical: diff.length === 0,
    diff,
  };
}
