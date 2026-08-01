export function bearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}
