export type RunMode =
  | 'smoke'
  | 'behavioral'
  | 'load'
  | 'chaos'
  | 'replay'
  | 'certify'
  | 'shadow';

export type EnvironmentMode = 'local' | 'http' | 'shadow';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type ActionKind =
  | 'account.create'
  | 'account.login'
  | 'onboarding.complete'
  | 'profile.update'
  | 'photo.upload'
  | 'verification.start'
  | 'verification.pass'
  | 'verification.fail'
  | 'discover.load'
  | 'discover.like'
  | 'discover.pass'
  | 'discover.superlike'
  | 'match.create'
  | 'message.send'
  | 'message.reply'
  | 'trust.report'
  | 'trust.block'
  | 'trust.hold'
  | 'premium.buy'
  | 'premium.expire'
  | 'irl.intent'
  | 'irl.plan'
  | 'irl.meet'
  | 'irl.cancel'
  | 'irl.no_show'
  | 'notification.open'
  | 'orchestration.decide'
  | 'control_plane.action';

export interface HarnessConfig {
  mode: RunMode;
  environment: EnvironmentMode;
  seed: number;
  runName: string;
  certificationScenarioIds?: string[];
  database: {
    enabled: boolean;
    url: string;
    migrationsDir: string;
    auditTablesPrefix: string;
    allowJsonFallback: boolean;
  };
  backend: {
    baseUrl: string;
    controlPlaneUrl: string;
    flutterBridgeUrl: string;
  };
  limits: {
    userCount: number;
    maxConcurrentActions: number;
    durationMinutes: number;
  };
  localeDefaults: {
    country: string;
    city: string;
    timezone: string;
  };
  controlSurface: {
    enabled: boolean;
    secret: string;
    port: number;
  };
}

export interface RunContext {
  runId: string;
  runName: string;
  mode: RunMode;
  environment: EnvironmentMode;
  seed: number;
  buildId: string;
  fixtureHash: string;
  configVersion: string;
  clockMode: 'deterministic' | 'realtime';
  startedAt: string;
  outputDir: string;
}

export interface StepExpectation {
  invariantIds: string[];
  anomalyIds?: string[];
  releaseBlocking?: boolean;
}

export interface ScenarioStep {
  id: string;
  kind: ActionKind | string;
  actor: string;
  target?: string;
  atMs: number;
  payload?: Record<string, unknown>;
  expectation?: StepExpectation;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  category: string;
  objective: string;
  userCount: number;
  seed: number;
  expectedSignals: string[];
  replayTags: string[];
  personas: string[];
  steps: ScenarioStep[];
  blocking: boolean;
  locale?: {
    country: string;
    city: string;
    timezone: string;
  };
}

export interface PersonaDefinition {
  id: string;
  version: string;
  active?: boolean;
  description: string;
  intentProfile: 'serious' | 'casual' | 'mixed' | 'adversarial';
  pacing: 'slow' | 'normal' | 'fast' | 'bursty';
  trustBias: 'low' | 'medium' | 'high';
  premiumPropensity: 'low' | 'medium' | 'high';
  irlPropensity: 'low' | 'medium' | 'high';
  localeBias?: {
    country: string;
    city: string;
  };
  probabilities: {
    like: number;
    reply: number;
    ghost: number;
    report: number;
    premiumBuy: number;
    planMeet: number;
    cancelMeet: number;
    noShow: number;
  };
  constraints: string[];
}

export interface SyntheticAction {
  actionId: string;
  kind: ActionKind | string;
  actorId: string;
  targetId?: string;
  payload: Record<string, unknown>;
  plannedAtMs: number;
  executedAtMs?: number;
  result?: 'ok' | 'blocked' | 'failed' | 'noop';
  errorCode?: string;
}

export interface SyntheticUserProfile {
  syntheticUserId: string;
  personaId: string;
  country: string;
  city: string;
  timezone: string;
  trustBias: 'low' | 'medium' | 'high';
  premiumPropensity: 'low' | 'medium' | 'high';
  irlPropensity: 'low' | 'medium' | 'high';
  seedIndex: number;
}

export interface SimulationObservation {
  metric: string;
  value: number;
  threshold?: number;
  severity: Severity;
  source: string;
  released: boolean;
}

export interface InvariantResult {
  invariantId: string;
  passed: boolean;
  severity: Severity;
  message: string;
  evidence: string[];
  autoFail: boolean;
}

export interface AnomalyRecord {
  anomalyId: string;
  confidence: number;
  severity: Severity;
  message: string;
  evidence: string[];
  releaseBlocking: boolean;
}

export interface ReleaseVerdict {
  allowed: boolean;
  blockingReasons: string[];
  advisoryReasons: string[];
}
