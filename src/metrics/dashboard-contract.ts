import type { Severity } from '../core/types.js';

export interface DashboardPanelContract {
  id: string;
  title: string;
  metrics: string[];
  severity: Severity;
}

export interface AlertContract {
  id: string;
  title: string;
  metric: string;
  threshold: number;
  severity: Severity;
  blocking: boolean;
}

export const dashboardPanels: DashboardPanelContract[] = [
  { id: 'onboarding', title: 'Onboarding Health', metrics: ['onboarding_completion', 'profile_completion'], severity: 'high' },
  { id: 'marketplace', title: 'Marketplace Balance', metrics: ['swipe_to_match', 'marketplace_concentration', 'underexposure_rate'], severity: 'critical' },
  { id: 'trust', title: 'Trust and Safety', metrics: ['trust_intervention_rate', 'trust_false_progression'], severity: 'critical' },
  { id: 'messaging', title: 'Messaging Reliability', metrics: ['message_to_reply', 'retry_rate', 'duplicate_state_rate'], severity: 'high' },
  { id: 'premium', title: 'Premium Integrity', metrics: ['paywall_mistiming', 'entitlement_drift', 'premium_fairness_delta'], severity: 'high' },
  { id: 'irl', title: 'IRL Conversion', metrics: ['reply_to_irl_intent', 'plan_abandon_rate'], severity: 'high' },
  { id: 'orchestration', title: 'Orchestration', metrics: ['orchestration_conflict_rate', 'suppression_correctness'], severity: 'critical' },
];

export const alertContracts: AlertContract[] = [
  { id: 'alert-trust-false-progression', title: 'Trust False Progression', metric: 'trust_false_progression', threshold: 0, severity: 'critical', blocking: true },
  { id: 'alert-duplicate-state', title: 'Duplicate State', metric: 'duplicate_state_rate', threshold: 0, severity: 'critical', blocking: true },
  { id: 'alert-paywall-mistiming', title: 'Paywall Mistiming', metric: 'paywall_mistiming', threshold: 1, severity: 'high', blocking: true },
  { id: 'alert-concentration', title: 'Marketplace Concentration', metric: 'marketplace_concentration', threshold: 3, severity: 'high', blocking: true },
  { id: 'alert-orchestration-conflict', title: 'Orchestration Conflict', metric: 'orchestration_conflict_rate', threshold: 0, severity: 'critical', blocking: true },
];
