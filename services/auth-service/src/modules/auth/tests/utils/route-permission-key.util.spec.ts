import type { Request } from "express";
import {
  buildRoutePermissionKey,
  isPermissionPathTooLong,
  normalizePermissionMethod,
  normalizeRouteTemplatePath,
  resolveRoutePermissionKeyFromRequest,
} from "../../utils/route-permission-key.util";

describe("route-permission-key util", () => {
  it("normalizes route template path with leading slash and no trailing slash", () => {
    expect(normalizeRouteTemplatePath("users/:id/")).toBe("/users/:id");
    expect(normalizeRouteTemplatePath("/")).toBe("/");
    expect(normalizeRouteTemplatePath("   /orders//create/   ")).toBe("/orders/create");
  });

  it("maps HEAD method to GET", () => {
    expect(normalizePermissionMethod("head")).toBe("GET");
  });

  it("returns null for unsupported methods", () => {
    expect(normalizePermissionMethod("trace")).toBeNull();
  });

  it("builds method/path key with controller + method path", () => {
    expect(
      buildRoutePermissionKey({
        method: "GET",
        basePath: "/users",
        routePath: ":id",
      }),
    ).toEqual({ method: "GET", path: "/users/:id" });
  });

  it("does not duplicate base path when request route path already contains full template", () => {
    expect(
      buildRoutePermissionKey({
        method: "POST",
        basePath: "/auth",
        routePath: "/auth/refresh",
      }),
    ).toEqual({ method: "POST", path: "/auth/refresh" });
  });

  it("resolves permission key from express request object", () => {
    const request = {
      method: "HEAD",
      baseUrl: "/users",
      route: {
        path: ":id",
      },
    } as unknown as Request;

    expect(resolveRoutePermissionKeyFromRequest(request)).toEqual({
      method: "GET",
      path: "/users/:id",
    });
  });

  it("detects oversized permission path", () => {
    const oversizedPath = `/${"a".repeat(300)}`;
    expect(isPermissionPathTooLong(oversizedPath)).toBe(true);
  });
});
