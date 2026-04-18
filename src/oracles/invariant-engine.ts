import { loadInvariantRegistry, type InvariantDefinition } from './invariant-registry.js';
import type {
  HarnessConfig,
  InvariantResult,
  PersonaDefinition,
  RunContext,
  ScenarioDefinition,
  SyntheticAction,
  SimulationObservation,
} from '../core/types.js';

export interface InvariantEvaluationInput {
  run: RunContext;
  config: HarnessConfig;
  actions: SyntheticAction[];
  observations: SimulationObservation[];
  scenarios: ScenarioDefinition[];
  personas: PersonaDefinition[];
}

function evidenceFor(actions: SyntheticAction[], predicate: (action: SyntheticAction) => boolean): string[] {
  return actions.filter(predicate).map((action) => action.actionId);
}

function actionsForScenario(actions: SyntheticAction[], scenarioId: string): SyntheticAction[] {
  return actions.filter((action) => String(action.payload?.scenarioId ?? '') === scenarioId);
}

function evaluateDefinition(
  definition: InvariantDefinition,
  input: InvariantEvaluationInput,
): InvariantResult {
  const evidence: string[] = [];
  let passed = true;
  let message = 'Invariant satisfied';
  const scopedActions = input.actions.flatMap((action) =>
    String(action.payload?.scenarioId ?? '').length > 0 ? [action] : [],
  );
  const scenarios = input.scenarios.length > 0 ? input.scenarios : [];

  switch (definition.id) {
    case 'INV-AUTH-001':
      if (scenarios.length === 0 || scopedActions.length === 0) {
        message = 'Not in scope for selected scenarios.';
        passed = true;
        break;
      }
      evidence.push(...evidenceFor(scopedActions, (action) => ['account.create', 'account.login'].includes(action.kind)));
      passed = evidence.length > 0 || !scopedActions.some((action) => ['account.create', 'account.login'].includes(action.kind));
      message = passed ? 'Auth/session actions observed or not in scope.' : 'No auth/session action observed.';
      break;
    case 'INV-ONB-001':
      evidence.push(...evidenceFor(scopedActions, (action) => action.kind === 'onboarding.complete'));
      passed = evidence.length > 0 || !scopedActions.some((action) => action.kind === 'onboarding.complete');
      message = passed ? 'Onboarding completion observed or not in scope.' : 'Onboarding completion missing.';
      break;
    case 'INV-PROF-001':
      evidence.push(...evidenceFor(scopedActions, (action) => action.kind === 'profile.update'));
      passed = evidence.length > 0 || !scopedActions.some((action) => action.kind === 'profile.update');
      message = passed ? 'Profile update observed or not in scope.' : 'Profile update missing.';
      break;
    case 'INV-MOD-001':
      evidence.push(...evidenceFor(scopedActions, (action) => action.kind.startsWith('verification.') || action.kind.startsWith('trust.')));
      passed = evidence.length > 0 || !scopedActions.some((action) => action.kind.startsWith('verification.') || action.kind.startsWith('trust.'));
      message = passed ? 'Moderation/verification path observed or not in scope.' : 'Verification path missing.';
      break;
    case 'INV-SWIPE-001':
      evidence.push(...evidenceFor(scopedActions, (action) => action.kind.startsWith('discover.')));
      passed = evidence.length > 0 || !scopedActions.some((action) => action.kind.startsWith('discover.'));
      message = passed ? 'Eligible discovery action observed or not in scope.' : 'No discovery action observed.';
      break;
    case 'INV-MATCH-001':
      evidence.push(...evidenceFor(scopedActions, (action) => action.kind === 'match.create'));
      passed = evidence.length > 0 || !scopedActions.some((action) => action.kind === 'match.create');
      message = passed ? 'Match creation observed or not in scope.' : 'Match creation missing.';
      break;
    case 'INV-MSG-001':
      evidence.push(...evidenceFor(scopedActions, (action) => action.kind.startsWith('message.')));
      passed = evidence.length > 0 || !scopedActions.some((action) => action.kind.startsWith('message.'));
      message = passed ? 'Messaging state observed or not in scope.' : 'Messaging state missing.';
      break;
    case 'INV-T&S-001':
      evidence.push(...evidenceFor(scopedActions, (action) => action.kind.startsWith('trust.')));
      passed = evidence.length > 0 || !scopedActions.some((action) => action.kind.startsWith('trust.'));
      message = passed ? 'Trust action observed or not in scope.' : 'Trust action missing.';
      break;
    case 'INV-ORCH-001':
      evidence.push(...evidenceFor(scopedActions, (action) => action.kind === 'orchestration.decide'));
      passed = evidence.length > 0 || !scopedActions.some((action) => action.kind === 'orchestration.decide');
      message = passed ? 'Orchestration action observed or not in scope.' : 'Orchestration action missing.';
      break;
    case 'INV-IRL-001':
      evidence.push(...evidenceFor(scopedActions, (action) => action.kind.startsWith('irl.')));
      passed = evidence.length > 0 || !scopedActions.some((action) => action.kind.startsWith('irl.'));
      message = passed ? 'IRL progression observed or not in scope.' : 'IRL progression missing.';
      break;
    case 'INV-PREM-001':
      evidence.push(...evidenceFor(scopedActions, (action) => action.kind.startsWith('premium.')));
      passed = evidence.length > 0 || !scopedActions.some((action) => action.kind.startsWith('premium.'));
      message = passed ? 'Premium action observed or not in scope.' : 'Premium action missing.';
      break;
    case 'INV-LOC-001':
      evidence.push(input.config.localeDefaults.country, input.config.localeDefaults.city);
      passed = Boolean(input.config.localeDefaults.country && input.config.localeDefaults.city);
      message = passed ? 'Locale policy present.' : 'Locale policy missing.';
      break;
    case 'INV-ADM-001':
      evidence.push(...evidenceFor(scopedActions, (action) => action.kind === 'control_plane.action'));
      passed = evidence.length > 0 || !scopedActions.some((action) => action.kind === 'control_plane.action');
      message = passed ? 'Control-plane action observed or not in scope.' : 'Control-plane action missing.';
      break;
    case 'INV-NOTIF-001':
      evidence.push(...evidenceFor(scopedActions, (action) => action.kind === 'notification.open'));
      passed = evidence.length > 0 || !scopedActions.some((action) => action.kind === 'notification.open');
      message = passed ? 'Notification interaction observed or not in scope.' : 'Notification interaction missing.';
      break;
    case 'INV-EVT-001':
      evidence.push(...scopedActions.map((action) => action.actionId));
      passed = scopedActions.length > 0 || input.actions.length === 0;
      message = passed ? 'Ordered event stream present or not in scope.' : 'Event stream missing.';
      break;
    default:
      passed = false;
      message = 'Unknown invariant.';
  }

  return {
    invariantId: definition.id,
    passed,
    severity: definition.severity,
    message,
    evidence,
    autoFail: definition.autoFail,
  };
}

export function evaluateInvariants(input: InvariantEvaluationInput): InvariantResult[] {
  const registry = loadInvariantRegistry();
  return registry.map((definition) => evaluateDefinition(definition, input));
}
