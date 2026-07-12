import type { HttpMethod } from "@prisma/client";
import type { Request } from "express";

export const PERMISSION_PATH_MAX_LENGTH = 255;

const SUPPORTED_METHODS: ReadonlySet<HttpMethod> = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

export interface RoutePermissionKey {
  method: HttpMethod;
  path: string;
}

export interface RoutePermissionKeyInput {
  method: string;
  basePath?: string;
  routePath?: string;
}

export function normalizePermissionMethod(method: string): HttpMethod | null {
  const normalized = method.trim().toUpperCase();
  const aliased = normalized === "HEAD" ? "GET" : normalized;

  if (!isSupportedMethod(aliased)) {
    return null;
  }

  return aliased;
}

export function normalizeRouteTemplatePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }

  const compact = trimmed.replace(/\/+/g, "/");
  const withLeadingSlash = compact.startsWith("/") ? compact : `/${compact}`;

  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1);
  }

  return withLeadingSlash;
}

export function buildRoutePermissionKey(input: RoutePermissionKeyInput): RoutePermissionKey | null {
  const normalizedMethod = normalizePermissionMethod(input.method);
  if (!normalizedMethod) {
    return null;
  }

  const normalizedBasePath = input.basePath
    ? normalizeRouteTemplatePath(input.basePath)
    : undefined;
  const normalizedRoutePath = input.routePath
    ? normalizeRouteTemplatePath(input.routePath)
    : undefined;

  if (!normalizedBasePath && !normalizedRoutePath) {
    return null;
  }

  const normalizedPath = joinRoutePaths(normalizedBasePath, normalizedRoutePath);

  return {
    method: normalizedMethod,
    path: normalizedPath,
  };
}

export function resolveRoutePermissionKeyFromRequest(request: Request): RoutePermissionKey | null {
  const routePath =
    request.route && typeof request.route.path === "string" ? request.route.path : undefined;

  return buildRoutePermissionKey({
    method: request.method,
    basePath: request.baseUrl,
    routePath,
  });
}

export function isPermissionPathTooLong(
  path: string,
  maxLength = PERMISSION_PATH_MAX_LENGTH,
): boolean {
  return path.length > maxLength;
}

function isSupportedMethod(method: string): method is HttpMethod {
  return SUPPORTED_METHODS.has(method as HttpMethod);
}

function joinRoutePaths(basePath?: string, routePath?: string): string {
  if (!basePath || basePath === "/") {
    return routePath ?? "/";
  }

  if (!routePath || routePath === "/") {
    return basePath;
  }

  if (routePath === basePath || routePath.startsWith(`${basePath}/`)) {
    return routePath;
  }

  return normalizeRouteTemplatePath(`${basePath}/${routePath}`);
}
