import type {
  CertificationPack,
  CertificationState,
  ValidationIssue,
} from './types.js';

const VALID_STATES: CertificationState[] = [
  'proposed',
  'implemented',
  'contract-passing',
  'functionally-passing',
  'behaviorally-passing',
  'system-certified',
  'release-certified',
  'regression-locked',
  'decertified',
];

const TRANSITIONS: Record<CertificationState, CertificationState[]> = {
  proposed: ['implemented', 'decertified'],
  implemented: ['contract-passing', 'decertified'],
  'contract-passing': ['functionally-passing', 'decertified'],
  'functionally-passing': ['behaviorally-passing', 'decertified'],
  'behaviorally-passing': ['system-certified', 'decertified'],
  'system-certified': ['release-certified', 'decertified'],
  'release-certified': ['regression-locked', 'decertified'],
  'regression-locked': ['decertified'],
  decertified: [],
};

function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message, severity: 'error' };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

function validateDuration(duration: string): boolean {
  return /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/u.test(duration);
}

function checkRequiredString(record: Record<string, unknown>, field: string, path: string, issues: ValidationIssue[]) {
  if (!isNonEmptyString(record[field])) {
    issues.push(issue('missing-field', `${path}.${field}`, 'Required string field missing or empty'));
  }
}

function checkRequiredArray(record: Record<string, unknown>, field: string, path: string, issues: ValidationIssue[]) {
  if (!Array.isArray(record[field])) {
    issues.push(issue('missing-field', `${path}.${field}`, 'Required array field missing'));
  }
}

export function validateCertificationPack(pack: CertificationPack): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const featureIds = new Set<string>();
  const featureFamilies = new Set<string>();
  const gateIds = new Set<string>();
  const anomalyCodes = new Set<string>();
  const evidenceTypes = new Set<string>();
  const localeIds = new Set<string>(pack.localePolicies.locales.map((item) => item.locale_id));
  const seenLocaleIds = new Set<string>();

  checkRequiredString(pack.constitution as unknown as Record<string, unknown>, 'constitution_name', 'constitution', issues);
  checkRequiredString(pack.constitution as unknown as Record<string, unknown>, 'constitution_version', 'constitution', issues);
  checkRequiredString(pack.constitution as unknown as Record<string, unknown>, 'constitution_hash', 'constitution', issues);

  for (const feature of pack.featureRegistry.features) {
    if (featureIds.has(feature.feature_id)) {
      issues.push(issue('duplicate-feature', `featureRegistry.${feature.feature_id}`, 'Duplicate feature id'));
    }
    featureIds.add(feature.feature_id);
    featureFamilies.add(feature.family);
    checkRequiredString(feature as unknown as Record<string, unknown>, 'feature_id', `featureRegistry.${feature.feature_id}`, issues);
    checkRequiredString(feature as unknown as Record<string, unknown>, 'family', `featureRegistry.${feature.feature_id}`, issues);
    checkRequiredString(feature as unknown as Record<string, unknown>, 'display_name', `featureRegistry.${feature.feature_id}`, issues);
    checkRequiredArray(feature as unknown as Record<string, unknown>, 'required_evidence', `featureRegistry.${feature.feature_id}`, issues);
    checkRequiredArray(feature as unknown as Record<string, unknown>, 'blocker_anomalies', `featureRegistry.${feature.feature_id}`, issues);
    checkRequiredArray(feature as unknown as Record<string, unknown>, 'gate_ids', `featureRegistry.${feature.feature_id}`, issues);
  }

  for (const anomaly of pack.anomalySeverity.anomalies) {
    if (anomalyCodes.has(anomaly.anomaly_code)) {
      issues.push(issue('duplicate-anomaly', `anomalySeverity.${anomaly.anomaly_code}`, 'Duplicate anomaly code'));
    }
    anomalyCodes.add(anomaly.anomaly_code);
  }

  for (const evidence of pack.evidencePolicies.evidence) {
    if (evidenceTypes.has(evidence.evidence_type)) {
      issues.push(issue('duplicate-evidence', `evidencePolicies.${evidence.evidence_type}`, 'Duplicate evidence type'));
    }
    evidenceTypes.add(evidence.evidence_type);
    if (!validateDuration(evidence.staleness_ttl)) {
      issues.push(issue('invalid-ttl', `evidencePolicies.${evidence.evidence_type}.staleness_ttl`, 'Invalid evidence TTL'));
    }
  }

  for (const gate of pack.gatePolicies.gates) {
    if (gateIds.has(gate.gate_id)) {
      issues.push(issue('duplicate-gate', `gatePolicies.${gate.gate_id}`, 'Duplicate gate id'));
    }
    gateIds.add(gate.gate_id);
    if (!VALID_STATES.includes(gate.minimum_required_state)) {
      issues.push(issue('invalid-state', `gatePolicies.${gate.gate_id}.minimum_required_state`, 'Invalid minimum state'));
    }
    if (gate.override_ttl && !validateDuration(gate.override_ttl)) {
      issues.push(issue('invalid-ttl', `gatePolicies.${gate.gate_id}.override_ttl`, 'Invalid override TTL'));
    }
    for (const evidenceType of gate.required_evidence) {
      if (!evidenceTypes.has(evidenceType)) {
        issues.push(issue('unknown-evidence-type', `gatePolicies.${gate.gate_id}.required_evidence`, `Unknown evidence type ${evidenceType}`));
      }
    }
  }

  for (const feature of pack.featureRegistry.features) {
    for (const gateId of feature.gate_ids) {
      if (!gateIds.has(gateId)) {
        issues.push(issue('broken-gate-ref', `featureRegistry.${feature.feature_id}.gate_ids`, `Unknown gate id ${gateId}`));
      }
    }
    for (const anomalyCode of feature.blocker_anomalies) {
      if (!anomalyCodes.has(anomalyCode)) {
        issues.push(issue('unknown-anomaly-code', `featureRegistry.${feature.feature_id}.blocker_anomalies`, `Unknown anomaly code ${anomalyCode}`));
      }
    }
    for (const evidenceType of feature.required_evidence) {
      if (!evidenceTypes.has(evidenceType)) {
        issues.push(issue('unknown-evidence-type', `featureRegistry.${feature.feature_id}.required_evidence`, `Unknown evidence type ${evidenceType}`));
      }
    }
  }

  for (const record of pack.featureCertifications.features) {
    if (!featureIds.has(record.feature_id)) {
      issues.push(issue('broken-feature-ref', `featureCertifications.${record.feature_id}`, `Unknown feature id ${record.feature_id}`));
    }
    if (!VALID_STATES.includes(record.state)) {
      issues.push(issue('invalid-state', `featureCertifications.${record.feature_id}.state`, 'Invalid certification state'));
    }
    if (!validateDuration(record.stale_after)) {
      issues.push(issue('invalid-ttl', `featureCertifications.${record.feature_id}.stale_after`, 'Invalid stale_after duration'));
    }
    if (record.required_evidence.some((evidenceType) => !evidenceTypes.has(evidenceType))) {
      issues.push(issue('unknown-evidence-type', `featureCertifications.${record.feature_id}.required_evidence`, 'Unknown required evidence type in feature certification'));
    }
    if ((record.state === 'behaviorally-passing' || record.state === 'system-certified' || record.state === 'release-certified' || record.state === 'regression-locked') && !record.replay_bundle_ref) {
      issues.push(issue('missing-replay-bundle', `featureCertifications.${record.feature_id}.replay_bundle_ref`, 'Replay bundle required at current state'));
    }
    if (record.locale_scope !== 'global') {
      if (!isNonEmptyArray<string>(record.locale_ids)) {
        issues.push(issue('missing-locale', `featureCertifications.${record.feature_id}.locale_ids`, 'Locale scoped certification requires locale_ids'));
      } else {
        for (const localeId of record.locale_ids ?? []) {
          if (!localeIds.has(localeId)) {
            issues.push(issue('unknown-locale', `featureCertifications.${record.feature_id}.locale_ids`, `Unknown locale id ${localeId}`));
          }
        }
      }
    }
    for (const step of record.state_history) {
      if (!VALID_STATES.includes(step.from) || !VALID_STATES.includes(step.to)) {
        issues.push(issue('invalid-state', `featureCertifications.${record.feature_id}.state_history`, 'Invalid transition state'));
      } else if (!TRANSITIONS[step.from].includes(step.to)) {
        issues.push(issue('illegal-transition', `featureCertifications.${record.feature_id}.state_history`, `${step.from} -> ${step.to} is illegal`));
      }
      if (!isNonEmptyString(step.actor)) {
        issues.push(issue('missing-field', `featureCertifications.${record.feature_id}.state_history.actor`, 'Transition actor is required'));
      }
    }
    const lastTransition = record.state_history.at(-1);
    if (!lastTransition || lastTransition.to !== record.state) {
      issues.push(issue('state-history-mismatch', `featureCertifications.${record.feature_id}.state_history`, 'Last transition must match current state'));
    }
  }

  for (const overridePolicy of pack.overridePolicies.overrides) {
    if (!gateIds.has(overridePolicy.gate_id)) {
      issues.push(issue('broken-gate-ref', `overridePolicies.${overridePolicy.gate_id}`, `Unknown gate id ${overridePolicy.gate_id}`));
    }
    for (const anomalyCode of overridePolicy.forbidden_anomalies) {
      if (!anomalyCodes.has(anomalyCode)) {
        issues.push(issue('unknown-anomaly-code', `overridePolicies.${overridePolicy.gate_id}.forbidden_anomalies`, `Unknown anomaly code ${anomalyCode}`));
      }
    }
    if (overridePolicy.ttl && !validateDuration(overridePolicy.ttl)) {
      issues.push(issue('invalid-ttl', `overridePolicies.${overridePolicy.gate_id}.ttl`, 'Invalid override TTL'));
    }
  }

  for (const locale of pack.localePolicies.locales) {
    if (seenLocaleIds.has(locale.locale_id)) {
      issues.push(issue('duplicate-locale', `localePolicies.${locale.locale_id}`, 'Duplicate locale id'));
    }
    seenLocaleIds.add(locale.locale_id);
    for (const blocker of locale.release_blockers) {
      if (!anomalyCodes.has(blocker)) {
        issues.push(issue('unknown-anomaly-code', `localePolicies.${locale.locale_id}.release_blockers`, `Unknown anomaly code ${blocker}`));
      }
    }
    for (const invariant of locale.global_invariants) {
      if (!anomalyCodes.has(invariant)) {
        issues.push(issue('unknown-anomaly-code', `localePolicies.${locale.locale_id}.global_invariants`, `Unknown anomaly code ${invariant}`));
      }
    }
    for (const evidenceType of locale.evidence_types) {
      if (!evidenceTypes.has(evidenceType)) {
        issues.push(issue('unknown-evidence-type', `localePolicies.${locale.locale_id}.evidence_types`, `Unknown evidence type ${evidenceType}`));
      }
    }
  }

  for (const releaseGate of pack.releaseGates.release_gates) {
    if (!gateIds.has(releaseGate.gate_id)) {
      issues.push(issue('broken-gate-ref', `releaseGates.${releaseGate.stage}`, `Unknown gate id ${releaseGate.gate_id}`));
    }
    for (const artifact of releaseGate.required_artifacts) {
      if (!artifact.endsWith('.json')) {
        issues.push(issue('invalid-artifact', `releaseGates.${releaseGate.stage}.required_artifacts`, `Artifact must be JSON: ${artifact}`));
      }
    }
  }

  return issues;
}
