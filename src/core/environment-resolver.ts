import { readJsonFile } from './json.js';
import type { EnvironmentMode, HarnessConfig, RunMode } from './types.js';

export interface EnvironmentOverrides {
  mode?: RunMode;
  environment?: EnvironmentMode;
  seed?: number;
  configPath?: string;
  runName?: string;
  backendBaseUrl?: string;
  controlPlaneUrl?: string;
  flutterBridgeUrl?: string;
  userCount?: number;
  maxConcurrentActions?: number;
  durationMinutes?: number;
  databaseEnabled?: boolean;
  databaseUrl?: string;
  migrationsDir?: string;
  allowJsonFallback?: boolean;
  controlSurfaceEnabled?: boolean;
  controlSurfaceSecret?: string;
  controlSurfacePort?: number;
}

export async function resolveHarnessConfig(
  overrides: EnvironmentOverrides = {},
): Promise<HarnessConfig> {
  const configPath = overrides.configPath ?? process.env.WAR_CONFIG ?? './configs/base.json';
  const fileConfig = await readJsonFile<Partial<HarnessConfig>>(configPath);
  const env = process.env;

  return {
    mode: overrides.mode ?? (fileConfig.mode as RunMode) ?? 'smoke',
    environment:
      overrides.environment ?? (fileConfig.environment as EnvironmentMode) ?? 'local',
    seed: overrides.seed ?? fileConfig.seed ?? Number(env.WAR_SEED ?? '424242'),
    runName: overrides.runName ?? fileConfig.runName ?? env.WAR_RUN_NAME ?? 'opal-war-run',
    backend: {
      baseUrl:
        overrides.backendBaseUrl ??
        fileConfig.backend?.baseUrl ??
        env.WAR_BACKEND_BASE_URL ??
        '',
      controlPlaneUrl:
        overrides.controlPlaneUrl ??
        fileConfig.backend?.controlPlaneUrl ??
        env.WAR_CONTROL_PLANE_URL ??
        '',
      flutterBridgeUrl:
        overrides.flutterBridgeUrl ??
        fileConfig.backend?.flutterBridgeUrl ??
        env.WAR_FLUTTER_BRIDGE_URL ??
        '',
    },
    limits: {
      userCount: overrides.userCount ?? fileConfig.limits?.userCount ?? 100,
      maxConcurrentActions:
        overrides.maxConcurrentActions ?? fileConfig.limits?.maxConcurrentActions ?? 8,
      durationMinutes:
        overrides.durationMinutes ?? fileConfig.limits?.durationMinutes ?? 15,
    },
    localeDefaults: {
      country: fileConfig.localeDefaults?.country ?? 'TR',
      city: fileConfig.localeDefaults?.city ?? 'Istanbul',
      timezone: fileConfig.localeDefaults?.timezone ?? 'Europe/Istanbul',
    },
    database: {
      enabled:
        overrides.databaseEnabled ??
        fileConfig.database?.enabled ??
        Boolean(env.WAR_DATABASE_URL),
      url:
        overrides.databaseUrl ??
        fileConfig.database?.url ??
        env.WAR_DATABASE_URL ??
        '',
      migrationsDir:
        overrides.migrationsDir ??
        fileConfig.database?.migrationsDir ??
        './migrations',
      auditTablesPrefix:
        fileConfig.database?.auditTablesPrefix ?? 'war_harness_',
      allowJsonFallback:
        overrides.allowJsonFallback ??
        fileConfig.database?.allowJsonFallback ??
        true,
    },
    controlSurface: {
      enabled:
        overrides.controlSurfaceEnabled ??
        fileConfig.controlSurface?.enabled ??
        true,
      secret:
        overrides.controlSurfaceSecret ??
        fileConfig.controlSurface?.secret ??
        env.WAR_CONTROL_SURFACE_SECRET ??
        'warp-test-secret',
      port:
        overrides.controlSurfacePort ??
        fileConfig.controlSurface?.port ??
        Number(env.WAR_CONTROL_SURFACE_PORT ?? '4010'),
    },
  };
}
