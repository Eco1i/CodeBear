interface ErrorDetail {
  message?: string;
  code?: string;
  data?: unknown;
}

interface ValidationIssue {
  loc?: unknown[];
  msg?: string;
  type?: string;
}

function normalizeDetail(detail: unknown): ErrorDetail | string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // FastAPI/Pydantic 校验错误：detail 是问题列表，拼成可读信息
    const messages = detail
      .map((item): string => {
        if (item && typeof item === "object") {
          const issue = item as ValidationIssue;
          const location = (issue.loc || [])
            .filter((part) => typeof part === "string")
            .join(".");
          const text = issue.msg || `校验失败（${issue.type || "validation_error"}）`;
          return location ? `${location}: ${text}` : text;
        }
        return String(item);
      })
      .filter(Boolean)
      .slice(0, 5);
    if (messages.length) {
      const suffix = detail.length > messages.length ? `（共 ${detail.length} 项问题）` : "";
      return messages.join("；") + suffix;
    }
    return `请求参数校验失败（${detail.length} 项问题）`;
  }
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    if (typeof record.message === "string" || typeof record.detail === "string") {
      return {
        message: String(record.message ?? record.detail),
        code: typeof record.code === "string" ? record.code : undefined,
        data: record.data,
      };
    }
    if (typeof record.detail !== "undefined") return normalizeDetail(record.detail);
  }
  return "";
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
      const payload = (await response.json()) as { detail?: unknown };
      const normalized = normalizeDetail(payload.detail);
      if (typeof normalized === "string" && normalized) {
        detail = normalized;
      } else if (typeof normalized !== "string") {
        detail = normalized;
      }
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
