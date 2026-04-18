import type { AnomalyRecord, InvariantResult, ReleaseVerdict } from '../core/types.js';

export interface ReleaseGateInput {
  invariants: InvariantResult[];
  anomalies: AnomalyRecord[];
}

export function evaluateReleaseVerdict(input: ReleaseGateInput): ReleaseVerdict {
  const blockingReasons: string[] = [];
  const advisoryReasons: string[] = [];

  for (const invariant of input.invariants) {
    if (invariant.autoFail && !invariant.passed) {
      blockingReasons.push(`Invariant failed: ${invariant.invariantId}`);
    }
  }

  for (const anomaly of input.anomalies) {
    if (anomaly.releaseBlocking) {
      blockingReasons.push(`Anomaly: ${anomaly.anomalyId}`);
    } else {
      advisoryReasons.push(`Anomaly: ${anomaly.anomalyId}`);
    }
  }

  return {
    allowed: blockingReasons.length === 0,
    blockingReasons,
    advisoryReasons,
  };
}
