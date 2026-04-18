import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import YAML from 'yaml';
import { loadCertificationPack } from '../src/certification/loader.js';
import { validateCertificationPack } from '../src/certification/validator.js';
import { evaluateCertificationDecision } from '../src/certification/decision-engine.js';
import { transitionFeatureCertification } from '../src/certification/state-machine.js';
import { decertifyFeature } from '../src/certification/decertify.js';
import { runCertificationPreflight } from '../src/certification/preflight.js';
import { resolveHarnessConfig } from '../src/core/environment-resolver.js';
import type { FeatureCertificationRecord } from '../src/certification/types.js';
import { findFreePort, spawnNodeScript } from './helpers/temp-process.js';

const repoRoot = '/Users/umitboragunaydin/Projects/opal-war-harness';

async function makeTempRoot(name: string): Promise<string> {
  const root = await mktemp(name);
  await cp(join(repoRoot, 'package.json'), join(root, 'package.json'));
  await cp(join(repoRoot, 'certification'), join(root, 'certification'), { recursive: true });
  return root;
}

async function mktemp(name: string): Promise<string> {
  const dir = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(join(tmpdir(), name)));
  return dir;
}

async function writeJson(path: string, value: unknown) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeYaml(path: string, value: unknown) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${YAML.stringify(value)}\n`, 'utf8');
}

async function createPassingEvidence(root: string, opts?: { stale?: boolean; anomalyCode?: string; override?: 'active' | 'expired' | 'none' }) {
  const evidenceDir = join(root, 'reports/certification');
  const runDir = join(root, 'reports/runs/run-1');
  const replayDir = join(runDir, 'replay');
  await mkdir(evidenceDir, { recursive: true });
  await mkdir(replayDir, { recursive: true });
  const timestamp = opts?.stale ? '2020-01-01T00:00:00.000Z' : new Date().toISOString();
  const reportPath = join(runDir, 'report.json');
  const replayBundlePath = join(replayDir, 'replay-bundle.json');

  await writeJson(join(evidenceDir, 'build-proof.json'), {
    build_id: 'build-1',
    status: 'passed',
    timestamp,
  });
  await writeJson(join(evidenceDir, 'contract-proof.json'), {
    artifact: 'swipe.discovery',
    status: 'passed',
    timestamp,
  });
  await writeJson(join(evidenceDir, 'runtime-proof.json'), {
    url: 'http://127.0.0.1:4010/war-harness/ping',
    status: 200,
    timestamp,
  });
  await writeJson(join(evidenceDir, 'release-verdict.json'), {
    verdict: 'CERTIFIED',
    gate: 'pre-release-cert',
    timestamp,
  });
  await writeJson(reportPath, {
    run: {
      runId: 'run-1',
      runName: 'cert-test',
      mode: 'behavioral',
      environment: 'local',
      seed: 42,
      buildId: 'build-1',
      fixtureHash: 'fixture-hash',
      configVersion: 'v1',
      clockMode: 'deterministic',
      startedAt: timestamp,
      outputDir: runDir,
    },
    config: {
      seed: 42,
      runName: 'cert-test',
      environment: 'local',
      mode: 'behavioral',
      localeDefaults: { country: 'TR', city: 'Istanbul', timezone: 'Europe/Istanbul' },
    },
    verdict: { allowed: true, blockingReasons: [], advisoryReasons: [] },
    counts: { actions: 1, observations: 0, invariants: 0, anomaly: 0 },
    featureMatrix: { swipe: true },
    replayBundlePath: 'reports/runs/run-1/replay/replay-bundle.json',
    reportHash: 'report-hash',
    timestamp,
  });
  await writeJson(replayBundlePath, {
    bundleId: 'run-1-bundle',
    bundleHash: 'bundle-hash',
    reportHash: 'report-hash',
    createdAt: timestamp,
    context: {
      runId: 'run-1',
      runName: 'cert-test',
      mode: 'behavioral',
      environment: 'local',
      seed: 42,
      buildId: 'build-1',
      fixtureHash: 'fixture-hash',
      configVersion: 'v1',
      clockMode: 'deterministic',
      startedAt: timestamp,
      outputDir: runDir,
    },
    config: {
      seed: 42,
      runName: 'cert-test',
      environment: 'local',
      mode: 'behavioral',
      localeDefaults: { country: 'TR', city: 'Istanbul', timezone: 'Europe/Istanbul' },
    },
    actions: [
      {
        actionId: 'a1',
        kind: 'discover.like',
        actorId: 'u1',
        targetId: 'u2',
        payload: { scenarioId: 'CORE-HAPPY-001' },
        plannedAtMs: 0,
        executedAtMs: 0,
        result: 'ok',
      },
    ],
    observations: [],
    invariants: [],
    anomalies: opts?.anomalyCode
      ? [
          {
            anomalyId: opts.anomalyCode,
            confidence: 0.99,
            severity: 'high',
            message: 'injected anomaly',
            evidence: ['a1'],
            releaseBlocking: true,
          },
        ]
      : [],
    scenarios: [{ id: 'CORE-HAPPY-001', name: 'Core Happy Path', category: 'core', objective: 'happy path' }],
    personas: [{ id: 'selective-liker', version: '1.0.0', description: 'Selective' }],
  });

  if (opts?.override === 'active') {
    await writeJson(join(evidenceDir, 'override.json'), {
      overrides: [
        {
          override_id: 'ovr-active',
          gate_id: 'pr-gate',
          feature_id: 'swipe.discovery',
          anomaly_codes: [opts.anomalyCode ?? 'ANOM-SWIPE-001'],
          approvers: ['release-manager', 'domain-owner'],
          created_at: timestamp,
          expires_at: '2099-01-01T00:00:00.000Z',
          dual_control: true,
          audit_reference: 'audit-1',
          status: 'active',
          review_required: true,
        },
      ],
    });
  } else if (opts?.override === 'expired') {
    await writeJson(join(evidenceDir, 'override.json'), {
      overrides: [
        {
          override_id: 'ovr-expired',
          gate_id: 'pr-gate',
          feature_id: 'swipe.discovery',
          anomaly_codes: [opts.anomalyCode ?? 'ANOM-SWIPE-001'],
          approvers: ['release-manager', 'domain-owner'],
          created_at: '2020-01-01T00:00:00.000Z',
          expires_at: '2020-01-02T00:00:00.000Z',
          dual_control: true,
          audit_reference: 'audit-1',
          status: 'active',
          review_required: true,
        },
      ],
    });
  }

  return { evidenceDir, reportPath, replayBundlePath };
}

test('valid registry parses and validates', async () => {
  const pack = await loadCertificationPack(repoRoot);
  const issues = validateCertificationPack(pack);
  assert.equal(issues.length, 0, JSON.stringify(issues, null, 2));
});

test('invalid registry fails referential integrity', async () => {
  const root = await makeTempRoot('opal-war-cert-invalid-');
  try {
    const featureRegistryPath = join(root, 'certification/features/feature-registry.yaml');
    const parsed = YAML.parse(await readFile(featureRegistryPath, 'utf8')) as { features: Array<Record<string, unknown>> };
    parsed.features[0].gate_ids = ['missing-gate'];
    await writeYaml(featureRegistryPath, parsed);
    const pack = await loadCertificationPack(root);
    const issues = validateCertificationPack(pack);
    assert.ok(issues.some((item) => item.code === 'broken-gate-ref'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('illegal state transition is rejected', async () => {
  const record: FeatureCertificationRecord = {
    feature_id: 'swipe.discovery',
    state: 'behaviorally-passing',
    locale_scope: 'global',
    certification_version: '1.0.0',
    last_certified_at: new Date().toISOString(),
    stale_after: 'P7D',
    required_evidence: ['build'],
    replay_bundle_ref: 'reports/runs/run-1/replay/replay-bundle.json',
    state_history: [
      {
        from: 'proposed',
        to: 'implemented',
        at: new Date().toISOString(),
        actor: 'ci',
      },
    ],
  };
  assert.throws(() => transitionFeatureCertification(record, { to: 'release-certified', actor: 'ci', reason: 'skip' }));
});

test('decertification helper returns decertified record and event', async () => {
  const pack = await loadCertificationPack(repoRoot);
  const existing = pack.featureCertifications.features.find((item) => item.feature_id === 'swipe.discovery');
  assert.ok(existing);
  const result = decertifyFeature(pack, {
    featureId: 'swipe.discovery',
    trigger: 'replayed blocker anomaly',
    anomalyCodes: ['ANOM-FAIR-001'],
    reason: 'fairness regression',
    replayBundlePath: '/tmp/replay.json',
  }, existing);
  assert.equal(result.updatedRecord.state, 'decertified');
  assert.equal(result.event.to_state, 'decertified');
});

test('certification checker passes on fresh evidence and valid override is active', async () => {
  const root = await makeTempRoot('opal-war-cert-pass-');
  try {
    const { reportPath, replayBundlePath, evidenceDir } = await createPassingEvidence(root, { override: 'active', anomalyCode: 'ANOM-FAIR-001' });
    const decision = await evaluateCertificationDecision({
      rootDir: root,
      gateId: 'pr-gate',
      featureId: 'swipe.discovery',
      reportPath,
      replayBundlePath,
      evidenceDir,
      overridePath: join(evidenceDir, 'override.json'),
      outputDir: join(root, 'reports/certification'),
    });
    assert.equal(decision.verdict, 'OVERRIDE_ACTIVE');
    assert.equal(decision.allowed, true);
    assert.ok(decision.override_debt.length > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stale evidence fails certification', async () => {
  const root = await makeTempRoot('opal-war-cert-stale-');
  try {
    const { reportPath, replayBundlePath, evidenceDir } = await createPassingEvidence(root, { stale: true });
    const decision = await evaluateCertificationDecision({
      rootDir: root,
      gateId: 'pre-release-cert',
      featureId: 'swipe.discovery',
      reportPath,
      replayBundlePath,
      evidenceDir,
      outputDir: join(root, 'reports/certification'),
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.verdict, 'DECERTIFIED');
    assert.ok(decision.feature_decisions[0].staleEvidence.length > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('blocker anomaly decertifies feature', async () => {
  const root = await makeTempRoot('opal-war-cert-anom-');
  try {
    const { reportPath, replayBundlePath, evidenceDir } = await createPassingEvidence(root, { anomalyCode: 'ANOM-FAIR-001' });
    const decision = await evaluateCertificationDecision({
      rootDir: root,
      gateId: 'pre-release-cert',
      featureId: 'swipe.discovery',
      reportPath,
      replayBundlePath,
      evidenceDir,
      outputDir: join(root, 'reports/certification'),
    });
    assert.equal(decision.verdict, 'DECERTIFIED');
    assert.equal(decision.allowed, false);
    assert.ok(decision.decertification_events.length > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('expired override does not unblock gate', async () => {
  const root = await makeTempRoot('opal-war-cert-expired-');
  try {
    const { reportPath, replayBundlePath, evidenceDir } = await createPassingEvidence(root, { override: 'expired', anomalyCode: 'ANOM-FAIR-001' });
    const decision = await evaluateCertificationDecision({
      rootDir: root,
      gateId: 'pr-gate',
      featureId: 'swipe.discovery',
      reportPath,
      replayBundlePath,
      evidenceDir,
      overridePath: join(evidenceDir, 'override.json'),
      outputDir: join(root, 'reports/certification'),
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.verdict, 'DECERTIFIED');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cli certification validate and gate contracts are enforced', async () => {
  const root = await makeTempRoot('opal-war-cert-cli-');
  try {
    const { reportPath, replayBundlePath, evidenceDir } = await createPassingEvidence(root);
    const validate = spawnNodeScript(['src/cli/opal-war.ts', 'certification', 'validate', '--root', root], {});
    let validateOutput = '';
    validate.proc.stdout.on('data', (chunk) => {
      validateOutput += chunk.toString();
    });
    const validateExit = await new Promise<number>((resolve, reject) => {
      validate.proc.once('exit', (code) => resolve(code ?? 0));
      validate.proc.once('error', reject);
    });
    assert.equal(validateExit, 0);
    assert.match(validateOutput, /\"valid\": true/);

    const gate = spawnNodeScript([
      'src/cli/opal-war.ts',
      'certification',
      'gate',
      '--root',
      root,
      '--gate',
      'pre-release-cert',
      '--featureId',
      'swipe.discovery',
      '--report',
      reportPath,
      '--replay',
      replayBundlePath,
      '--evidenceDir',
      evidenceDir,
    ], {});
    let gateOutput = '';
    gate.proc.stdout.on('data', (chunk) => {
      gateOutput += chunk.toString();
    });
    const gateExit = await new Promise<number>((resolve, reject) => {
      gate.proc.once('exit', (code) => resolve(code ?? 0));
      gate.proc.once('error', reject);
    });
    assert.equal(gateExit, 0);
    assert.match(gateOutput, /\"verdict\": \"CERTIFIED\"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release config prefers env-driven staging urls over localhost defaults', async (t) => {
  const original = {
    WAR_BACKEND_BASE_URL: process.env.WAR_BACKEND_BASE_URL,
    WAR_CONTROL_PLANE_URL: process.env.WAR_CONTROL_PLANE_URL,
    WAR_FLUTTER_BRIDGE_URL: process.env.WAR_FLUTTER_BRIDGE_URL,
    WAR_STAGING_BASE_URL: process.env.WAR_STAGING_BASE_URL,
  };
  process.env.WAR_BACKEND_BASE_URL = 'https://backend.example.test';
  process.env.WAR_CONTROL_PLANE_URL = 'https://control.example.test';
  process.env.WAR_FLUTTER_BRIDGE_URL = 'https://bridge.example.test';
  process.env.WAR_STAGING_BASE_URL = 'https://staging.example.test';
  t.after(() => {
    process.env.WAR_BACKEND_BASE_URL = original.WAR_BACKEND_BASE_URL;
    process.env.WAR_CONTROL_PLANE_URL = original.WAR_CONTROL_PLANE_URL;
    process.env.WAR_FLUTTER_BRIDGE_URL = original.WAR_FLUTTER_BRIDGE_URL;
    process.env.WAR_STAGING_BASE_URL = original.WAR_STAGING_BASE_URL;
  });

  const config = await resolveHarnessConfig({ configPath: './configs/release.json' });
  assert.equal(config.backend.baseUrl, 'https://backend.example.test');
  assert.equal(config.backend.controlPlaneUrl, 'https://control.example.test');
  assert.equal(config.backend.flutterBridgeUrl, 'https://bridge.example.test');
});

test('certification preflight succeeds against a staging-like public surface', async (t) => {
  const port = await findFreePort();
  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    const testMode = req.headers['x-test-mode'] === 'true';
    const secret = req.headers['x-war-harness-secret'];
    if (!(testMode || secret === 'mirror-secret')) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
      return;
    }

    if (method === 'GET' && url === '/war-harness/ping') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, synthetic: true }));
      return;
    }
    if (method === 'POST' && url === '/war-harness/bootstrap') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ accepted: true, synthetic: true, tenantId: 'tenant-1', bootstrapToken: 'token-1' }));
      return;
    }
    if (method === 'POST' && url === '/war-harness/cleanup') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ accepted: true, synthetic: true, cleaned: true }));
      return;
    }
    if (method === 'POST' && url === '/war-harness') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ acknowledged: true, synthetic: true }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not_found' }));
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const root = await makeTempRoot('opal-war-preflight-');
  try {
    const result = await runCertificationPreflight({
      controlPlaneUrl: `http://127.0.0.1:${port}`,
      flutterBridgeUrl: `http://127.0.0.1:${port}`,
      secret: 'mirror-secret',
      outputDir: join(root, 'reports/certification'),
    });
    assert.equal(result.ok, true);
    assert.ok(result.checks.every((check) => check.ok));
    assert.ok(await readFile(join(root, 'reports/certification', 'preflight.json'), 'utf8'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
