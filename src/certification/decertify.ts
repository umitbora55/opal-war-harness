import { transitionFeatureCertification } from './state-machine.js';
import type {
  CertificationPack,
  DecertificationEventRecord,
  DecertificationTriggerInput,
  FeatureCertificationRecord,
} from './types.js';

export interface DecertificationResult {
  updatedRecord: FeatureCertificationRecord;
  event: DecertificationEventRecord;
  releaseImpact: 'block' | 'locale-block' | 'audit-required';
}

export function decertifyFeature(
  pack: CertificationPack,
  input: DecertificationTriggerInput,
  existing?: FeatureCertificationRecord,
): DecertificationResult {
  const record = existing ?? pack.featureCertifications.features.find((item) => item.feature_id === input.featureId);
  if (!record) {
    throw new Error(`Unknown feature for decertification: ${input.featureId}`);
  }

  const { record: updatedRecord } = transitionFeatureCertification(record, {
    to: 'decertified',
    actor: 'certification-engine',
    reason: input.reason,
    evidenceRefs: input.anomalyCodes,
    localeId: input.localeId,
    at: new Date().toISOString(),
  });

  const event: DecertificationEventRecord = {
    event_id: `${input.featureId}:${Date.now()}:decertified`,
    feature_id: input.featureId,
    trigger: input.trigger,
    anomaly_codes: input.anomalyCodes,
    from_state: record.state,
    to_state: 'decertified',
    reason: input.reason,
    created_at: new Date().toISOString(),
    locale_id: input.localeId,
    replay_bundle_path: input.replayBundlePath,
  };

  const releaseImpact: DecertificationResult['releaseImpact'] =
    input.trigger === 'locale drift' ? 'locale-block' : input.trigger === 'control-plane action without audit' ? 'audit-required' : 'block';

  return {
    updatedRecord,
    event,
    releaseImpact,
  };
}

