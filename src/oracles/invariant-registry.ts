import type { Severity } from '../core/types.js';

export interface InvariantDefinition {
  id: string;
  group: string;
  description: string;
  severity: Severity;
  autoFail: boolean;
}

export function loadInvariantRegistry(): InvariantDefinition[] {
  return [
    { id: 'INV-AUTH-001', group: 'auth/session', description: 'Writes require valid auth/session.', severity: 'critical', autoFail: true },
    { id: 'INV-ONB-001', group: 'onboarding', description: 'Onboarding progression is monotonic.', severity: 'high', autoFail: true },
    { id: 'INV-PROF-001', group: 'profile', description: 'Profile completeness is recomputed on change.', severity: 'high', autoFail: true },
    { id: 'INV-MOD-001', group: 'moderation/verification', description: 'Verification holds block risky progression.', severity: 'critical', autoFail: true },
    { id: 'INV-SWIPE-001', group: 'swipe/eligibility', description: 'Swipes only target eligible candidates.', severity: 'high', autoFail: true },
    { id: 'INV-MATCH-001', group: 'match', description: 'Matches are unique and mutual.', severity: 'critical', autoFail: true },
    { id: 'INV-MSG-001', group: 'messaging', description: 'Message state ordering is valid.', severity: 'high', autoFail: true },
    { id: 'INV-T&S-001', group: 'trust/safety', description: 'Trust holds outrank non-safety actions.', severity: 'critical', autoFail: true },
    { id: 'INV-ORCH-001', group: 'orchestration', description: 'Only one primary intervention wins a window.', severity: 'high', autoFail: true },
    { id: 'INV-IRL-001', group: 'irl', description: 'IRL progression requires mutual safety and readiness.', severity: 'critical', autoFail: true },
    { id: 'INV-PREM-001', group: 'premium', description: 'Premium effects must match entitlements.', severity: 'high', autoFail: true },
    { id: 'INV-LOC-001', group: 'localization', description: 'Locale behavior matches country policy.', severity: 'high', autoFail: true },
    { id: 'INV-ADM-001', group: 'admin/control-plane', description: 'Admin side effects are auditable.', severity: 'critical', autoFail: true },
    { id: 'INV-NOTIF-001', group: 'notification/realtime', description: 'Read/deliver state is coherent.', severity: 'medium', autoFail: false },
    { id: 'INV-EVT-001', group: 'event-ordering/idempotency', description: 'Event ordering remains valid and idempotent.', severity: 'critical', autoFail: true },
  ];
}
