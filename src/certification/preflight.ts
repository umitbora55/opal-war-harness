import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createControlPlaneAdapter } from '../adapters/control-plane/control-plane-client.js';
import { createFlutterBridgeAdapter } from '../adapters/flutter/war-flutter-bridge.js';
import { resolveHarnessConfig } from '../core/environment-resolver.js';
import { resolveCertificationPaths } from './paths.js';

export interface PreflightCheckOptions {
  rootDir?: string;
  controlPlaneUrl?: string;
  flutterBridgeUrl?: string;
  secret?: string;
  timeoutMs?: number;
  outputDir?: string;
}

export interface PreflightCheckResult {
  ok: boolean;
  controlPlaneUrl: string;
  flutterBridgeUrl: string;
  checks: Array<{
    name: string;
    ok: boolean;
    status?: number;
    detail?: string;
  }>;
}

async function persist(outputDir: string, payload: PreflightCheckResult): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'preflight.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function detailFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runCertificationPreflight(
  options: PreflightCheckOptions = {},
): Promise<PreflightCheckResult> {
  const config = await resolveHarnessConfig({
    configPath: './configs/release.json',
    controlPlaneUrl: options.controlPlaneUrl,
    flutterBridgeUrl: options.flutterBridgeUrl,
  });
  const controlPlaneUrl = config.backend.controlPlaneUrl || config.backend.baseUrl;
  if (!controlPlaneUrl) {
    throw new Error('Missing staging control-plane URL. Set WAR_STAGING_BASE_URL or WAR_CONTROL_PLANE_URL.');
  }

  const secret = options.secret ?? config.controlSurface.secret;
  const controlPlane = createControlPlaneAdapter(controlPlaneUrl, secret);
  const flutterBridgeUrl = config.backend.flutterBridgeUrl;
  const flutterBridge = flutterBridgeUrl ? createFlutterBridgeAdapter(flutterBridgeUrl, secret) : null;
  const checks: PreflightCheckResult['checks'] = [];

  try {
    const ping = await controlPlane.ping();
    checks.push({ name: 'control-plane-ping', ok: ping.ok, detail: ping.synthetic ? 'synthetic' : 'remote' });
  } catch (error) {
    checks.push({ name: 'control-plane-ping', ok: false, detail: detailFromError(error) });
  }

  try {
    const bootstrap = await controlPlane.bootstrap({
      reason: 'preflight',
      action: 'bootstrap',
      targetId: 'preflight',
      payload: { source: 'certification-preflight' },
    });
    checks.push({ name: 'control-plane-bootstrap', ok: bootstrap.accepted, detail: bootstrap.synthetic ? bootstrap.tenantId : 'remote' });
  } catch (error) {
    checks.push({ name: 'control-plane-bootstrap', ok: false, detail: detailFromError(error) });
  }

  try {
    const cleanup = await controlPlane.cleanup({
      reason: 'preflight',
      action: 'cleanup',
      targetId: 'preflight',
      payload: { source: 'certification-preflight' },
    });
    checks.push({ name: 'control-plane-cleanup', ok: cleanup.accepted && cleanup.cleaned, detail: cleanup.synthetic ? 'synthetic' : 'remote' });
  } catch (error) {
    checks.push({ name: 'control-plane-cleanup', ok: false, detail: detailFromError(error) });
  }

  if (flutterBridge) {
    try {
      const bridge = await flutterBridge.send({
        screen: 'war-harness-preflight',
        action: 'ping',
        payload: { source: 'certification-preflight' },
      });
      checks.push({ name: 'flutter-bridge', ok: bridge.acknowledged, detail: bridge.synthetic ? 'synthetic' : 'remote' });
    } catch (error) {
      checks.push({ name: 'flutter-bridge', ok: false, detail: detailFromError(error) });
    }
  } else {
    checks.push({ name: 'flutter-bridge', ok: true, detail: 'skipped' });
  }

  const ok = checks.every((check) => check.ok);
  const payload: PreflightCheckResult = {
    ok,
    controlPlaneUrl,
    flutterBridgeUrl,
    checks,
  };

  await persist(options.outputDir ?? resolveCertificationPaths().outputDir, payload);
  return payload;
}
