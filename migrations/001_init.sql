-- OPAL WAR HARNESS synthetic-only schema
-- No production data, no PII, append-only by default.

CREATE TABLE IF NOT EXISTS simulation_run (
  id TEXT PRIMARY KEY,
  run_name TEXT NOT NULL,
  mode TEXT NOT NULL,
  environment TEXT NOT NULL,
  seed INTEGER NOT NULL,
  build_id TEXT NOT NULL,
  fixture_hash TEXT NOT NULL,
  config_version TEXT NOT NULL,
  clock_mode TEXT NOT NULL,
  started_at TEXT NOT NULL,
  output_dir TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_simulation_run_mode ON simulation_run(mode);
CREATE INDEX IF NOT EXISTS idx_simulation_run_started_at ON simulation_run(started_at);

CREATE TABLE IF NOT EXISTS simulation_run_seed (
  run_id TEXT NOT NULL REFERENCES simulation_run(id) ON DELETE CASCADE,
  scenario_seed INTEGER NOT NULL,
  persona_seed INTEGER NOT NULL,
  scheduler_seed INTEGER NOT NULL,
  fixture_version TEXT NOT NULL,
  config_version TEXT NOT NULL,
  PRIMARY KEY (run_id)
);

CREATE TABLE IF NOT EXISTS synthetic_user (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES simulation_run(id) ON DELETE CASCADE,
  persona_id TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  locale_timezone TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_synthetic_user_run_id ON synthetic_user(run_id);
CREATE INDEX IF NOT EXISTS idx_synthetic_user_persona_id ON synthetic_user(persona_id);

CREATE TABLE IF NOT EXISTS persona_profile (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  intent_profile TEXT NOT NULL,
  pacing TEXT NOT NULL,
  trust_bias TEXT NOT NULL,
  premium_propensity TEXT NOT NULL,
  irl_propensity TEXT NOT NULL,
  probabilities_json TEXT NOT NULL,
  constraints_json TEXT NOT NULL,
  locale_bias_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS synthetic_session (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES simulation_run(id) ON DELETE CASCADE,
  synthetic_user_id TEXT NOT NULL REFERENCES synthetic_user(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  state_version INTEGER NOT NULL DEFAULT 1,
  last_action_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_synthetic_session_run_id ON synthetic_session(run_id);
CREATE INDEX IF NOT EXISTS idx_synthetic_session_user_id ON synthetic_session(synthetic_user_id);

CREATE TABLE IF NOT EXISTS simulation_action (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES simulation_run(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  synthetic_user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  target_id TEXT,
  payload_json TEXT NOT NULL,
  planned_at_ms BIGINT NOT NULL,
  executed_at_ms BIGINT,
  result TEXT NOT NULL,
  error_code TEXT,
  trace_id TEXT,
  span_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_simulation_action_run_id ON simulation_action(run_id);
CREATE INDEX IF NOT EXISTS idx_simulation_action_scenario_id ON simulation_action(scenario_id);
CREATE INDEX IF NOT EXISTS idx_simulation_action_kind ON simulation_action(kind);

CREATE TABLE IF NOT EXISTS simulation_event (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES simulation_run(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  action_id TEXT,
  event_name TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  state_before TEXT,
  state_after TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_simulation_event_run_id ON simulation_event(run_id);
CREATE INDEX IF NOT EXISTS idx_simulation_event_trace_id ON simulation_event(trace_id);

CREATE TABLE IF NOT EXISTS simulation_observation (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES simulation_run(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  threshold REAL,
  severity TEXT NOT NULL,
  source TEXT NOT NULL,
  released INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_simulation_observation_run_id ON simulation_observation(run_id);
CREATE INDEX IF NOT EXISTS idx_simulation_observation_metric ON simulation_observation(metric);

CREATE TABLE IF NOT EXISTS simulation_invariant_violation (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES simulation_run(id) ON DELETE CASCADE,
  invariant_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  passed INTEGER NOT NULL,
  message TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  auto_fail INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_simulation_invariant_violation_run_id ON simulation_invariant_violation(run_id);
CREATE INDEX IF NOT EXISTS idx_simulation_invariant_violation_invariant_id ON simulation_invariant_violation(invariant_id);

CREATE TABLE IF NOT EXISTS simulation_anomaly (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES simulation_run(id) ON DELETE CASCADE,
  anomaly_id TEXT NOT NULL,
  confidence REAL NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  release_blocking INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_simulation_anomaly_run_id ON simulation_anomaly(run_id);
CREATE INDEX IF NOT EXISTS idx_simulation_anomaly_anomaly_id ON simulation_anomaly(anomaly_id);

CREATE TABLE IF NOT EXISTS simulation_report (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES simulation_run(id) ON DELETE CASCADE,
  report_hash TEXT NOT NULL,
  json_path TEXT NOT NULL,
  md_path TEXT NOT NULL,
  verdict_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scenario_definition (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL DEFAULT '1.0.0',
  category TEXT NOT NULL,
  objective TEXT NOT NULL,
  seed INTEGER NOT NULL,
  user_count INTEGER NOT NULL,
  expected_signals_json TEXT NOT NULL,
  replay_tags_json TEXT NOT NULL,
  personas_json TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  blocking INTEGER NOT NULL DEFAULT 1,
  locale_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scenario_assignment (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES simulation_run(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL REFERENCES scenario_definition(id) ON DELETE CASCADE,
  synthetic_user_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scenario_assignment_run_id ON scenario_assignment(run_id);

CREATE TABLE IF NOT EXISTS replay_bundle (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES simulation_run(id) ON DELETE CASCADE,
  bundle_hash TEXT NOT NULL,
  report_hash TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS calibration_profile (
  id TEXT PRIMARY KEY,
  country TEXT NOT NULL,
  city TEXT,
  tier TEXT,
  baseline_json TEXT NOT NULL,
  drift_threshold REAL NOT NULL DEFAULT 0.15,
  version TEXT NOT NULL DEFAULT '1.0.0',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS certification_decision (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES simulation_run(id) ON DELETE CASCADE,
  allowed INTEGER NOT NULL,
  blocking_reasons_json TEXT NOT NULL,
  advisory_reasons_json TEXT NOT NULL,
  decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS war_harness_audit_event (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_war_harness_audit_tenant_id ON war_harness_audit_event(tenant_id);
CREATE INDEX IF NOT EXISTS idx_war_harness_audit_action ON war_harness_audit_event(action);

CREATE TABLE IF NOT EXISTS war_harness_synthetic_tenant (
  tenant_id TEXT PRIMARY KEY,
  bootstrap_token TEXT NOT NULL,
  status TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cleaned_at TEXT
);
