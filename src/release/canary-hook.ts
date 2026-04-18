export interface CanaryHookPayload {
  runId: string;
  verdict: {
    allowed: boolean;
    blockingReasons: string[];
    advisoryReasons: string[];
  };
  reportPath: string;
}

export interface CanaryHookResult {
  forwarded: boolean;
  synthetic: boolean;
}

export function createCanaryHook(url: string) {
  return {
    url,
    async send(payload: CanaryHookPayload): Promise<CanaryHookResult> {
      if (!url) {
        return { forwarded: true, synthetic: true };
      }
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Canary hook failed: ${response.status} ${response.statusText}`);
      }
      return (await response.json()) as CanaryHookResult;
    },
  };
}
