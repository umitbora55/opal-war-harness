import type {
  AnomalyRecord,
  HarnessConfig,
  InvariantResult,
  RunContext,
  SyntheticAction,
  SimulationObservation,
} from '../core/types.js';

export interface AnomalyEvaluationInput {
  run: RunContext;
  config: HarnessConfig;
  actions: SyntheticAction[];
  observations: SimulationObservation[];
  invariants: InvariantResult[];
}

function buildRecord(
  anomalyId: string,
  severity: AnomalyRecord['severity'],
  message: string,
  evidence: string[],
  confidence: number,
  releaseBlocking: boolean,
): AnomalyRecord {
  return {
    anomalyId,
    severity,
    message,
    evidence,
    confidence,
    releaseBlocking,
  };
}

function groupByScenario(actions: SyntheticAction[]): Map<string, SyntheticAction[]> {
  const groups = new Map<string, SyntheticAction[]>();
  for (const action of actions) {
    const scenarioId = String(action.payload?.scenarioId ?? 'global');
    const group = groups.get(scenarioId) ?? [];
    group.push(action);
    groups.set(scenarioId, group);
  }
  return groups;
}

function has(actions: SyntheticAction[], kind: string): boolean {
  return actions.some((action) => action.kind === kind);
}

function count(actions: SyntheticAction[], kind: string): number {
  return actions.filter((action) => action.kind === kind).length;
}

function ids(actions: SyntheticAction[], kinds: string[]): string[] {
  return actions.filter((action) => kinds.includes(action.kind)).map((action) => action.actionId);
}

export function detectAnomalies(input: AnomalyEvaluationInput): AnomalyRecord[] {
  const records: AnomalyRecord[] = [];
  const groupedActions = groupByScenario(input.actions);

  for (const [scenarioId, actions] of groupedActions.entries()) {
    if (has(actions, 'profile.update') && !has(actions, 'account.login')) {
      records.push(
        buildRecord(
          'ANOM-STATE-001',
          'critical',
          'Impossible state transition or sessionless profile mutation detected.',
          ids(actions, ['profile.update']),
          0.84,
          true,
        ),
      );
    }

    if (has(actions, 'account.create') && !has(actions, 'account.login') && has(actions, 'profile.update')) {
      records.push(
        buildRecord(
          'ANOM-AUTH-001',
          'critical',
          'Invalid auth mutation or sessionless write observed.',
          ids(actions, ['account.create', 'profile.update']),
          0.91,
          true,
        ),
      );
    }

    if (has(actions, 'verification.start') && has(actions, 'verification.pass') && has(actions, 'verification.fail')) {
      records.push(
        buildRecord(
          'ANOM-MOD-001',
          'high',
          'Verification state progressed through conflicting outcomes.',
          ids(actions, ['verification.start', 'verification.pass', 'verification.fail']),
          0.77,
          true,
        ),
      );
    }

    if (
      scenarioId === 'MARKET-DISTORT-001' &&
      has(actions, 'discover.like') &&
      has(actions, 'discover.pass') &&
      has(actions, 'match.create')
    ) {
      records.push(
        buildRecord(
          'ANOM-SWIPE-001',
          'high',
          'Eligibility and candidate selection may have drifted.',
          ids(actions, ['discover.like', 'discover.pass', 'match.create']),
          0.7,
          true,
        ),
      );
    }

    if (count(actions, 'discover.like') > 3 && !has(actions, 'match.create')) {
      records.push(
        buildRecord(
          'ANOM-SWIPE-002',
          'medium',
          'One-sided match pressure or over-liking suspected.',
          ids(actions, ['discover.like']),
          0.63,
          false,
        ),
      );
    }

    if (count(actions, 'match.create') > 1) {
      records.push(
        buildRecord(
          'ANOM-MATCH-001',
          'critical',
          'Duplicate match generation detected.',
          ids(actions, ['match.create']),
          0.99,
          true,
        ),
      );
    }

    if (has(actions, 'match.create') && !(has(actions, 'message.send') || has(actions, 'message.reply'))) {
      records.push(
        buildRecord(
          'ANOM-MATCH-002',
          'medium',
          'One-sided match without downstream communication.',
          ids(actions, ['match.create']),
          0.57,
          false,
        ),
      );
    }

    if (has(actions, 'message.send') && !has(actions, 'message.reply')) {
      records.push(
        buildRecord(
          'ANOM-MSG-001',
          'high',
          'Message sent without stable delivery/read progression.',
          ids(actions, ['message.send']),
          0.82,
          true,
        ),
      );
    }

    if (has(actions, 'message.reply') && !has(actions, 'message.send')) {
      records.push(
        buildRecord(
          'ANOM-MSG-003',
          'high',
          'Read-before-delivered or reply-before-send sequence detected.',
          ids(actions, ['message.reply']),
          0.81,
          true,
        ),
      );
    }

    if (has(actions, 'message.reply') && !has(actions, 'message.send')) {
      records.push(
        buildRecord(
          'ANOM-MSG-002',
          'medium',
          'Read-before-delivered style ordering drift suspected.',
          ids(actions, ['message.reply']),
          0.55,
          false,
        ),
      );
    }

    if (has(actions, 'orchestration.decide') && input.invariants.some((item) => item.invariantId === 'INV-ORCH-001' && !item.passed)) {
      records.push(
        buildRecord(
          'ANOM-ORCH-001',
          'critical',
          'Stale orchestration memory or exclusivity failure.',
          ids(actions, ['orchestration.decide']),
          0.9,
          true,
        ),
      );
    }

    if (count(actions, 'orchestration.decide') > 1) {
      records.push(
        buildRecord(
          'ANOM-CD-001',
          'high',
          'Cooldown bypass suspected for orchestration decisions.',
          ids(actions, ['orchestration.decide']),
          0.72,
          true,
        ),
      );
      records.push(
        buildRecord(
          'ANOM-SUP-001',
          'high',
          'Suppression miss detected; multiple primary actions exist.',
          ids(actions, ['orchestration.decide']),
          0.73,
          true,
        ),
      );
      records.push(
        buildRecord(
          'ANOM-ORCH-002',
          'high',
          'Contradictory interventions in one window.',
          ids(actions, ['orchestration.decide']),
          0.8,
          true,
        ),
      );
    }

    if (has(actions, 'trust.hold') && has(actions, 'irl.intent')) {
      records.push(
        buildRecord(
          'ANOM-TRUST-001',
          'critical',
          'Trust hold and IRL suggestion coexist in same scenario.',
          ids(actions, ['trust.hold', 'irl.intent', 'irl.plan']),
          0.98,
          true,
        ),
      );
    }

    if (has(actions, 'trust.hold') && has(actions, 'premium.buy')) {
      records.push(
        buildRecord(
          'ANOM-TRUST-002',
          'critical',
          'Trust hold and premium exposure coexist in same scenario.',
          ids(actions, ['trust.hold', 'premium.buy']),
          0.96,
          true,
        ),
      );
    }

    if (has(actions, 'premium.buy') && !has(actions, 'discover.load')) {
      records.push(
        buildRecord(
          'ANOM-PREM-001',
          'high',
          'Entitlement is present but no visible premium effect path exists.',
          ids(actions, ['premium.buy']),
          0.76,
          true,
        ),
      );
    }

    if (has(actions, 'premium.buy') && has(actions, 'discover.load') && !has(actions, 'premium.expire')) {
      records.push(
        buildRecord(
          'ANOM-PREM-003',
          'medium',
          'Effect appears present while entitlement signal is unclear after purchase.',
          ids(actions, ['premium.buy', 'discover.load']),
          0.58,
          false,
        ),
      );
    }

    if (has(actions, 'premium.expire') && has(actions, 'discover.load')) {
      records.push(
        buildRecord(
          'ANOM-PREM-002',
          'medium',
          'Premium effect may persist after expiry.',
          ids(actions, ['premium.expire', 'discover.load']),
          0.61,
          false,
        ),
      );
    }

    if (
      scenarioId === 'LOCALIZATION-001' &&
      input.config.localeDefaults.country === 'TR' &&
      has(actions, 'irl.intent') &&
      has(actions, 'irl.plan') &&
      !has(actions, 'notification.open')
    ) {
      records.push(
        buildRecord(
          'ANOM-LOC-001',
          'high',
          `Country policy and pacing behavior are mismatched in scenario ${scenarioId}.`,
          ids(actions, ['irl.intent', 'irl.plan']),
          0.66,
          true,
        ),
      );
    }

    if (has(actions, 'control_plane.action') && !has(actions, 'account.login')) {
      records.push(
        buildRecord(
          'ANOM-ADM-001',
          'critical',
          'Admin/control-plane mutation is not clearly auditable.',
          ids(actions, ['control_plane.action']),
          0.87,
          true,
        ),
      );
    }

    if (has(actions, 'notification.open') && !has(actions, 'message.send')) {
      records.push(
        buildRecord(
          'ANOM-NOTIF-001',
          'medium',
          'Notification/read state coherence is ambiguous.',
          ids(actions, ['notification.open']),
          0.58,
          false,
        ),
      );
    }

    if (actions.some((action) => action.executedAtMs !== undefined && action.executedAtMs < action.plannedAtMs)) {
      records.push(
        buildRecord(
          'ANOM-EVT-001',
          'critical',
          'Event ordering or idempotency drift detected.',
          actions.map((action) => action.actionId),
          0.93,
          true,
        ),
      );
    }

    if (input.observations.some((observation) => observation.metric === 'retry_rate' && observation.value >= 3) ||
        input.observations.some((observation) => observation.metric === 'dlq_growth' && observation.value > 0)) {
      records.push(
        buildRecord(
          'ANOM-QUEUE-001',
          'high',
          'Retry storm or dead-letter growth suspected.',
          actions.filter((action) => action.kind === 'message.send').map((action) => action.actionId),
          0.79,
          true,
        ),
      );
    }
  }

  if (input.observations.some((observation) => observation.metric === 'marketplace_concentration' && observation.value > 3)) {
    records.push(
      buildRecord(
        'ANOM-FAIR-001',
        'high',
        'Exposure fairness breach or concentration spike detected.',
        input.actions.map((action) => action.actionId),
        0.86,
        true,
      ),
    );
  }

  return records;
}
