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

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}



