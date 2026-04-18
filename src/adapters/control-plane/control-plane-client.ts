export interface ControlPlaneActionRequest {
  reason: string;
  action: string;
  targetId?: string;
  payload?: Record<string, unknown>;
}

export interface ControlPlaneAdapter {
  url: string;
  ping(): Promise<{ ok: boolean; synthetic: boolean }>;
  bootstrap(request: ControlPlaneActionRequest): Promise<{ accepted: boolean; synthetic: boolean; tenantId: string; bootstrapToken?: string }>;
  cleanup(request: ControlPlaneActionRequest): Promise<{ accepted: boolean; synthetic: boolean; cleaned: boolean }>;
}

export function createControlPlaneAdapter(url: string): ControlPlaneAdapter {
  async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 10_000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    url,
    async ping() {
      if (!url) {
        return { ok: true, synthetic: true };
      }
      const response = await fetchWithTimeout(`${url}/war-harness/ping`, {
        headers: { 'x-test-mode': 'true' },
      });
      if (!response.ok) {
        throw new Error(`Control-plane ping failed: ${response.status} ${response.statusText}`);
      }
      return (await response.json()) as { ok: boolean; synthetic: boolean };
    },
    async bootstrap(request) {
      if (!url) {
        return { accepted: true, synthetic: true, tenantId: 'synthetic-tenant', bootstrapToken: 'synthetic-bootstrap' };
      }
      const response = await fetchWithTimeout(`${url}/war-harness/bootstrap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-mode': 'true' },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        throw new Error(`Control-plane bootstrap failed: ${response.status} ${response.statusText}`);
      }
      return (await response.json()) as { accepted: boolean; synthetic: boolean; tenantId: string; bootstrapToken?: string };
    },
    async cleanup(request) {
      if (!url) {
        return { accepted: true, synthetic: true, cleaned: true };
      }
      const response = await fetchWithTimeout(`${url}/war-harness/cleanup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-mode': 'true' },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        throw new Error(`Control-plane cleanup failed: ${response.status} ${response.statusText}`);
      }
      return (await response.json()) as { accepted: boolean; synthetic: boolean; cleaned: boolean };
    },
  };
}
