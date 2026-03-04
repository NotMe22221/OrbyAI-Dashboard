export function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }

  const value = raw.trim();
  if (!value || value.startsWith("__ADD_")) {
    return undefined;
  }

  return value;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function getAppUrl(): string {
  const configured = optionalEnv("NEXT_PUBLIC_APP_URL");
  if (configured) {
    return normalizeBaseUrl(configured);
  }
  return "http://localhost:3000";
}

export function getRequestOrigin(request: Request): string | undefined {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  if (forwardedProto && forwardedHost) {
    return normalizeBaseUrl(`${forwardedProto}://${forwardedHost}`);
  }

  const host = request.headers.get("host")?.split(",")[0]?.trim();
  if (host) {
    const fallbackProto = request.url.startsWith("https://") ? "https" : "http";
    return normalizeBaseUrl(`${forwardedProto ?? fallbackProto}://${host}`);
  }

  try {
    const origin = new URL(request.url).origin;
    return normalizeBaseUrl(origin);
  } catch {
    return undefined;
  }
}

export function resolveAppUrl(request: Request): string {
  const configured = optionalEnv("NEXT_PUBLIC_APP_URL");
  if (configured) {
    return normalizeBaseUrl(configured);
  }

  const requestOrigin = getRequestOrigin(request);
  if (requestOrigin) {
    return requestOrigin;
  }

  return "http://localhost:3000";
}



