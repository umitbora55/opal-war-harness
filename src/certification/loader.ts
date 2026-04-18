import type { CertificationPack } from './types.js';
import { resolveCertificationPaths } from './paths.js';
import { readStructuredFile } from './parser.js';

export async function loadCertificationPack(rootDir?: string): Promise<CertificationPack> {
  const paths = resolveCertificationPaths(rootDir);
  return {
    constitution: await readStructuredFile(paths.constitution),
    featureRegistry: await readStructuredFile(paths.featureRegistry),
    featureCertifications: await readStructuredFile(paths.featureCertifications),
    gatePolicies: await readStructuredFile(paths.gatePolicies),
    anomalySeverity: await readStructuredFile(paths.anomalySeverity),
    evidencePolicies: await readStructuredFile(paths.evidencePolicies),
    replayPolicies: await readStructuredFile(paths.replayPolicies),
    overridePolicies: await readStructuredFile(paths.overridePolicies),
    localePolicies: await readStructuredFile(paths.localePolicies),
    releaseGates: await readStructuredFile(paths.releaseGates),
  };
}

