import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Server } from "http";
import request from "supertest";

import { configureApp } from "../src/app.bootstrap";
import { AppModule } from "../src/app.module";

interface HealthPayload {
  status: string;
  service: string;
  uptimeSeconds: number;
  timestamp: string;
}

interface SuccessBody<T> {
  status: number;
  error: null;
  message: string;
  data: T;
}

interface ErrorBody {
  status: number;
  message: string;
  data: {
    detail: string | string[];
  };
}

describe("HealthController (e2e)", () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(() => {
    process.env.AUTHZ_ROUTE_SYNC_ENABLED = "false";
    process.env.AUTHZ_ENFORCEMENT_ENABLED = "false";
    process.env.AUTHZ_STRICT_MODE = "false";
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  it("/health (GET)", async () => {
    const response = await request(httpServer).get("/health").expect(200);
    const body = response.body as SuccessBody<HealthPayload>;

    expect(body).toMatchObject({
      status: 200,
      error: null,
      message: "Ki\u1ec3m tra h\u1ec7 th\u1ed1ng th\u00e0nh c\u00f4ng",
    });
    expect(body.data).toMatchObject({
      status: "ok",
      service: "auth-service",
    });
    expect(typeof body.data.uptimeSeconds).toBe("number");
    expect(body.data.timestamp).toEqual(expect.any(String));
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
  });

  it("returns standard error shape for unknown route", async () => {
    const response = await request(httpServer).get("/not-found").expect(404);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      status: 404,
      message: "NOT_FOUND",
      data: {
        detail: "Cannot GET /not-found",
      },
    });
  });

  it("/auth/me rejects missing bearer token", async () => {
    const response = await request(httpServer).get("/auth/me").expect(401);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      status: 401,
      message: "UNAUTHORIZED",
      data: {
        detail: "No auth token",
      },
    });
  });

  it("/roles rejects missing bearer token", async () => {
    const response = await request(httpServer).get("/roles").expect(401);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      status: 401,
      message: "UNAUTHORIZED",
      data: {
        detail: "No auth token",
      },
    });
  });

  it("/roles/me/permission-modules rejects missing bearer token", async () => {
    const response = await request(httpServer).get("/roles/me/permission-modules").expect(401);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      status: 401,
      message: "UNAUTHORIZED",
      data: {
        detail: "No auth token",
      },
    });
  });

  it("/roles/me/permission-modules/:moduleKey/permissions rejects missing bearer token", async () => {
    const response = await request(httpServer)
      .get("/roles/me/permission-modules/users/permissions")
      .expect(401);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      status: 401,
      message: "UNAUTHORIZED",
      data: {
        detail: "No auth token",
      },
    });
  });

  it("/roles/:roleId/modules/:moduleKey/permissions/grant rejects missing bearer token", async () => {
    const response = await request(httpServer)
      .post("/roles/role-1/modules/users/permissions/grant")
      .send({ permissionIds: ["permission-1"] })
      .expect(401);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      status: 401,
      message: "UNAUTHORIZED",
      data: {
        detail: "No auth token",
      },
    });
  });

  it("/roles/:roleId/modules/:moduleKey/permissions/revoke rejects missing bearer token", async () => {
    const response = await request(httpServer)
      .post("/roles/role-1/modules/users/permissions/revoke")
      .send({ permissionIds: ["permission-1"] })
      .expect(401);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      status: 401,
      message: "UNAUTHORIZED",
      data: {
        detail: "No auth token",
      },
    });
  });

  it("/permissions rejects missing bearer token", async () => {
    const response = await request(httpServer).get("/permissions").expect(401);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      status: 401,
      message: "UNAUTHORIZED",
      data: {
        detail: "No auth token",
      },
    });
  });

  it("/hotel-users rejects missing bearer token", async () => {
    const response = await request(httpServer).get("/hotel-users").expect(401);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      status: 401,
      message: "UNAUTHORIZED",
      data: {
        detail: "No auth token",
      },
    });
  });

  it("/tenant-owners rejects missing bearer token", async () => {
    const response = await request(httpServer).get("/tenant-owners").expect(401);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      status: 401,
      message: "UNAUTHORIZED",
      data: {
        detail: "No auth token",
      },
    });
  });

  it("/tenant-owners/:id rejects missing bearer token", async () => {
    const response = await request(httpServer).get("/tenant-owners/user-1").expect(401);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      status: 401,
      message: "UNAUTHORIZED",
      data: {
        detail: "No auth token",
      },
    });
  });

  it("/tenant-owners create rejects missing bearer token", async () => {
    const response = await request(httpServer)
      .post("/tenant-owners")
      .send({
        owner: {
          fullName: "Tenant Owner",
          email: "owner@example.com",
          password: "ChangeMe123!",
        },
        tenant: {
          code: "RIVERSIDE",
          name: "Riverside Hotel Group",
        },
      })
      .expect(401);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      status: 401,
      message: "UNAUTHORIZED",
      data: {
        detail: "No auth token",
      },
    });
  });

  it("/tenant-owners update rejects missing bearer token", async () => {
    const response = await request(httpServer)
      .patch("/tenant-owners/user-1")
      .send({ owner: { fullName: "Updated Owner" } })
      .expect(401);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      status: 401,
      message: "UNAUTHORIZED",
      data: {
        detail: "No auth token",
      },
    });
  });

  it("/auth/refresh rejects malformed refresh token", async () => {
    const response = await request(httpServer)
      .post("/auth/refresh")
      .send({ refreshToken: "invalid-token" })
      .expect(401);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      status: 401,
      message: "AUTH_REFRESH_INVALID",
      data: {
        detail: "Invalid refresh token",
      },
    });
  });

  it("/auth/refresh validates missing refreshToken", async () => {
    const response = await request(httpServer).post("/auth/refresh").send({}).expect(400);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      status: 400,
      message: "VALIDATION_ERROR",
      data: {
        detail: "refreshToken: refreshToken l\u00e0 b\u1eaft bu\u1ed9c",
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
