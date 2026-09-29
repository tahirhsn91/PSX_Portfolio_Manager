/**
 * The one place a request to the proxy is built.
 *
 * The session is an httpOnly cookie, so every call sends `credentials: 'include'`
 * and nothing in the app ever touches a token — a token the JavaScript can read is
 * a token an injected script can read too.
 *
 * Errors arrive as `{ error: { code, message } }` and are thrown as `ApiError`, so a
 * caller can tell "wrong password" from "suspended" from "the proxy is down" without
 * parsing a string. `code` is the server's own machine-readable code, which is how a
 * caller recognises the one refusal it may want to explain differently — a 409 from
 * the buy log, for instance.
 */

const PROXY_BASE = (import.meta.env.VITE_PROXY_BASE_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  ''
);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** The account is fine but cannot act until it changes its password. */
  get needsPasswordChange(): boolean {
    return this.code === 'PASSWORD_CHANGE_REQUIRED';
  }

  /** The server refused an edit because the buy log cannot represent it. */
  get isLogConflict(): boolean {
    return this.code === 'LOG_CONFLICT';
  }

  /** The row is gone, or belongs to somebody else — the API says 404 to both. */
  get isNotFound(): boolean {
    return this.status === 404;
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${PROXY_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Cannot reach the server. Check your connection and try again.'
    );
  }

  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const envelope = body as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(
      res.status,
      envelope?.error?.code ?? 'UNKNOWN',
      envelope?.error?.message ?? `Request failed (${res.status})`
    );
  }

  return body as T;
}
