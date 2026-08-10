import type { GoogleApiErrorShape } from "./types";

export type GoogleStatusCategory =
  | "authentication"
  | "permission"
  | "invalid_request"
  | "not_found"
  | "quota"
  | "transient"
  | "unknown";

export class GoogleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly category: GoogleStatusCategory,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

function categoryFor(status: number, reason?: string): GoogleStatusCategory {
  if (status === 401) return "authentication";
  if (status === 403 && /quota|rateLimit|userRateLimit/i.test(reason ?? "")) return "quota";
  if (status === 403) return "permission";
  if (status === 404) return "not_found";
  if (status === 429) return "quota";
  if (status >= 400 && status < 500) return "invalid_request";
  if (status >= 500) return "transient";
  return "unknown";
}

export async function toGoogleApiError(response: Response): Promise<GoogleApiError> {
  let payload: GoogleApiErrorShape = {};
  try {
    payload = (await response.json()) as GoogleApiErrorShape;
  } catch {
    // Deliberately ignore non-JSON Google error bodies.
  }
  const reason = payload.error?.errors?.[0]?.reason ?? payload.error?.status;
  const category = categoryFor(response.status, reason);
  const safeMessage =
    category === "permission"
      ? "The Google identity does not have access to this Search Console property"
      : category === "authentication"
        ? "Google Search Console authentication failed"
        : category === "quota"
          ? "Google Search Console quota or rate limit was reached"
          : category === "not_found"
            ? "The Search Console property or resource was not found"
            : category === "invalid_request"
              ? "Google Search Console rejected the request"
              : category === "transient"
                ? "Google Search Console is temporarily unavailable"
                : "Google Search Console request failed";
  const retryHeader = response.headers.get("retry-after");
  const retryAfterSeconds = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : undefined;
  return new GoogleApiError(safeMessage, response.status, category, retryAfterSeconds);
}

export function safeToolError(error: unknown): {
  code: string;
  message: string;
  googleStatusCategory?: GoogleStatusCategory;
  retryable: boolean;
} {
  if (error instanceof GoogleApiError) {
    return {
      code: `GOOGLE_${error.category.toUpperCase()}`,
      message: error.message,
      googleStatusCategory: error.category,
      retryable: error.category === "quota" || error.category === "transient",
    };
  }
  if (error instanceof Error) {
    const configuration = error.message.startsWith("Required server configuration");
    return {
      code: configuration ? "SERVER_NOT_CONFIGURED" : "INVALID_REQUEST",
      message: configuration ? "The gateway is not fully configured" : error.message,
      retryable: false,
    };
  }
  return { code: "UNKNOWN_ERROR", message: "Unexpected gateway error", retryable: false };
}
