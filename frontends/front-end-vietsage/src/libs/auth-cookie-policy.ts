const AUTHJS_SESSION_COOKIE = "authjs.session-token";
const SECURE_AUTHJS_SESSION_COOKIE = `__Secure-${AUTHJS_SESSION_COOKIE}`;

export type SessionCookiePolicy = {
  secureCookie: boolean;
  cookieName: typeof AUTHJS_SESSION_COOKIE | typeof SECURE_AUTHJS_SESSION_COOKIE;
};

function hasCookie(cookieHeader: string | null, cookieName: string): boolean {
  if (!cookieHeader) {
    return false;
  }

  return cookieHeader.split(";").some((entry) => {
    const name = entry.trimStart().split("=", 1)[0];
    return name === cookieName || name?.startsWith(`${cookieName}.`) === true;
  });
}

export function resolveSessionCookiePolicy(requestHeaders: Headers): SessionCookiePolicy {
  const cookieHeader = requestHeaders.get("cookie");
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    ?.trim()
    .toLowerCase();
  const secureCookie =
    hasCookie(cookieHeader, SECURE_AUTHJS_SESSION_COOKIE) || forwardedProtocol === "https";

  return {
    secureCookie,
    cookieName: secureCookie ? SECURE_AUTHJS_SESSION_COOKIE : AUTHJS_SESSION_COOKIE,
  };
}
