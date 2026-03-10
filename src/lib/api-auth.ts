import { timingSafeEqual } from "crypto";

import { NextRequest } from "next/server";

type AuthOptions = {
  tokenEnvNames?: string[];
  headerName?: string;
};

type AuthResult = {
  ok: boolean;
  status: number;
  message: string;
};

function getBearerToken(headerValue: string | null): string {
  if (!headerValue) {
    return "";
  }
  const [scheme, token] = headerValue.trim().split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return "";
  }
  return token.trim();
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}

function resolveRequiredToken(tokenEnvNames: string[]): string {
  for (const envName of tokenEnvNames) {
    const value = process.env[envName]?.trim();
    if (value) {
      return value;
    }
  }
  return "";
}

export function requireInternalToken(
  request: NextRequest | Request,
  options?: AuthOptions,
): AuthResult {
  const tokenEnvNames = options?.tokenEnvNames ?? [
    "AFH_INTERNAL_API_TOKEN",
    "INTERNAL_API_TOKEN",
    "CRON_SECRET",
  ];
  const headerName = (options?.headerName ?? "x-afh-api-token").toLowerCase();
  const requiredToken = resolveRequiredToken(tokenEnvNames);

  // Keep local DX flexible while refusing unauthenticated production exposure.
  if (!requiredToken) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        status: 503,
        message: "Internal API token is not configured",
      };
    }
    return { ok: true, status: 200, message: "dev mode: auth not required" };
  }

  const headerToken = request.headers.get(headerName)?.trim() ?? "";
  const bearerToken = getBearerToken(request.headers.get("authorization"));
  const providedToken = headerToken || bearerToken;
  if (!providedToken || !safeEqual(providedToken, requiredToken)) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  return { ok: true, status: 200, message: "Authorized" };
}
