import type { ActionKind, HarnessConfig, PersonaDefinition, ScenarioDefinition, SyntheticAction, SimulationObservation } from '../core/types.js';
import { createSeededRandom } from '../core/prng.js';

export interface ChaosResult {
  result: 'ok' | 'blocked' | 'failed' | 'noop';
  errorCode?: string;
  traceId: string;
  spanId: string;
  stateBefore: string;
  stateAfter: string;
  latencyMs: number;
  observations: SimulationObservation[];
}

export interface ChaosInput {
  action: SyntheticAction;
  scenario: ScenarioDefinition;
  persona: PersonaDefinition;
  config: HarnessConfig;
}

export interface FaultInjector {
  profile: 'none' | 'light' | 'standard' | 'heavy';
  inject(input: ChaosInput): Promise<ChaosResult>;
}

function createObservation(metric: string, value: number, severity: SimulationObservation['severity'], source: string): SimulationObservation {
  return { metric, value, severity, source, released: true };
}

function stateFor(kind: ActionKind | string): [string, string] {
  switch (kind) {
    case 'account.create':
      return ['anonymous', 'registered'];
    case 'account.login':
      return ['registered', 'authenticated'];
    case 'onboarding.complete':
      return ['authenticated', 'onboarded'];
    case 'discover.like':
    case 'discover.pass':
    case 'discover.load':
      return ['onboarded', 'discovering'];
    case 'match.create':
      return ['discovering', 'matched'];
    case 'message.send':
      return ['matched', 'messaging'];
    case 'message.reply':
      return ['messaging', 'conversing'];
    case 'trust.hold':
      return ['messaging', 'held'];
    case 'premium.buy':
      return ['authenticated', 'premium'];
    case 'irl.intent':
      return ['conversing', 'irl_intent'];
    case 'irl.plan':
      return ['irl_intent', 'irl_planned'];
    case 'irl.cancel':
      return ['irl_planned', 'cancelled'];
    default:
      return ['unknown', 'unknown'];
  }
}

function chooseProfile(config: HarnessConfig): FaultInjector['profile'] {
  if (config.mode === 'smoke') return 'none';
  if (config.mode === 'behavioral') return 'light';
  if (config.mode === 'load') return 'standard';
  if (config.mode === 'chaos') return 'heavy';
  return 'light';
}

export async function runChaosProfile(input: ChaosInput): Promise<ChaosResult> {
  const profile = chooseProfile(input.config);
  const random = createSeededRandom(input.config.seed + input.action.plannedAtMs);
  const [stateBefore, stateAfter] = stateFor(input.action.kind);
  const baseLatency = profile === 'none' ? 20 : profile === 'light' ? 45 : profile === 'standard' ? 120 : 260;
  const jitter = random.nextRange(0, Math.max(5, baseLatency / 3));
  const latencyMs = baseLatency + jitter;

  const observations: SimulationObservation[] = [];
  if (input.action.kind === 'discover.like') {
    observations.push(createObservation('swipe_to_match', 1, 'low', 'chaos'));
  }
  if (input.action.kind === 'match.create') {
    observations.push(createObservation('match_to_message', 1, 'low', 'chaos'));
  }
  if (input.action.kind === 'message.send' && profile !== 'none') {
    observations.push(createObservation('retry_rate', profile === 'heavy' ? 3 : 1, 'medium', 'chaos'));
  }
  if (input.action.kind === 'premium.buy' && profile !== 'none') {
    observations.push(createObservation('entitlement_drift', profile === 'heavy' ? 1 : 0, 'medium', 'chaos'));
  }
  if (input.action.kind === 'control_plane.action') {
    observations.push(createObservation('admin_audit', 1, 'low', 'chaos'));
  }

  return {
    result: profile === 'heavy' && ['trust.report', 'trust.block'].includes(input.action.kind) ? 'blocked' : 'ok',
    errorCode: undefined,
    traceId: `${input.scenario.id}:${input.action.actionId}:trace`,
    spanId: `${input.scenario.id}:${input.action.actionId}:span`,
    stateBefore,
    stateAfter,
    latencyMs,
    observations,
  };
}
