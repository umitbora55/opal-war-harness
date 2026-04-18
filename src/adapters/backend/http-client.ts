export interface BackendRequestOptions {
  method?: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface BackendAdapter {
  baseUrl: string;
  request<T>(options: BackendRequestOptions): Promise<T>;
}

export function createBackendAdapter(baseUrl: string): BackendAdapter {
  return {
    baseUrl,
    async request<T>(options: BackendRequestOptions) {
      if (!baseUrl) {
        return {
          ok: true,
          synthetic: true,
          method: options.method ?? 'GET',
          path: options.path,
          body: options.body ?? null,
        } as T;
      }

      const response = await fetch(`${baseUrl}${options.path}`, {
        method: options.method ?? 'GET',
        headers: {
          'content-type': 'application/json',
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        throw new Error(`Backend request failed: ${response.status} ${response.statusText}`);
      }
      return (await response.json()) as T;
    },
  };
}
