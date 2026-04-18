export interface FlutterBridgeRequest {
  screen: string;
  action: string;
  payload?: Record<string, unknown>;
}

export interface FlutterBridgeAdapter {
  bridgeUrl: string;
  send(request: FlutterBridgeRequest): Promise<{ acknowledged: boolean; synthetic: boolean }>;
}

export function createFlutterBridgeAdapter(bridgeUrl: string): FlutterBridgeAdapter {
  return {
    bridgeUrl,
    async send(request) {
      if (!bridgeUrl) {
        return { acknowledged: true, synthetic: true };
      }
      const response = await fetch(`${bridgeUrl}/war-harness`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        throw new Error(`Flutter bridge error: ${response.status} ${response.statusText}`);
      }
      return (await response.json()) as { acknowledged: boolean; synthetic: boolean };
    },
  };
}
