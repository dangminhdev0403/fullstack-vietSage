import { NextResponse } from "next/server";

import { HttpError } from "@/core/http/http-error";

export function unauthorizedResponse() {
  return NextResponse.json(
    {
      status: 401,
      message: "UNAUTHORIZED",
      data: { detail: "Access token is required" },
    },
    { status: 401 },
  );
}

export function validationErrorResponse(detail: string) {
  return NextResponse.json(
    {
      status: 400,
      message: "VALIDATION_ERROR",
      data: { detail },
    },
    { status: 400 },
  );
}

export function httpErrorResponse(error: HttpError) {
  console.error(`[API_ADMIN_ERROR ${error.status}]`, {
    url: error.requestUrl,
    message: error.message,
    status: error.status,
    data: error.data,
  });
  return NextResponse.json(
    error.data ?? {
      status: error.status,
      message: error.message,
    },
    { status: error.status },
  );
}

export function unknownServerErrorResponse(error?: unknown) {
  if (error) {
    console.error("[API_ADMIN_UNHANDLED_ERROR]", error);
  }
  return NextResponse.json(
    {
      status: 500,
      message: "INTERNAL_SERVER_ERROR",
    },
    { status: 500 },
  );
}

export function successResponse<TData>(data: TData, status = 200, message = "OK") {
  return NextResponse.json(
    {
      status,
      error: null,
      message,
      data,
    },
    { status },
  );
}
