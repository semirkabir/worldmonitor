type FetchLike = typeof fetch;

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

export class ValidationError extends Error {
  violations: Array<{ field: string; description: string }>;

  constructor(violations: Array<{ field: string; description: string }>) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.violations = violations;
  }
}

export class ApiError extends Error {
  statusCode: number;
  body: string;

  constructor(statusCode: number, message: string, body: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

export class GenericServiceClient {
  private baseURL: string;
  private fetchFn: FetchLike;
  private defaultHeaders: Record<string, string>;
  private domain: string;

  constructor(domain: string, baseURL: string, options?: { fetch?: FetchLike; defaultHeaders?: Record<string, string> }) {
    this.domain = domain;
    this.baseURL = baseURL.replace(/\/+$/, '');
    this.fetchFn = options?.fetch ?? globalThis.fetch;
    this.defaultHeaders = { ...options?.defaultHeaders };

    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (typeof prop !== 'string') return Reflect.get(target, prop, receiver);
        if (prop in target) return Reflect.get(target, prop, receiver);
        return async (req: Record<string, unknown> = {}, options?: { headers?: Record<string, string>; signal?: AbortSignal }) => {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(req || {})) {
            if (value == null || value === '' || value === false) continue;
            const paramKey = toSnakeCase(key);
            if (Array.isArray(value)) {
              if (value.length === 0) continue;
              params.set(paramKey, value.join(','));
              continue;
            }
            params.set(paramKey, String(value));
          }

          const path = `/api/${target.domain}/v1/${toKebabCase(prop)}`;
          const url = `${target.baseURL}${path}${params.toString() ? `?${params.toString()}` : ''}`;
          const resp = await target.fetchFn(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...target.defaultHeaders,
              ...options?.headers,
            },
            signal: options?.signal,
          });

          if (!resp.ok) {
            const body = await resp.text();
            if (resp.status === 400) {
              try {
                const parsed = JSON.parse(body) as { violations?: Array<{ field: string; description: string }> };
                if (parsed.violations) throw new ValidationError(parsed.violations);
              } catch (error) {
                if (error instanceof ValidationError) throw error;
              }
            }
            throw new ApiError(resp.status, `Request failed with status ${resp.status}`, body);
          }

          return resp.json();
        };
      },
    });
  }
}
