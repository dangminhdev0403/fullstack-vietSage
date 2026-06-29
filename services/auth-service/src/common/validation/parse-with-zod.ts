import { BadRequestException } from "@nestjs/common";
import { type ZodType } from "zod";

export interface ZodValidationIssue {
  path: ReadonlyArray<PropertyKey>;
  message: string;
}

export interface ZodValidationMeta {
  issues: ZodValidationIssue[];
  payload: unknown;
}

interface ZodTaggedBadRequest extends BadRequestException {
  __zodValidation?: ZodValidationMeta;
}

export function parseWithZod<T>(schema: ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (result.success) {
    return result.data;
  }

  const issue = result.error.issues[0];
  const exception = new BadRequestException(
    issue?.message ?? "Request validation failed",
  ) as ZodTaggedBadRequest;

  exception.__zodValidation = {
    issues: result.error.issues,
    payload,
  };

  throw exception;
}
