import { UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { GlobalExceptionFilter } from "./global-exception.filter";

function createHost() {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = {
    requestId: "request-1",
    method: "POST",
    url: "/hotels/hotel-1/rooms/room-1/qr/activate",
    headers: { "accept-language": "en" },
  };

  return {
    response,
    host: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    },
  };
}

describe("GlobalExceptionFilter", () => {
  it("preserves stable auth error codes", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = createHost();

    filter.catch(
      new UnauthorizedException({
        code: "AUTH_REFRESH_INVALID",
        message: "Invalid refresh token",
      }),
      host as never,
    );

    expect(response.json.mock.calls[0][0]).toMatchObject({
      status: 401,
      message: "AUTH_REFRESH_INVALID",
      data: { detail: "Invalid refresh token" },
    });
  });

  it("does not expose raw Prisma record-not-found errors to API consumers", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = createHost();
    const error = new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "test",
    });

    filter.catch(error, host as never);

    const payload = response.json.mock.calls[0][0];
    const serialized = JSON.stringify(payload);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(payload).toMatchObject({
      status: 400,
      message: "RECORD_NOT_FOUND",
      data: { detail: "Required record not found" },
    });
    expect(serialized).not.toContain("PRISMA_RECORD_NOT_FOUND");
    expect(serialized).not.toContain("PrismaClientKnownRequestError");
    expect(serialized).not.toContain("P2025");
    expect(serialized).not.toContain("Record not found");
  });
});
