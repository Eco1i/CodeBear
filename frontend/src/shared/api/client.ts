interface ErrorDetail {
  message?: string;
  code?: string;
  data?: unknown;
}

export class ApiError extends Error {
  status: number;
  code: string;
  data: unknown;

  constructor(status: number, detail: ErrorDetail | string) {
    const normalized = typeof detail === "string" ? { message: detail } : detail;
    super(normalized.message || `请求失败（${status}）`);
    this.name = "ApiError";
    this.status = status;
    this.code = normalized.code || "request_failed";
    this.data = normalized.data;
  }
}

export async function requireOk(response: Response): Promise<Response> {
  if (!response.ok) {
    let detail: ErrorDetail | string = response.statusText;
    try {
      const payload = (await response.json()) as { detail?: ErrorDetail | string };
      detail = payload.detail || detail;
    } catch {
      // Keep the HTTP status text when an upstream proxy returns a non-JSON body.
    }
    throw new ApiError(response.status, detail);
  }
  return response;
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await requireOk(await fetch(url, init));
  return (await response.json()) as T;
}

export function json(method: string, payload?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  };
}
