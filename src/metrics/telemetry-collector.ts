import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ActionKind, HarnessConfig, PersonaDefinition, RunContext, ScenarioDefinition, SimulationObservation, SyntheticAction } from '../core/types.js';

export interface TelemetryEnvelope {
  runId: string;
  scenarioId: string;
  personaId: string;
  syntheticUserId: string;
  actionId?: string;
  traceId: string;
  spanId: string;
  eventName: string;
  timestamp: string;
  stateBefore?: string;
  stateAfter?: string;
  result?: string;
  errorCode?: string;
  latencyMs?: number;
  buildId: string;
  fixtureHash: string;
  configVersion: string;
  clockMode: 'deterministic' | 'realtime';
  countryCode: string;
  city: string;
  localeTimeZone: string;
  payload: Record<string, unknown>;
}

export interface TelemetryCollector {
  captureAction(
    action: SyntheticAction,
    scenario: ScenarioDefinition,
    persona: PersonaDefinition,
    outcome: { traceId: string; spanId: string; latencyMs: number; stateBefore: string; stateAfter: string; result: string; errorCode?: string; },
  ): void;
  captureObservation(observation: SimulationObservation, scenario: ScenarioDefinition, persona: PersonaDefinition): void;
  flush(report: { jsonPath: string }): Promise<void>;
  getCounters(): Record<string, number>;
  getEnvelopes(): TelemetryEnvelope[];
}

function metricKey(action: ActionKind | string): string {
  return action.replace(/\./g, '_');
}

export function createTelemetryCollector(context: RunContext): TelemetryCollector {
  const envelopes: TelemetryEnvelope[] = [];
  const counters: Record<string, number> = {};
  const outputPath = join(context.outputDir, 'telemetry.ndjson');

  function bump(key: string, value = 1): void {
    counters[key] = (counters[key] ?? 0) + value;
  }

  return {
    captureAction(action, scenario, persona, outcome) {
      const envelope: TelemetryEnvelope = {
        runId: context.runId,
        scenarioId: scenario.id,
        personaId: persona.id,
        syntheticUserId: action.actorId,
        actionId: action.actionId,
        traceId: outcome.traceId,
        spanId: outcome.spanId,
        eventName: `war.${context.runId}.${scenario.id}.${action.kind}`,
        timestamp: new Date(action.executedAtMs ?? Date.now()).toISOString(),
        stateBefore: outcome.stateBefore,
        stateAfter: outcome.stateAfter,
        result: outcome.result,
        errorCode: outcome.errorCode,
        latencyMs: outcome.latencyMs,
        buildId: context.buildId,
        fixtureHash: context.fixtureHash,
        configVersion: context.configVersion,
        clockMode: context.clockMode,
        countryCode: scenario.locale?.country ?? 'ZZ',
        city: scenario.locale?.city ?? 'Synthetic City',
        localeTimeZone: scenario.locale?.timezone ?? 'UTC',
        payload: action.payload,
      };
      envelopes.push(envelope);
      bump(metricKey(action.kind));
      if (action.kind === 'onboarding.complete') {
        bump('onboarding_completion');
      }
      if (action.kind === 'discover.like' && action.targetId) {
        bump('swipe_to_match_candidate');
      }
      if (action.kind === 'match.create') {
        bump('swipe_to_match');
      }
      if (action.kind === 'message.send') {
        bump('match_to_message');
      }
      if (action.kind === 'message.reply') {
        bump('message_to_reply');
      }
      if (action.kind === 'irl.intent') {
        bump('reply_to_irl_intent');
      }
      if (action.kind === 'trust.report' || action.kind === 'trust.hold') {
        bump('trust_intervention_rate');
      }
      if (action.kind === 'premium.buy' || action.kind === 'control_plane.action') {
        bump('premium_branch');
      }
    },
    captureObservation(observation) {
      bump(observation.metric, observation.value);
      if (observation.metric === 'paywall_mistiming') {
        bump('paywall_mistiming');
      }
      if (observation.metric === 'entitlement_drift') {
        bump('entitlement_drift');
      }
      if (observation.metric === 'localization_drift') {
        bump('localization_drift');
      }
      if (observation.metric === 'marketplace_concentration') {
        bump('marketplace_concentration');
      }
      if (observation.metric === 'orchestration_conflict') {
        bump('orchestration_conflict');
      }
    },
    async flush(report) {
      await mkdir(dirname(outputPath), { recursive: true });
      const lines = envelopes.map((item) => JSON.stringify(item)).join('\n');
      await writeFile(outputPath, `${lines}${lines.length > 0 ? '\n' : ''}`, 'utf8');
    },
    getCounters() {
      return { ...counters };
    },
    getEnvelopes() {
      return [...envelopes];
    },
  };
}
