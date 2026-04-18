import type { FeatureRegistryRecord, WarHarnessReportArtifact, WarHarnessReplayBundleArtifact } from './types.js';

const FAMILY_BY_KIND: Array<[RegExp, string[]]> = [
  [/^account\./u, ['auth']],
  [/^onboarding\./u, ['onboarding']],
  [/^profile\./u, ['profile']],
  [/^photo\./u, ['photo']],
  [/^verification\./u, ['verification', 'trust']],
  [/^discover\./u, ['swipe', 'ranking', 'marketplace']],
  [/^match\./u, ['match', 'messaging']],
  [/^message\./u, ['messaging', 'notifications']],
  [/^trust\./u, ['trust']],
  [/^premium\./u, ['premium']],
  [/^irl\./u, ['irl', 'outcome', 'trust']],
  [/^notification\./u, ['notifications']],
  [/^orchestration\./u, ['orchestration', 'suppression']],
  [/^control_plane\./u, ['operator', 'release']],
];

export interface WarHarnessAssessment {
  report?: WarHarnessReportArtifact;
  replayBundle?: WarHarnessReplayBundleArtifact;
  touchedFamilies: string[];
  touchedFeatureIds: string[];
}

export function assessWarHarnessArtifacts(
  report?: WarHarnessReportArtifact,
  replayBundle?: WarHarnessReplayBundleArtifact,
  featureRegistry: FeatureRegistryRecord[] = [],
): WarHarnessAssessment {
  const touchedFamilies = new Set<string>();
  const touchedFeatureIds = new Set<string>();

  for (const family of Object.keys(report?.featureMatrix ?? {})) {
    if (report?.featureMatrix[family]) {
      touchedFamilies.add(family);
    }
  }

  for (const action of replayBundle?.actions ?? []) {
    for (const [pattern, families] of FAMILY_BY_KIND) {
      if (pattern.test(action.kind)) {
        for (const family of families) {
          touchedFamilies.add(family);
        }
      }
    }
  }

  for (const record of featureRegistry) {
    if (touchedFamilies.has(record.family)) {
      touchedFeatureIds.add(record.feature_id);
    }
  }

  return {
    report,
    replayBundle,
    touchedFamilies: [...touchedFamilies],
    touchedFeatureIds: [...touchedFeatureIds],
  };
}

