import type {
  CertificationState,
  FeatureCertificationRecord,
  FeatureCertificationTransitionRecord,
} from './types.js';

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

export interface TransitionInput {
  to: CertificationState;
  actor: string;
  reason: string;
  at?: string;
  evidenceRefs?: string[];
  localeId?: string;
}

export function canTransition(from: CertificationState, to: CertificationState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionFeatureCertification(
  record: FeatureCertificationRecord,
  input: TransitionInput,
): { record: FeatureCertificationRecord; transition: FeatureCertificationTransitionRecord } {
  if (!canTransition(record.state, input.to)) {
    throw new Error(`Illegal certification transition: ${record.state} -> ${input.to}`);
  }

  const at = input.at ?? new Date().toISOString();
  const next: FeatureCertificationRecord = {
    ...record,
    state: input.to,
    last_certified_at: input.to === 'decertified' ? record.last_certified_at : at,
    state_history: [
      ...record.state_history,
      {
        from: record.state,
        to: input.to,
        at,
        actor: input.actor,
        reason: input.reason,
        evidence_refs: input.evidenceRefs,
      },
    ],
  };

  if (input.to === 'decertified') {
    next.decertified_at = at;
    next.decertification_reason = input.reason;
    next.decertification_trigger = input.evidenceRefs?.join(',') ?? input.reason;
  }

  if (input.localeId) {
    next.locale_ids = Array.from(new Set([...(next.locale_ids ?? []), input.localeId]));
  }

  return {
    record: next,
    transition: {
      from: record.state,
      to: input.to,
      at,
      actor: input.actor,
      reason: input.reason,
      evidence_refs: input.evidenceRefs,
    },
  };
}

