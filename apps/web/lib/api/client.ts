/**
 * Typed fetch client for the PUJA OS API.
 *
 * - Same-origin only: requests go to /api/v1/* which Next rewrites to the NestJS API,
 *   so httpOnly auth cookies are first-party.
 * - On 401 TOKEN_EXPIRED, refreshes the session once (single-flight across concurrent
 *   requests) and retries. Other 401s redirect to /login?next=…
 * - Errors are normalised to ApiError with the server's code, message, details, requestId.
 */

export const API_BASE = '/api/v1';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.requestId = body.requestId;
  }

  /** Human readable list of validation messages when available. */
  get detailMessages(): string[] {
    if (Array.isArray(this.details)) {
      return this.details.map((d) => (typeof d === 'string' ? d : typeof d === 'object' && d && 'message' in d ? String((d as { message: unknown }).message) : JSON.stringify(d)));
    }
    return [];
  }
}

export interface Paged<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; pageCount: number };
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Attach an Idempotency-Key header (use one key per user submission). */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Do not attempt refresh/redirect on 401 (used by auth endpoints). */
  noAuthRetry?: boolean;
  headers?: Record<string, string>;
}

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname + window.location.search;
  if (window.location.pathname.startsWith('/login')) return;
  window.location.href = `/login?next=${encodeURIComponent(path)}`;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody = { code: 'HTTP_' + res.status, message: res.statusText || 'Request failed' };
  try {
    const json = await res.json();
    if (json?.error?.code) body = json.error;
  } catch {
    /* non-JSON error */
  }
  if (res.status === 404 && body.code === 'HTTP_404') body = { ...body, code: 'NOT_FOUND', message: 'Not found' };
  return new ApiError(res.status, body);
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const res = await fetch(`${API_BASE}${path}`, { method: opts.method ?? 'GET', credentials: 'include', headers, body, signal: opts.signal });

  if (res.status === 401 && !opts.noAuthRetry) {
    const err = await parseError(res);
    if (!retried && (err.code === 'TOKEN_EXPIRED' || err.code === 'UNAUTHENTICATED')) {
      const ok = await refreshSession();
      if (ok) return apiRequest<T>(path, opts, true);
    }
    redirectToLogin();
    throw err;
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return (await res.text()) as unknown as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiRequest<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) => apiRequest<T>(path, { ...opts, method: 'POST', body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body: body ?? {} }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const details = err.detailMessages;
    return details.length ? `${err.message}: ${details.slice(0, 3).join('; ')}` : err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

export const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;
