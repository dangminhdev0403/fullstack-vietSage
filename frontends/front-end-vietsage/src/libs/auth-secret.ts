const PLACEHOLDER_PREFIXES = ["your-long-random-secret", "replace-with", "change-me"];

export function resolveAuthSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const rawSecret = env.NEXTAUTH_SECRET ?? env.AUTH_SECRET;
  if (env.NODE_ENV !== "production") {
    return rawSecret;
  }

  const secret = rawSecret?.trim();
  const normalized = secret?.toLowerCase() ?? "";
  if (
    !secret ||
    secret.length < 32 ||
    PLACEHOLDER_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  ) {
    throw new Error(
      "Invalid NEXTAUTH_SECRET or AUTH_SECRET environment variable. Production requires at least 32 non-placeholder characters.",
    );
  }

  return secret;
}
