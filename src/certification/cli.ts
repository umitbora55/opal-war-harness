import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCertificationPack } from './loader.js';
import { validateCertificationPack } from './validator.js';
import { evaluateCertificationDecision } from './decision-engine.js';
import { resolveCertificationPaths } from './paths.js';

function parseArgs(argv: string[]) {
  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

async function persist(command: string, payload: unknown, outputDir?: string) {
  const dir = outputDir ?? resolveCertificationPaths().outputDir;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${command}.json`), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function runCertificationCli(argv: string[]): Promise<number> {
  const [subcommand = 'validate', ...rest] = argv;
  const args = parseArgs(rest);
  const rootDir = typeof args.root === 'string' ? args.root : undefined;

  if (subcommand === 'validate') {
    const pack = await loadCertificationPack(rootDir);
    const issues = validateCertificationPack(pack);
    await persist('registry-validation', { valid: issues.length === 0, issues }, typeof args.out === 'string' ? args.out : undefined);
    console.log(JSON.stringify({ valid: issues.length === 0, issues }, null, 2));
    return issues.some((item) => item.severity === 'error') ? 1 : 0;
  }

  const decision = await evaluateCertificationDecision({
    rootDir,
    gateId: typeof args.gate === 'string' ? args.gate : typeof args.gateId === 'string' ? args.gateId : 'pre-release-cert',
    reportPath: typeof args.report === 'string' ? args.report : undefined,
    replayBundlePath: typeof args.replay === 'string' ? args.replay : undefined,
    evidenceDir: typeof args.evidenceDir === 'string' ? args.evidenceDir : undefined,
    overridePath: typeof args.override === 'string' ? args.override : undefined,
    featureId: typeof args.featureId === 'string' ? args.featureId : undefined,
    localeId: typeof args.localeId === 'string' ? args.localeId : undefined,
    outputDir: typeof args.out === 'string' ? args.out : undefined,
  });

  const payload = {
    verdict: decision.verdict,
    allowed: decision.allowed,
    gate: decision.gate_id,
    runId: decision.run_id,
    reasons: decision.reasons,
    blockingAnomalies: decision.blocking_anomalies,
    advisoryAnomalies: decision.advisory_anomalies,
    overrideDebt: decision.override_debt,
  };
  await persist('certification-decision', payload, typeof args.out === 'string' ? args.out : undefined);
  console.log(JSON.stringify(payload, null, 2));
  return decision.allowed ? 0 : 1;
}

