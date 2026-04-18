import type { AnomalySeverityRecord, FeatureRegistryRecord, WarHarnessReplayBundleArtifact } from './types.js';
import type { Severity } from '../core/types.js';

export interface AnomalyAssessment {
  all: Array<{
    anomalyId: string;
    severity: Severity;
    releaseBlocking: boolean;
    replayRequired: boolean;
    decertificationTrigger: boolean;
    ownerDomain: string;
    message: string;
  }>;
  blocking: string[];
  advisory: string[];
  unknown: string[];
  decertificationTriggers: string[];
}

export function evaluateAnomalies(
  anomalies: WarHarnessReplayBundleArtifact['anomalies'],
  registry: AnomalySeverityRecord[],
  gateBlockerSeverities: Severity[],
  feature?: FeatureRegistryRecord,
): AnomalyAssessment {
  const byCode = new Map(registry.map((item) => [item.anomaly_code, item]));
  const all: AnomalyAssessment['all'] = [];
  const blocking = new Set<string>();
  const advisory = new Set<string>();
  const unknown = new Set<string>();
  const decertificationTriggers = new Set<string>();

  for (const anomaly of anomalies) {
    const policy = byCode.get(anomaly.anomalyId);
    if (!policy) {
      unknown.add(anomaly.anomalyId);
      blocking.add(anomaly.anomalyId);
      all.push({
        anomalyId: anomaly.anomalyId,
        severity: anomaly.severity,
        releaseBlocking: true,
        replayRequired: true,
        decertificationTrigger: true,
        ownerDomain: 'unknown',
        message: anomaly.message,
      });
      continue;
    }

    const isBlocking = gateBlockerSeverities.includes(policy.severity) || policy.release_effect !== 'advisory' || anomaly.releaseBlocking;
    if (isBlocking) {
      blocking.add(anomaly.anomalyId);
    } else {
      advisory.add(anomaly.anomalyId);
    }
    if (policy.decertification_trigger) {
      decertificationTriggers.add(anomaly.anomalyId);
    }
    all.push({
      anomalyId: anomaly.anomalyId,
      severity: policy.severity,
      releaseBlocking: isBlocking,
      replayRequired: policy.replay_required,
      decertificationTrigger: policy.decertification_trigger,
      ownerDomain: policy.owner_domain,
      message: anomaly.message,
    });
  }

  if (feature) {
    for (const code of feature.blocker_anomalies) {
      const policy = byCode.get(code);
      if (!policy) {
        unknown.add(code);
      }
    }
  }

  return {
    all,
    blocking: [...blocking],
    advisory: [...advisory],
    unknown: [...unknown],
    decertificationTriggers: [...decertificationTriggers],
  };
}
