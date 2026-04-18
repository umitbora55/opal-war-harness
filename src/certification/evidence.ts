import { createHash } from 'node:crypto';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { readStructuredFile } from './parser.js';
import { resolveCertificationPaths } from './paths.js';
import type {
  EvidencePolicyRecord,
  EvidenceResolution,
  FeatureCertificationRecord,
  FeatureRegistryRecord,
  LocaleCertificationPolicyRecord,
  ReplayPolicyRecord,
  StructuredEvidenceArtifact,
  WarHarnessReportArtifact,
  WarHarnessReplayBundleArtifact,
} from './types.js';

export interface EvidenceInput {
  rootDir?: string;
  reportPath?: string;
  replayBundlePath?: string;
  evidenceDir?: string;
  buildProofPath?: string;
  contractProofPath?: string;
  runtimeProofPath?: string;
  dbProofPath?: string;
  auditProofPath?: string;
  traceProofPath?: string;
  localizationProofPath?: string;
  trustProofPath?: string;
  releaseVerdictPath?: string;
  overridePath?: string;
}

function parseDurationToMs(duration: string): number {
  const iso = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/u.exec(duration);
  if (!iso) {
    return Number.NaN;
  }
  const days = Number(iso[1] ?? '0');
  const hours = Number(iso[2] ?? '0');
  const minutes = Number(iso[3] ?? '0');
  return (((days * 24) + hours) * 60 + minutes) * 60 * 1000;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readArtifact(path: string, evidenceType: string, canonicalArtifactName: string): Promise<StructuredEvidenceArtifact | null> {
  if (!(await exists(path))) {
    return null;
  }
  const raw = await readFile(path, 'utf8');
  const payload = path.endsWith('.json') ? JSON.parse(raw) as Record<string, unknown> : await readStructuredFile<Record<string, unknown>>(path);
  const hash = createHash('sha256').update(raw).digest('hex');
  const capturedAt = typeof payload.timestamp === 'string'
    ? payload.timestamp
    : typeof payload.generatedAt === 'string'
      ? payload.generatedAt
      : new Date().toISOString();
  return { evidenceType, path, canonicalArtifactName, payload, capturedAt, hash };
}

function validateRequiredFields(payload: Record<string, unknown>, required: string[]): string[] {
  return required.filter((field) => !(field in payload));
}

function canonicalArtifactPath(evidenceDir: string | undefined, canonicalName: string): string {
  return join(evidenceDir ?? resolveCertificationPaths().outputDir, canonicalName);
}

export async function collectEvidenceArtifacts(
  policies: {
    evidencePolicies: { evidence: EvidencePolicyRecord[] };
    replayPolicies: { replay: ReplayPolicyRecord };
  },
  input: EvidenceInput = {},
): Promise<StructuredEvidenceArtifact[]> {
  const paths = resolveCertificationPaths(input.rootDir);
  const baseDir = input.evidenceDir ?? paths.outputDir;
  const candidatePaths: Array<[string, string]> = [
    ['build', input.buildProofPath ?? canonicalArtifactPath(baseDir, 'build-proof.json')],
    ['contract', input.contractProofPath ?? canonicalArtifactPath(baseDir, 'contract-proof.json')],
    ['runtime', input.runtimeProofPath ?? canonicalArtifactPath(baseDir, 'runtime-proof.json')],
    ['db_side_effect', input.dbProofPath ?? canonicalArtifactPath(baseDir, 'db-proof.json')],
    ['audit', input.auditProofPath ?? canonicalArtifactPath(baseDir, 'audit-trail.json')],
    ['trace', input.traceProofPath ?? canonicalArtifactPath(baseDir, 'trace-proof.json')],
    ['synthetic_behavioral', input.reportPath ?? canonicalArtifactPath(baseDir, 'war-harness-report.json')],
    ['replay_bundle', input.replayBundlePath ?? canonicalArtifactPath(baseDir, 'replay-bundle.json')],
    ['release_gate', input.releaseVerdictPath ?? canonicalArtifactPath(baseDir, 'release-verdict.json')],
    ['localization', input.localizationProofPath ?? canonicalArtifactPath(baseDir, 'locale-certification-snapshot.json')],
    ['trust_safe', input.trustProofPath ?? canonicalArtifactPath(baseDir, 'trust-proof.json')],
  ];

  const artifacts: StructuredEvidenceArtifact[] = [];
  for (const [evidenceType, path] of candidatePaths) {
    const policy = policies.evidencePolicies.evidence.find((item) => item.evidence_type === evidenceType);
    if (!policy) {
      continue;
    }
    const artifact = await readArtifact(path, evidenceType, policy.canonical_artifact_name);
    if (artifact) {
      artifacts.push(artifact);
    }
  }

  return artifacts;
}

export function evaluateEvidenceResolution(
  feature: FeatureRegistryRecord,
  certification: FeatureCertificationRecord,
  policies: {
    evidencePolicies: EvidencePolicyRecord[];
    replayPolicy: ReplayPolicyRecord;
    locales: LocaleCertificationPolicyRecord[];
  },
  artifacts: StructuredEvidenceArtifact[],
  now = new Date(),
  localeId?: string,
  gateRequiredEvidence: string[] = [],
): EvidenceResolution {
  const required = Array.from(new Set([...feature.required_evidence, ...certification.required_evidence, ...gateRequiredEvidence]));
  if (feature.locale_scope === 'locale') {
    const localePolicy = localeId ? policies.locales.find((item) => item.locale_id === localeId) : undefined;
    if (localePolicy) {
      for (const evidenceType of localePolicy.evidence_types) {
        if (!required.includes(evidenceType)) {
          required.push(evidenceType);
        }
      }
    }
  }

  const present: string[] = [];
  const missing: string[] = [];
  const stale: string[] = [];
  const invalid: string[] = [];

  for (const evidenceType of required) {
    const policy = policies.evidencePolicies.find((item) => item.evidence_type === evidenceType);
    if (!policy) {
      invalid.push(`unknown evidence type: ${evidenceType}`);
      continue;
    }
    const matching = artifacts.filter((artifact) => artifact.evidenceType === evidenceType);
    if (matching.length === 0) {
      missing.push(evidenceType);
      continue;
    }
    const artifact = matching[0];
    present.push(evidenceType);
    const missingFields = validateRequiredFields(artifact.payload, policy.schema.required_fields);
    if (missingFields.length > 0) {
      invalid.push(`${evidenceType}: missing ${missingFields.join(', ')}`);
      continue;
    }
    const capturedAtMs = Date.parse(artifact.capturedAt);
    const ttlMs = parseDurationToMs(policy.staleness_ttl);
    if (!Number.isFinite(capturedAtMs) || !Number.isFinite(ttlMs)) {
      invalid.push(`${evidenceType}: invalid timestamp/ttl`);
      continue;
    }
    if (now.getTime() - capturedAtMs > ttlMs) {
      stale.push(evidenceType);
    }
  }

  return { required, present, missing, stale, invalid, artifacts };
}

export interface WarHarnessArtifacts {
  report?: WarHarnessReportArtifact;
  replayBundle?: WarHarnessReplayBundleArtifact;
}

export async function loadWarHarnessArtifacts(input: {
  rootDir?: string;
  reportPath?: string;
  replayBundlePath?: string;
} = {}): Promise<WarHarnessArtifacts> {
  const paths = resolveCertificationPaths(input.rootDir);
  const discovered = input.reportPath && input.replayBundlePath
    ? null
    : await discoverLatestWarHarnessArtifactPaths(input.rootDir);
  const reportPath = input.reportPath ?? discovered?.reportPath ?? join(paths.outputDir, 'report.json');
  const replayBundlePath = input.replayBundlePath ?? discovered?.replayBundlePath ?? join(paths.outputDir, 'replay-bundle.json');
  const report = await readStructuredFile<WarHarnessReportArtifact>(reportPath).catch(() => undefined);
  const replayBundle = await readStructuredFile<WarHarnessReplayBundleArtifact>(replayBundlePath).catch(() => undefined);
  return { report, replayBundle };
}

export async function discoverLatestWarHarnessArtifactPaths(rootDir?: string): Promise<{
  reportPath?: string;
  replayBundlePath?: string;
} | null> {
  const paths = resolveCertificationPaths(rootDir);
  const runsDir = join(paths.rootDir, 'reports/runs');
  try {
    const entries = await readdir(runsDir, { withFileTypes: true });
    const candidates: Array<{ reportPath: string; mtimeMs: number }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const reportPath = join(runsDir, entry.name, 'report.json');
      if (!(await exists(reportPath))) {
        continue;
      }
      const reportStat = await stat(reportPath);
      candidates.push({ reportPath, mtimeMs: reportStat.mtimeMs });
    }
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (candidates.length === 0) {
      return null;
    }
    const reportPath = candidates[0].reportPath;
    let replayBundlePath: string | undefined;
    try {
      const report = await readStructuredFile<WarHarnessReportArtifact>(reportPath);
      replayBundlePath = report.replayBundlePath;
      if (replayBundlePath && !replayBundlePath.startsWith('/')) {
        replayBundlePath = resolve(paths.rootDir, replayBundlePath);
      }
    } catch {
      replayBundlePath = resolve(paths.rootDir, 'reports/runs', basename(dirname(reportPath)), 'replay', 'replay-bundle.json');
    }
    return { reportPath, replayBundlePath };
  } catch {
    return null;
  }
}
