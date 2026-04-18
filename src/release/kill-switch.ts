export interface KillSwitchAdvisory {
  shouldTrigger: boolean;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export function adviseKillSwitch(blockingReasons: string[], criticalAnomalies: number): KillSwitchAdvisory {
  if (blockingReasons.length > 0 && criticalAnomalies > 0) {
    return {
      shouldTrigger: true,
      reason: 'Blocking evidence and critical anomaly count exceeded release tolerance.',
      severity: 'critical',
    };
  }
  if (criticalAnomalies > 3) {
    return {
      shouldTrigger: true,
      reason: 'Critical anomaly concentration exceeds advisory threshold.',
      severity: 'high',
    };
  }
  return {
    shouldTrigger: false,
    reason: 'No kill-switch action required.',
    severity: 'low',
  };
}
