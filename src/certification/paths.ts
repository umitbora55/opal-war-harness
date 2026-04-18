import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

export function resolveRepoRoot(startDir = process.cwd()): string {
  let current = resolve(startDir);
  const moduleRoot = resolve(MODULE_DIR, '..', '..');
  const visited = new Set<string>();

  while (!visited.has(current)) {
    visited.add(current);
    const packageJson = join(current, 'package.json');
    const certificationDir = join(current, 'certification');
    if (existsSync(packageJson) && existsSync(certificationDir)) {
      return current;
    }
    if (current === dirname(current)) {
      break;
    }
    current = dirname(current);
  }

  return moduleRoot;
}

export function resolveCertificationPaths(rootDir = resolveRepoRoot()) {
  return {
    rootDir,
    constitution: join(rootDir, 'certification/constitution/version.json'),
    featureRegistry: join(rootDir, 'certification/features/feature-registry.yaml'),
    featureCertifications: join(rootDir, 'certification/features/feature-certification-registry.yaml'),
    gatePolicies: join(rootDir, 'certification/gates/gate-policy-registry.yaml'),
    anomalySeverity: join(rootDir, 'certification/anomalies/anomaly-severity-registry.yaml'),
    evidencePolicies: join(rootDir, 'certification/evidence/evidence-policy-registry.yaml'),
    replayPolicies: join(rootDir, 'certification/replay/replay-policy-registry.yaml'),
    overridePolicies: join(rootDir, 'certification/overrides/override-policy-registry.yaml'),
    localePolicies: join(rootDir, 'certification/localization/locale-certification-policies.yaml'),
    releaseGates: join(rootDir, 'certification/releases/release-gate-registry.yaml'),
    outputDir: join(rootDir, 'reports/certification'),
  };
}

