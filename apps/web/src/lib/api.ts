import { useMutation, useQueryClient } from '@tanstack/react-query';
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const csrf = document.cookie
    .split('; ')
    .find((v) => v.startsWith('spaceops_csrf='))
    ?.split('=')[1];
  const response = await fetch('/api/v1' + path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      body?.code ?? 'NETWORK',
      body?.message ?? 'Could not load the data',
      body?.details,
    );
  return body as T;
}
export function useCommand<T = unknown>(options: { invalidate?: boolean } = {}) {
  const client = useQueryClient();
  return useMutation<T, Error, { path: string; body?: unknown; method?: string }>({
    mutationFn: ({ path, body, method = 'POST' }) =>
      api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
    onSuccess: () => (options.invalidate === false ? undefined : client.invalidateQueries()),
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) void client.invalidateQueries();
    },
  });
}
export const qs = (values: Record<string, string | number | boolean | undefined>) =>
  '?' +
  new URLSearchParams(
    Object.entries(values)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
