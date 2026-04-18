#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveHarnessConfig } from '../core/environment-resolver.js';
import { runHarness } from '../core/run-coordinator.js';
import { compareReplayBundles, replayBundle } from '../replay/replay-runner.js';
import { runIdFromSeed } from '../core/hash.js';
import { runCertificationCli } from '../certification/cli.js';

type Command = 'smoke' | 'behavioral' | 'load' | 'chaos' | 'replay' | 'certify' | 'shadow' | 'certification';

function parseArgs(argv: string[]) {
  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }
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

async function persistCommandOutput(command: Command, payload: unknown): Promise<void> {
  await mkdir('reports/cli', { recursive: true });
  await writeFile(
    join('reports/cli', `${command}-${Date.now()}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );
}

async function main() {
  const [commandArg = 'smoke'] = process.argv.slice(2);
  const command = commandArg as Command;
  const args = parseArgs(process.argv.slice(3));

  if (command === 'certification') {
    process.exitCode = await runCertificationCli(process.argv.slice(3));
    return;
  }

  const config = await resolveHarnessConfig({
    mode: command === 'replay' ? 'replay' : command === 'certify' ? 'certify' : command,
    seed: args.seed ? Number(args.seed) : undefined,
    configPath: typeof args.config === 'string' ? args.config : undefined,
    runName: typeof args.runName === 'string' ? args.runName : undefined,
    backendBaseUrl: typeof args.backendBaseUrl === 'string' ? args.backendBaseUrl : undefined,
    controlPlaneUrl: typeof args.controlPlaneUrl === 'string' ? args.controlPlaneUrl : undefined,
    flutterBridgeUrl: typeof args.flutterBridgeUrl === 'string' ? args.flutterBridgeUrl : undefined,
    userCount: args.userCount ? Number(args.userCount) : undefined,
    durationMinutes: args.durationMinutes ? Number(args.durationMinutes) : undefined,
    maxConcurrentActions: args.maxConcurrentActions ? Number(args.maxConcurrentActions) : undefined,
  });

  const runId = runIdFromSeed(config.seed, config.runName);
  console.log(
    JSON.stringify(
      {
        command,
        runId,
        seed: config.seed,
        config,
      },
      null,
      2,
    ),
  );

  if (command === 'replay') {
    const bundlePath = typeof args.bundle === 'string' ? args.bundle : '';
    const comparePath = typeof args.compare === 'string' ? args.compare : '';
    if (!bundlePath) {
      throw new Error('Missing --bundle for replay command');
    }
    if (comparePath) {
      const compareResult = await compareReplayBundles(comparePath, bundlePath);
      await persistCommandOutput(command, compareResult);
      console.log(JSON.stringify(compareResult, null, 2));
      process.exitCode = compareResult.identical ? 0 : 1;
      return;
    }
    const replayResult = await replayBundle(bundlePath);
    await persistCommandOutput(command, replayResult);
    console.log(JSON.stringify({ replayed: bundlePath, allowed: replayResult.verdict.allowed }, null, 2));
    process.exitCode = replayResult.verdict.allowed ? 0 : 1;
    return;
  }

  const runResult = await runHarness(config);
  await persistCommandOutput(command, runResult);

  console.log(
    JSON.stringify(
      {
        runId: runResult.context.runId,
        reportJsonPath: runResult.reportJsonPath,
        reportMdPath: runResult.reportMdPath,
        replayBundlePath: runResult.replayBundlePath,
        providerExportPath: runResult.providerExportPath,
        verdict: runResult.verdict,
        invariantsFailed: runResult.invariants.filter((item) => !item.passed).map((item) => item.invariantId),
        anomalies: runResult.anomalies.map((item) => item.anomalyId),
      },
      null,
      2,
    ),
  );

  process.exitCode = runResult.verdict.allowed ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
