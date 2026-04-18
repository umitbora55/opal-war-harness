import type { Pool } from 'pg';
import { stableHash } from '../core/hash.js';
import type {
  AnomalyRecord,
  HarnessConfig,
  InvariantResult,
  RunContext,
  SimulationObservation,
  SyntheticAction,
  SyntheticUserProfile,
} from '../core/types.js';

export interface RunStore {
  persistRun(args: {
    context: RunContext;
    config: HarnessConfig;
    syntheticUsers: SyntheticUserProfile[];
    actions: SyntheticAction[];
    observations: SimulationObservation[];
    invariants: InvariantResult[];
    anomalies: AnomalyRecord[];
    report: { jsonPath: string; mdPath: string; verdict: unknown; reportHash: string };
    replayBundlePath: string;
  }): Promise<void>;
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

export function createRunStore(pool: Pool): RunStore {
  return {
    async persistRun(args) {
      await pool.query('BEGIN');
      try {
        await pool.query(
          `
            INSERT INTO simulation_run (
              id, run_name, mode, environment, seed, build_id, fixture_hash,
              config_version, clock_mode, started_at, output_dir
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (id) DO NOTHING
          `,
          [
            args.context.runId,
            args.context.runName,
            args.context.mode,
            args.context.environment,
            args.context.seed,
            args.context.buildId,
            args.context.fixtureHash,
            args.context.configVersion,
            args.context.clockMode,
            args.context.startedAt,
            args.context.outputDir,
          ],
        );

        await pool.query(
          `
            INSERT INTO simulation_run_seed (
              run_id, scenario_seed, persona_seed, scheduler_seed, fixture_version, config_version
            ) VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (run_id) DO NOTHING
          `,
          [
            args.context.runId,
            args.config.seed,
            args.config.seed,
            args.config.seed,
            args.context.fixtureHash.slice(0, 12),
            args.context.configVersion,
          ],
        );

        for (const user of args.syntheticUsers) {
          await pool.query(
            `
              INSERT INTO synthetic_user (
                id, run_id, persona_id, country, city, locale_timezone
              ) VALUES ($1,$2,$3,$4,$5,$6)
              ON CONFLICT (id) DO NOTHING
            `,
            [user.syntheticUserId, args.context.runId, user.personaId, user.country, user.city, user.timezone],
          );
          await pool.query(
            `
              INSERT INTO synthetic_session (
                id, run_id, synthetic_user_id, state, state_version, last_action_at
              ) VALUES ($1,$2,$3,$4,$5,$6)
              ON CONFLICT (id) DO NOTHING
            `,
            [
              `${args.context.runId}:${user.syntheticUserId}:session`,
              args.context.runId,
              user.syntheticUserId,
              'initialized',
              1,
              args.context.startedAt,
            ],
          );
        }

        for (const action of args.actions) {
          await pool.query(
            `
              INSERT INTO simulation_action (
                id, run_id, scenario_id, persona_id, synthetic_user_id,
                kind, actor_id, target_id, payload_json, planned_at_ms,
                executed_at_ms, result, error_code, trace_id, span_id
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
              ON CONFLICT (id) DO NOTHING
            `,
            [
              action.actionId,
              args.context.runId,
              String(action.payload.scenarioId ?? 'unknown'),
              String(action.payload.personaId ?? 'unknown'),
              action.actorId,
              action.kind,
              action.actorId,
              action.targetId ?? null,
              toJson(action.payload),
              action.plannedAtMs,
              action.executedAtMs ?? null,
              action.result ?? 'noop',
              action.errorCode ?? null,
              `${action.actionId}:trace`,
              `${action.actionId}:span`,
            ],
          );

          await pool.query(
            `
              INSERT INTO simulation_event (
                id, run_id, scenario_id, persona_id, action_id, event_name,
                trace_id, span_id, state_before, state_after, payload_json
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
              ON CONFLICT (id) DO NOTHING
            `,
            [
              `${action.actionId}:event`,
              args.context.runId,
              String(action.payload.scenarioId ?? 'unknown'),
              String(action.payload.personaId ?? 'unknown'),
              action.actionId,
              `war.${args.context.runId}.${String(action.payload.scenarioId ?? 'unknown')}.${action.kind}`,
              `${action.actionId}:trace`,
              `${action.actionId}:span`,
              null,
              null,
              toJson(action.payload),
            ],
          );
        }

        for (const observation of args.observations) {
          await pool.query(
            `
              INSERT INTO simulation_observation (
                id, run_id, metric, value, threshold, severity, source, released
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
              ON CONFLICT (id) DO NOTHING
            `,
            [
              `${args.context.runId}:${observation.metric}:${stableHash(observation.value).slice(0, 8)}`,
              args.context.runId,
              observation.metric,
              observation.value,
              observation.threshold ?? null,
              observation.severity,
              observation.source,
              observation.released ? 1 : 0,
            ],
          );
        }

        for (const invariant of args.invariants) {
          await pool.query(
            `
              INSERT INTO simulation_invariant_violation (
                id, run_id, invariant_id, severity, passed, message, evidence_json, auto_fail
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
              ON CONFLICT (id) DO NOTHING
            `,
            [
              `${args.context.runId}:${invariant.invariantId}`,
              args.context.runId,
              invariant.invariantId,
              invariant.severity,
              invariant.passed ? 1 : 0,
              invariant.message,
              toJson(invariant.evidence),
              invariant.autoFail ? 1 : 0,
            ],
          );
        }

        for (const anomaly of args.anomalies) {
          await pool.query(
            `
              INSERT INTO simulation_anomaly (
                id, run_id, anomaly_id, confidence, severity, message, evidence_json, release_blocking
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
              ON CONFLICT (id) DO NOTHING
            `,
            [
              `${args.context.runId}:${anomaly.anomalyId}`,
              args.context.runId,
              anomaly.anomalyId,
              anomaly.confidence,
              anomaly.severity,
              anomaly.message,
              toJson(anomaly.evidence),
              anomaly.releaseBlocking ? 1 : 0,
            ],
          );
        }

        await pool.query(
          `
            INSERT INTO simulation_report (
              id, run_id, report_hash, json_path, md_path, verdict_json
            ) VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (id) DO NOTHING
          `,
          [
            `${args.context.runId}:report`,
            args.context.runId,
            args.report.reportHash,
            args.report.jsonPath,
            args.report.mdPath,
            toJson(args.report.verdict),
          ],
        );

        await pool.query(
          `
            INSERT INTO replay_bundle (
              id, run_id, bundle_hash, report_hash, file_path
            ) VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (id) DO NOTHING
          `,
          [
            `${args.context.runId}:replay`,
            args.context.runId,
            stableHash(args.replayBundlePath),
            args.report.reportHash,
            args.replayBundlePath,
          ],
        );

        await pool.query(
          `
            INSERT INTO certification_decision (
              id, run_id, allowed, blocking_reasons_json, advisory_reasons_json
            ) VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (id) DO NOTHING
          `,
          [
            `${args.context.runId}:certification`,
            args.context.runId,
            args.report.verdict && typeof args.report.verdict === 'object' && 'allowed' in args.report.verdict && Boolean((args.report.verdict as { allowed: boolean }).allowed)
              ? 1
              : 0,
            toJson((args.report.verdict as { blockingReasons?: string[] }).blockingReasons ?? []),
            toJson((args.report.verdict as { advisoryReasons?: string[] }).advisoryReasons ?? []),
          ],
        );

        await pool.query('COMMIT');
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    },
  };
}
