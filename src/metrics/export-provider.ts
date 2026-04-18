#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dashboardPanels, alertContracts } from './dashboard-contract.js';
import type { HarnessConfig } from '../core/types.js';
import { resolveHarnessConfig } from '../core/environment-resolver.js';
import { stableHash } from '../core/hash.js';

export interface ProviderExportArtifact {
  provider: 'grafana';
  version: string;
  generatedAt: string;
  dashboard: Record<string, unknown>;
  alerts: Record<string, unknown>;
}

export function buildGrafanaArtifact(config: Pick<HarnessConfig, 'runName' | 'localeDefaults'>): ProviderExportArtifact {
  const generatedAt = new Date().toISOString();
  const dashboard = {
    uid: stableHash(`${config.runName}:dashboard`).slice(0, 12),
    title: 'OPAL WAR HARNESS',
    tags: ['opal', 'war-harness', config.localeDefaults.country],
    schemaVersion: 39,
    version: 1,
    refresh: '30s',
    panels: dashboardPanels.map((panel, index) => ({
      id: index + 1,
      type: 'timeseries',
      title: panel.title,
      gridPos: { h: 8, w: 12, x: (index % 2) * 12, y: Math.floor(index / 2) * 8 },
      targets: panel.metrics.map((metric) => ({
        refId: metric.slice(0, 1).toUpperCase(),
        expr: `sum(${metric})`,
        legendFormat: metric,
      })),
      fieldConfig: {
        defaults: { unit: 'short' },
        overrides: [],
      },
    })),
  };

  const alerts = {
    apiVersion: 1,
    groups: [
      {
        orgId: 1,
        name: 'opal-war-harness',
        folder: 'opal',
        interval: '1m',
        rules: alertContracts.map((rule) => ({
          uid: rule.id,
          title: rule.title,
          condition: 'A',
          data: [
            {
              refId: 'A',
              queryType: 'timeSeriesQuery',
              relativeTimeRange: { from: 60, to: 0 },
              datasourceUid: 'prometheus',
              model: {
                expr: rule.metric,
                legendFormat: rule.metric,
              },
            },
          ],
          for: '1m',
          noDataState: rule.blocking ? 'Alerting' : 'NoData',
          execErrState: 'Alerting',
          labels: {
            severity: rule.severity,
            blocking: String(rule.blocking),
          },
          annotations: {
            summary: rule.title,
            runName: config.runName,
          },
        })),
      },
    ],
  };

  return {
    provider: 'grafana',
    version: '1.0.0',
    generatedAt,
    dashboard,
    alerts,
  };
}

export async function writeGrafanaExport(
  config: Pick<HarnessConfig, 'runName' | 'localeDefaults'>,
  outDir = join('reports', 'provider'),
): Promise<{ dashboardPath: string; alertsPath: string; providerPath: string }> {
  const artifact = buildGrafanaArtifact(config);
  await mkdir(outDir, { recursive: true });
  const dashboardPath = join(outDir, 'grafana-dashboard.json');
  const alertsPath = join(outDir, 'grafana-alerts.json');
  const providerPath = join(outDir, 'grafana-provider-export.json');
  await writeFile(dashboardPath, `${JSON.stringify(artifact.dashboard, null, 2)}\n`, 'utf8');
  await writeFile(alertsPath, `${JSON.stringify(artifact.alerts, null, 2)}\n`, 'utf8');
  await writeFile(providerPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return { dashboardPath, alertsPath, providerPath };
}

async function main() {
  const config = await resolveHarnessConfig({ mode: 'smoke' });
  const paths = await writeGrafanaExport(config);
  console.log(JSON.stringify({ exported: true, provider: 'grafana', ...paths }, null, 2));
}

if (process.argv[1] && process.argv[1].includes('export-provider')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
