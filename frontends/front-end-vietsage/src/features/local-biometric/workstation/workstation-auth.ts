const MAX_RECOGNITION_BODY_BYTES = 65_536;

export function bearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export function acceptsRecognitionBodyLength(value: string | null) {
  if (!value) return false;
  const length = Number(value);
  return Number.isSafeInteger(length) && length > 0 && length <= MAX_RECOGNITION_BODY_BYTES;
}

export function recognitionRelayAvailable(nodeEnv = process.env.NODE_ENV) {
  return nodeEnv !== "production";
}
