import type { ScenarioStep } from './types.js';

export interface ScheduledStep extends ScenarioStep {
  syntheticUserId: string;
  scenarioId: string;
  targetId?: string;
}

export function sortStepsByTime(steps: readonly ScheduledStep[]): ScheduledStep[] {
  return [...steps].sort((left, right) => {
    if (left.atMs !== right.atMs) {
      return left.atMs - right.atMs;
    }
    if (left.scenarioId !== right.scenarioId) {
      return left.scenarioId.localeCompare(right.scenarioId);
    }
    return left.id.localeCompare(right.id);
  });
}

export function groupStepsByWindow(
  steps: readonly ScheduledStep[],
  windowMs: number,
): ScheduledStep[][] {
  const sorted = sortStepsByTime(steps);
  const windows: ScheduledStep[][] = [];
  let currentWindow: ScheduledStep[] = [];
  let windowStart = sorted[0]?.atMs ?? 0;

  for (const step of sorted) {
    if (currentWindow.length === 0) {
      windowStart = step.atMs;
      currentWindow.push(step);
      continue;
    }
    if (step.atMs - windowStart <= windowMs) {
      currentWindow.push(step);
      continue;
    }
    windows.push(currentWindow);
    currentWindow = [step];
    windowStart = step.atMs;
  }

  if (currentWindow.length > 0) {
    windows.push(currentWindow);
  }

  return windows;
}
