/**
 * Validates that a redirect path is internal and safe from open redirect vulnerabilities.
 * 
 * Rules:
 * - Must begin with a single '/'
 * - Must NOT begin with '//' or '/\'
 * - Must NOT contain external schemes (http:, https:, javascript:, data:, etc.)
 * - Must be a relative path on the same host
 */
export function isSafeRedirectUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== "string") {
    return false;
  }

  const trimmed = url.trim();

  // Must begin with / and not // or /\
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return false;
  }

  // Prevent scheme injection or malformed URI components
  try {
    const dummyBase = "http://localhost:3000";
    const parsed = new URL(trimmed, dummyBase);

    // Origin must remain strictly dummyBase
    if (parsed.origin !== dummyBase) {
      return false;
    }

    // Protocol must remain http
    if (parsed.protocol !== "http:") {
      return false;
    }

    return parsed.pathname.startsWith("/");
  } catch {
    return false;
  }
}

/**
 * Returns the destination if it is safe, otherwise returns fallback (default: '/').
 */
export function getSafeRedirectUrl(
  url: string | null | undefined,
  fallback = "/"
): string {
  if (isSafeRedirectUrl(url)) {
    return url.trim();
  }
  return fallback;
}
