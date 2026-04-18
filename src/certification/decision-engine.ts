import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCertificationPack } from './loader.js';
import { loadOverrideRecords, evaluateOverrides } from './overrides.js';
import { validateCertificationPack } from './validator.js';
import { readStructuredFile } from './parser.js';
import { resolveCertificationPaths } from './paths.js';
import { assessWarHarnessArtifacts } from './war-harness.js';
import { evaluateAnomalies } from './anomalies.js';
import { evaluateEvidenceResolution, collectEvidenceArtifacts, loadWarHarnessArtifacts, discoverLatestWarHarnessArtifactPaths } from './evidence.js';
import { decertifyFeature } from './decertify.js';
import { transitionFeatureCertification } from './state-machine.js';
import type {
  CertificationDecisionRecord,
  CertificationPack,
  CertificationState,
  CertificationVerdict,
  DecertificationEventRecord,
  FeatureCertificationDecision,
  FeatureCertificationRecord,
  FeatureRegistryRecord,
  GatePolicyRecord,
} from './types.js';

export interface CertificationCheckOptions {
  rootDir?: string;
  gateId?: string;
  reportPath?: string;
  replayBundlePath?: string;
  evidenceDir?: string;
  overridePath?: string;
  featureId?: string;
  localeId?: string;
  now?: Date;
  outputDir?: string;
}

function stateRank(state: CertificationState): number {
  return [
    'proposed',
    'implemented',
    'contract-passing',
    'functionally-passing',
    'behaviorally-passing',
    'system-certified',
    'release-certified',
    'regression-locked',
    'decertified',
  ].indexOf(state);
}

function minimumSatisfied(current: CertificationState, minimum: CertificationState): boolean {
  return stateRank(current) >= stateRank(minimum) && current !== 'decertified';
}

function familiesForFeature(feature: FeatureRegistryRecord): string[] {
  return [feature.family];
}

function featureMinStateForGate(gate: GatePolicyRecord): CertificationState {
  return gate.minimum_required_state;
}

function buildFeatureDecision(
  feature: FeatureRegistryRecord,
  cert: FeatureCertificationRecord,
  gate: GatePolicyRecord,
  evidenceResolution: ReturnType<typeof evaluateEvidenceResolution>,
  anomalyAssessment: ReturnType<typeof evaluateAnomalies>,
  overrideAssessment: ReturnType<typeof evaluateOverrides>,
  now: Date,
  localeId?: string,
): FeatureCertificationDecision {
  const requiredState = featureMinStateForGate(gate);
  const reasons: string[] = [];
  const blockingAnomalies = anomalyAssessment.blocking.filter((code) => feature.blocker_anomalies.includes(code));
  const advisoryAnomalies = anomalyAssessment.advisory.filter((code) => feature.blocker_anomalies.includes(code));
  const staleMs = Date.parse(now.toISOString()) - Date.parse(cert.last_certified_at);
  const staleLimit = Number.isNaN(Date.parse(cert.stale_after)) ? Number.POSITIVE_INFINITY : (() => {
    const iso = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/u.exec(cert.stale_after);
    if (!iso) return Number.POSITIVE_INFINITY;
    const days = Number(iso[1] ?? '0');
    const hours = Number(iso[2] ?? '0');
    const minutes = Number(iso[3] ?? '0');
    return (((days * 24) + hours) * 60 + minutes) * 60 * 1000;
  })();
  const stale = staleMs > staleLimit;

  if (feature.locale_scope !== 'global' && !localeId && !cert.locale_ids?.length) {
    reasons.push('locale scoped certification requires a locale id');
  }
  if (!minimumSatisfied(cert.state, requiredState)) {
    reasons.push(`state ${cert.state} does not satisfy minimum ${requiredState}`);
  }
  if (evidenceResolution.missing.length > 0) {
    reasons.push(`missing evidence: ${evidenceResolution.missing.join(', ')}`);
  }
  if (evidenceResolution.stale.length > 0) {
    reasons.push(`stale evidence: ${evidenceResolution.stale.join(', ')}`);
  }
  if (evidenceResolution.invalid.length > 0) {
    reasons.push(`invalid evidence: ${evidenceResolution.invalid.join('; ')}`);
  }
  if (stale) {
    reasons.push(`certification stale after ${cert.stale_after}`);
  }
  if (blockingAnomalies.length > 0) {
    reasons.push(`blocking anomalies: ${blockingAnomalies.join(', ')}`);
  }
  if (overrideAssessment.invalid.length > 0) {
    reasons.push(`invalid overrides: ${overrideAssessment.invalid.join('; ')}`);
  }

  const overrideActive = overrideAssessment.isOverrideActive && reasons.length > 0 && gate.override_allowed && overrideAssessment.invalid.length === 0;
  const decertified =
    cert.state === 'decertified' ||
    (!overrideActive && (blockingAnomalies.length > 0 || evidenceResolution.missing.length > 0 || evidenceResolution.stale.length > 0));

  const allowed = reasons.length === 0 || overrideActive;
  const verdict: CertificationVerdict = decertified
    ? 'DECERTIFIED'
    : overrideActive
      ? 'OVERRIDE_ACTIVE'
      : allowed
        ? 'CERTIFIED'
        : 'NOT_CERTIFIED';

  return {
    featureId: feature.feature_id,
    gateId: gate.gate_id,
    state: cert.state,
    minimumRequiredState: requiredState,
    allowed,
    verdict,
    reasons,
    missingEvidence: evidenceResolution.missing,
    staleEvidence: evidenceResolution.stale,
    invalidEvidence: evidenceResolution.invalid,
    blockingAnomalies,
    advisoryAnomalies,
    overrideActive,
    overrideDebt: overrideAssessment.overrideDebt,
    decertified,
    localeId: cert.locale_ids?.[0],
    evidenceRef: cert.replay_bundle_ref,
  };
}

async function writeDecisionArtifacts(outputDir: string, decision: CertificationDecisionRecord): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'certification-decision.json'), `${JSON.stringify(decision, null, 2)}\n`, 'utf8');
}

export async function evaluateCertificationDecision(options: CertificationCheckOptions = {}): Promise<CertificationDecisionRecord> {
  const pack = await loadCertificationPack(options.rootDir);
  const registryIssues = validateCertificationPack(pack);
  if (registryIssues.some((issue) => issue.severity === 'error')) {
    const first = registryIssues.find((issue) => issue.severity === 'error');
    throw new Error(`Certification registry validation failed: ${first?.path ?? 'unknown'} ${first?.message ?? ''}`.trim());
  }

  const paths = resolveCertificationPaths(options.rootDir);
  const gateId = options.gateId ?? 'pre-release-cert';
  const gate = pack.gatePolicies.gates.find((item) => item.gate_id === gateId);
  if (!gate) {
    throw new Error(`Unknown gate: ${gateId}`);
  }
  const overridePolicy = pack.overridePolicies.overrides.find((item) => item.gate_id === gateId);
  if (!overridePolicy) {
    throw new Error(`Missing override policy for gate: ${gateId}`);
  }

  const discovered = await discoverLatestWarHarnessArtifactPaths(options.rootDir);
  const reportPath = options.reportPath ?? discovered?.reportPath;
  const replayBundlePath = options.replayBundlePath ?? discovered?.replayBundlePath;

  const artifacts = await collectEvidenceArtifacts(
    {
      evidencePolicies: pack.evidencePolicies,
      replayPolicies: pack.replayPolicies,
    },
    {
      rootDir: options.rootDir,
      reportPath,
      replayBundlePath,
      evidenceDir: options.evidenceDir,
      overridePath: options.overridePath,
    },
  );

  const { report, replayBundle } = await loadWarHarnessArtifacts({
    rootDir: options.rootDir,
    reportPath,
    replayBundlePath,
  });

  if (!report && !replayBundle) {
    throw new Error('War Harness artifacts not found. Provide --report/--replay or run the harness first.');
  }

  const warHarness = assessWarHarnessArtifacts(report, replayBundle, pack.featureRegistry.features);
  const anomalyAssessment = evaluateAnomalies(
    replayBundle?.anomalies ?? [],
    pack.anomalySeverity.anomalies,
    gate.blocker_severities,
  );

  const activeOverrideRecords = await loadOverrideRecords(options.overridePath);
  const featureIds = options.featureId
    ? [options.featureId]
    : warHarness.touchedFeatureIds.length > 0
      ? warHarness.touchedFeatureIds
      : pack.featureRegistry.features
          .filter((feature) => gate.covered_feature_families.includes(feature.family))
          .map((feature) => feature.feature_id);

  const now = options.now ?? new Date();
  const featureDecisions: FeatureCertificationDecision[] = [];
  const decertificationEvents: DecertificationEventRecord[] = [];
  const overrideDebt: string[] = [];
  const blockingAnomalies = new Set<string>();
  const advisoryAnomalies = new Set<string>();
  let verdict: CertificationVerdict = 'CERTIFIED';

  for (const featureId of featureIds) {
    const feature = pack.featureRegistry.features.find((item) => item.feature_id === featureId);
    const cert = pack.featureCertifications.features.find((item) => item.feature_id === featureId);
    if (!feature || !cert) {
      throw new Error(`Missing registry record for feature ${featureId}`);
    }

    const evidenceResolution = evaluateEvidenceResolution(
      feature,
      cert,
      {
        evidencePolicies: pack.evidencePolicies.evidence,
        replayPolicy: pack.replayPolicies.replay,
        locales: pack.localePolicies.locales,
      },
      artifacts,
      now,
      options.localeId ?? cert.locale_ids?.[0],
      gate.required_evidence,
    );
    const overrideAssessment = evaluateOverrides(
      overridePolicy,
      activeOverrideRecords,
      gate.gate_id,
      anomalyAssessment.blocking,
      now,
    );

    const decision = buildFeatureDecision(
      feature,
      cert,
      gate,
      evidenceResolution,
      anomalyAssessment,
      overrideAssessment,
      now,
      options.localeId ?? cert.locale_ids?.[0],
    );
    featureDecisions.push(decision);
    overrideDebt.push(...decision.overrideDebt);
    for (const code of decision.blockingAnomalies) {
      blockingAnomalies.add(code);
    }
    for (const code of decision.advisoryAnomalies) {
      advisoryAnomalies.add(code);
    }

    if (decision.verdict === 'DECERTIFIED') {
      const trigger = anomalyAssessment.blocking.find((code) => decision.blockingAnomalies.includes(code))
        ?? decision.staleEvidence[0]
        ?? decision.missingEvidence[0]
        ?? 'stale evidence';
      const decertified = decertifyFeature(
        pack,
        {
          featureId,
          trigger,
          anomalyCodes: decision.blockingAnomalies,
          reason: decision.reasons.join('; '),
          localeId: decision.localeId ?? options.localeId,
          replayBundlePath: options.replayBundlePath,
        },
        cert,
      );
      decertificationEvents.push(decertified.event);
      verdict = 'DECERTIFIED';
    } else if (decision.verdict === 'NOT_CERTIFIED' && verdict !== 'DECERTIFIED') {
      verdict = 'NOT_CERTIFIED';
    } else if (decision.verdict === 'OVERRIDE_ACTIVE' && verdict === 'CERTIFIED') {
      verdict = 'OVERRIDE_ACTIVE';
    }
  }

  if (anomalyAssessment.unknown.length > 0 && verdict === 'CERTIFIED') {
    verdict = 'NOT_CERTIFIED';
  }
  if (blockingAnomalies.size > 0 && verdict === 'CERTIFIED') {
    verdict = 'NOT_CERTIFIED';
  }

  const allowed = verdict === 'CERTIFIED' || verdict === 'OVERRIDE_ACTIVE';
  const decision: CertificationDecisionRecord = {
    run_id: report?.run.runId ?? replayBundle?.context.runId ?? 'unknown-run',
    gate_id: gate.gate_id,
    verdict,
    allowed,
    reasons: featureDecisions.flatMap((item) => item.reasons),
    feature_decisions: featureDecisions,
    blocking_anomalies: [...blockingAnomalies],
    advisory_anomalies: [...advisoryAnomalies],
    override_debt: overrideDebt,
    decertification_events: decertificationEvents,
    generated_at: now.toISOString(),
    registry_version: pack.constitution.constitution_version,
    evidence: {
      report_path: reportPath ?? (report ? join(paths.outputDir, 'war-harness-report.json') : undefined),
      replay_bundle_path: replayBundlePath ?? (replayBundle ? join(paths.outputDir, 'replay-bundle.json') : undefined),
      override_path: options.overridePath,
    },
  };

  await writeDecisionArtifacts(options.outputDir ?? paths.outputDir, decision);
  return decision;
}
