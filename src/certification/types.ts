import type { Severity } from '../core/types.js';

export type CertificationState =
  | 'proposed'
  | 'implemented'
  | 'contract-passing'
  | 'functionally-passing'
  | 'behaviorally-passing'
  | 'system-certified'
  | 'release-certified'
  | 'regression-locked'
  | 'decertified';

export type CertificationVerdict = 'CERTIFIED' | 'NOT_CERTIFIED' | 'DECERTIFIED' | 'OVERRIDE_ACTIVE';

export interface ConstitutionVersionRecord {
  constitution_name: string;
  constitution_version: string;
  constitution_hash: string;
  schema_version: string;
  effective_at: string;
  updated_at: string;
  owners: string[];
  source_of_truth: string;
}

export interface FeatureRegistryRecord {
  feature_id: string;
  family: string;
  display_name: string;
  owner_team: string;
  description: string;
  risk_tier: Severity;
  release_blocking: boolean;
  war_harness_required: boolean;
  locale_scope: 'global' | 'locale';
  trust_critical: boolean;
  required_evidence: string[];
  blocker_anomalies: string[];
  gate_ids: string[];
}

export interface FeatureCertificationTransitionRecord {
  from: CertificationState;
  to: CertificationState;
  at: string;
  actor: string;
  reason?: string;
  evidence_refs?: string[];
}

export interface FeatureCertificationRecord {
  feature_id: string;
  state: CertificationState;
  locale_scope: 'global' | 'locale';
  locale_ids?: string[];
  certification_version: string;
  last_certified_at: string;
  stale_after: string;
  required_evidence: string[];
  replay_bundle_ref?: string;
  state_history: FeatureCertificationTransitionRecord[];
  decertified_at?: string;
  decertification_reason?: string;
  decertification_trigger?: string;
}

export interface GatePolicyRecord {
  gate_id: string;
  purpose: string;
  covered_feature_families: string[];
  required_evidence: string[];
  blocker_severities: Severity[];
  advisory_severities: Severity[];
  mandatory_artifacts: string[];
  override_policy_ref: string | null;
  override_allowed: boolean;
  override_ttl: string | null;
  audit_required: boolean;
  minimum_required_state: CertificationState;
}

export interface AnomalySeverityRecord {
  anomaly_code: string;
  severity: Severity;
  release_effect: 'hard_block' | 'block_release_cert' | 'block_locale_rollout' | 'advisory';
  replay_required: boolean;
  decertification_trigger: boolean;
  owner_domain: string;
}

export interface EvidencePolicyRecord {
  evidence_type: string;
  canonical_artifact_name: string;
  schema: {
    required_fields: string[];
    optional_fields: string[];
  };
  retention: string;
  staleness_ttl: string;
  mandatory_for_feature_families: string[];
  missing_gate_effect: 'hard_fail' | 'warn';
}

export interface ReplayPolicyRecord {
  bundle_artifact_name: string;
  required_fields: string[];
  retention: string;
  reproducibility_policy: string;
  compare_fields: string[];
  required_for_anomalies: string[];
}

export interface OverridePolicyRecord {
  gate_id: string;
  overrideable: boolean;
  forbidden_anomalies: string[];
  required_approvers: string[];
  dual_control: boolean;
  ttl: string | null;
  post_override_review_required: boolean;
  max_active_overrides: number;
}

export interface LocaleCertificationPolicyRecord {
  locale_id: string;
  country: string;
  city: string;
  timezone: string;
  global_invariants: string[];
  thresholds: Record<string, number>;
  release_blockers: string[];
  evidence_types: string[];
}

export interface ReleaseGateRecord {
  stage: string;
  gate_id: string;
  required_artifacts: string[];
  blocking_on: Severity[];
}

export interface CertificationPack {
  constitution: ConstitutionVersionRecord;
  featureRegistry: { version: string; updated_at: string; features: FeatureRegistryRecord[] };
  featureCertifications: { version: string; updated_at: string; features: FeatureCertificationRecord[] };
  gatePolicies: { version: string; updated_at: string; gates: GatePolicyRecord[] };
  anomalySeverity: { version: string; updated_at: string; anomalies: AnomalySeverityRecord[] };
  evidencePolicies: { version: string; updated_at: string; evidence: EvidencePolicyRecord[] };
  replayPolicies: { version: string; updated_at: string; replay: ReplayPolicyRecord };
  overridePolicies: { version: string; updated_at: string; overrides: OverridePolicyRecord[] };
  localePolicies: { version: string; updated_at: string; locales: LocaleCertificationPolicyRecord[] };
  releaseGates: { version: string; updated_at: string; release_gates: ReleaseGateRecord[] };
}

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface StructuredEvidenceArtifact {
  evidenceType: string;
  path: string;
  canonicalArtifactName: string;
  payload: Record<string, unknown>;
  capturedAt: string;
  hash: string;
}

export interface EvidenceResolution {
  required: string[];
  present: string[];
  missing: string[];
  stale: string[];
  invalid: string[];
  artifacts: StructuredEvidenceArtifact[];
}

export interface DecertificationTriggerInput {
  featureId: string;
  trigger: string;
  anomalyCodes: string[];
  reason: string;
  localeId?: string;
  replayBundlePath?: string;
}

export interface DecertificationEventRecord {
  event_id: string;
  feature_id: string;
  trigger: string;
  anomaly_codes: string[];
  from_state: CertificationState;
  to_state: CertificationState;
  reason: string;
  created_at: string;
  locale_id?: string;
  replay_bundle_path?: string;
}

export interface FeatureCertificationDecision {
  featureId: string;
  gateId: string;
  state: CertificationState;
  minimumRequiredState: CertificationState;
  allowed: boolean;
  verdict: CertificationVerdict;
  reasons: string[];
  missingEvidence: string[];
  staleEvidence: string[];
  invalidEvidence: string[];
  blockingAnomalies: string[];
  advisoryAnomalies: string[];
  overrideActive: boolean;
  overrideDebt: string[];
  decertified: boolean;
  localeId?: string;
  evidenceRef?: string;
}

export interface CertificationDecisionRecord {
  run_id: string;
  gate_id: string;
  verdict: CertificationVerdict;
  allowed: boolean;
  reasons: string[];
  feature_decisions: FeatureCertificationDecision[];
  blocking_anomalies: string[];
  advisory_anomalies: string[];
  override_debt: string[];
  decertification_events: DecertificationEventRecord[];
  generated_at: string;
  registry_version: string;
  evidence: {
    report_path?: string;
    replay_bundle_path?: string;
    override_path?: string;
  };
}

export interface WarHarnessReportArtifact {
  run: {
    runId: string;
    runName: string;
    mode: string;
    environment: string;
    seed: number;
    buildId: string;
    fixtureHash: string;
    configVersion: string;
    clockMode: string;
    startedAt: string;
    outputDir: string;
  };
  config: {
    seed: number;
    runName: string;
    environment: string;
    mode: string;
    localeDefaults?: { country: string; city: string; timezone: string };
  };
  verdict: {
    allowed: boolean;
    blockingReasons: string[];
    advisoryReasons: string[];
  };
  counts: Record<string, number>;
  featureMatrix: Record<string, boolean>;
  replayBundlePath: string;
  reportHash: string;
}

export interface WarHarnessReplayBundleArtifact {
  bundleId: string;
  bundleHash: string;
  reportHash: string;
  createdAt: string;
  context: {
    runId: string;
    runName: string;
    mode: string;
    environment: string;
    seed: number;
    buildId: string;
    fixtureHash: string;
    configVersion: string;
    clockMode: string;
    startedAt: string;
    outputDir: string;
  };
  config: {
    seed: number;
    runName: string;
    environment: string;
    mode: string;
    localeDefaults?: { country: string; city: string; timezone: string };
  };
  actions: Array<{
    actionId: string;
    kind: string;
    actorId: string;
    targetId?: string;
    payload: Record<string, unknown>;
    plannedAtMs: number;
    executedAtMs?: number;
    result?: 'ok' | 'blocked' | 'failed' | 'noop';
    errorCode?: string;
  }>;
  observations: Array<{ metric: string; value: number; threshold?: number; severity: Severity; source: string; released: boolean }>;
  invariants: Array<{ invariantId: string; passed: boolean; severity: Severity; message: string; evidence: string[]; autoFail: boolean }>;
  anomalies: Array<{ anomalyId: string; confidence: number; severity: Severity; message: string; evidence: string[]; releaseBlocking: boolean }>;
  scenarios: Array<{ id: string; name: string; category: string; objective: string }>;
  personas: Array<{ id: string; version: string; description: string }>;
}

