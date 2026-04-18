export interface FlutterBridgeRequest {
  screen: string;
  action: string;
  payload?: Record<string, unknown>;
}

export interface FlutterBridgeAdapter {
  bridgeUrl: string;
  send(request: FlutterBridgeRequest): Promise<{ acknowledged: boolean; synthetic: boolean }>;
}

export function createFlutterBridgeAdapter(bridgeUrl: string, secret?: string): FlutterBridgeAdapter {
  return {
    bridgeUrl,
    async send(request) {
      if (!bridgeUrl) {
        return { acknowledged: true, synthetic: true };
      }
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (secret) {
        headers['x-war-harness-secret'] = secret;
      }
      const response = await fetch(`${bridgeUrl}/war-harness`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        throw new Error(`Flutter bridge error: ${response.status} ${response.statusText}`);
      }
      return (await response.json()) as { acknowledged: boolean; synthetic: boolean };
    },
  };
}
