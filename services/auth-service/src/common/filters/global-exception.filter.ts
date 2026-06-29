import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { I18nService } from "../i18n/i18n.service";
import { AppLogger } from "../logging/app-logger.service";
import { isPrismaRecordNotFound } from "../prisma/prisma-record-not-found.util";

interface RequestWithId extends Request {
  requestId?: string;
}

type DetailValue = string | string[];

interface ErrorResponseBody {
  status: number;
  message: string;
  data?: {
    detail: DetailValue;
    field?: string;
    value?: string;
    fields?: string[];
    values?: Record<string, string>;
  };
}

interface ValidationIssue {
  path: ReadonlyArray<PropertyKey>;
  message: string;
}

interface ExtractedZodValidationMeta {
  issues: ValidationIssue[];
  payload: unknown;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly i18n = new I18nService();

  constructor(private readonly logger: AppLogger = new AppLogger()) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithId>();
    const response = ctx.getResponse<Response>();

    const payload = this.localizeErrorResponse(this.toErrorResponse(exception, request), request);
    this.logException(exception, host, request, payload);

    response.status(payload.status).json(payload);
  }

  private toErrorResponse(exception: unknown, request: RequestWithId): ErrorResponseBody {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handlePrismaKnownError(exception, request);
    }

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return this.makeResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        title: "PRISMA_CLIENT_INITIALIZATION_ERROR",
        detail: "Database initialization failed",
      });
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.error("PRISMA_CLIENT_VALIDATION_ERROR", {
        message: exception.message,
        stack: exception.stack,
      });

      return this.makeResponse({
        status: HttpStatus.BAD_REQUEST,
        title: "PRISMA_CLIENT_VALIDATION_ERROR",
        detail: "Invalid database request",
      });
    }
    if (exception instanceof BadRequestException) {
      return this.handleBadRequest(exception);
    }

    if (exception instanceof UnauthorizedException) {
      return this.handleUnauthorized(exception);
    }

    if (exception instanceof NotFoundException) {
      return this.handleNotFound(exception);
    }

    if (exception instanceof HttpException) {
      return this.handleHttpException(exception);
    }

    if (exception instanceof Error) {
      return this.makeResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        title: this.normalizeCode(exception.name),
        detail: "Internal server error",
      });
    }

    return this.makeResponse({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: "INTERNAL_SERVER_ERROR",
      detail: "Internal server error",
    });
  }

  private handlePrismaKnownError(
    exception: Prisma.PrismaClientKnownRequestError,
    request: RequestWithId,
  ): ErrorResponseBody {
    switch (exception.code) {
      case "P1000":
        return this.makeResponse({
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          title: "PRISMA_AUTHENTICATION_FAILED",
          detail: "Database authentication failed",
        });

      case "P2002": {
        const fields = this.uniqueFields(exception);
        const detail = fields.length
          ? fields.map((field) => `Duplicate value for field: ${field}`)
          : "Duplicate value";
        const duplicateValues = this.extractRequestFieldValues(request, fields);

        return this.makeResponse({
          status: HttpStatus.CONFLICT,
          title: "PRISMA_UNIQUE_CONSTRAINT_VIOLATION",
          detail,
          meta: this.buildDuplicateMeta(fields, duplicateValues),
        });
      }

      case "P2003":
        return this.makeResponse({
          status: HttpStatus.BAD_REQUEST,
          title: "PRISMA_FOREIGN_KEY_CONSTRAINT_VIOLATION",
          detail: "Foreign key constraint failed",
        });

      case "P2011":
        return this.makeResponse({
          status: HttpStatus.BAD_REQUEST,
          title: "PRISMA_NULL_CONSTRAINT_VIOLATION",
          detail: "A required database field is missing",
        });

      case "P2025":
        return this.makeResponse({
          status: HttpStatus.BAD_REQUEST,
          title: "RECORD_NOT_FOUND",
          detail: "Required record not found",
        });

      default:
        return this.makeResponse({
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          title: "PRISMA_CLIENT_KNOWN_REQUEST_ERROR",
          detail: "Database request failed",
        });
    }
  }

  private handleBadRequest(exception: BadRequestException): ErrorResponseBody {
    const zodMeta = this.extractZodValidationMeta(exception);

    if (zodMeta) {
      return this.makeResponse({
        status: HttpStatus.BAD_REQUEST,
        title: "VALIDATION_ERROR",
        detail: this.toZodIssueDetails(zodMeta.issues),
      });
    }

    const body = exception.getResponse();

    if (!this.isRecord(body)) {
      return this.makeResponse({
        status: HttpStatus.BAD_REQUEST,
        title: "BAD_REQUEST",
        detail: typeof body === "string" ? body : "Bad request",
      });
    }

    return this.makeResponse({
      status: HttpStatus.BAD_REQUEST,
      title: "BAD_REQUEST",
      detail: this.extractDetailFromHttpBody(body) ?? "Bad request",
    });
  }

  private handleUnauthorized(exception: UnauthorizedException): ErrorResponseBody {
    const body = exception.getResponse();

    if (!this.isRecord(body)) {
      return this.makeResponse({
        status: HttpStatus.UNAUTHORIZED,
        title: "UNAUTHORIZED",
        detail: typeof body === "string" ? body : "Unauthorized",
      });
    }

    return this.makeResponse({
      status: HttpStatus.UNAUTHORIZED,
      title: "UNAUTHORIZED",
      detail: this.extractDetailFromHttpBody(body) ?? "Unauthorized",
    });
  }

  private handleNotFound(exception: NotFoundException): ErrorResponseBody {
    const body = exception.getResponse();

    if (!this.isRecord(body)) {
      return this.makeResponse({
        status: HttpStatus.NOT_FOUND,
        title: "NOT_FOUND",
        detail: exception.message || "Not found",
      });
    }

    return this.makeResponse({
      status: HttpStatus.NOT_FOUND,
      title: "NOT_FOUND",
      detail: this.extractDetailFromHttpBody(body) ?? "Not found",
    });
  }

  private handleHttpException(exception: HttpException): ErrorResponseBody {
    const status = exception.getStatus();
    const body = exception.getResponse();

    if (!this.isRecord(body)) {
      return this.makeResponse({
        status,
        title: this.resolveHttpExceptionTitle(exception, body),
        detail: typeof body === "string" ? body : "Request failed",
      });
    }

    return this.makeResponse({
      status,
      title: this.resolveHttpExceptionTitle(exception, body),
      detail: this.extractDetailFromHttpBody(body) ?? "Request failed",
    });
  }

  private makeResponse(params: {
    status: number;
    title: string;
    detail?: unknown;
    meta?: Omit<NonNullable<ErrorResponseBody["data"]>, "detail">;
  }): ErrorResponseBody {
    const normalizedDetail = this.normalizeDetail(params.detail);

    return {
      status: params.status,
      message: params.title,
      data:
        normalizedDetail === undefined
          ? undefined
          : { detail: normalizedDetail, ...(params.meta ?? {}) },
    };
  }

  private localizeErrorResponse(
    payload: ErrorResponseBody,
    request: RequestWithId,
  ): ErrorResponseBody {
    if (!payload.data) {
      return payload;
    }

    const locale = this.i18n.resolveLocale(request);
    const detail = this.i18n.translateDetail(payload.data.detail, locale);

    return {
      ...payload,
      data: { ...payload.data, detail },
    };
  }

  private normalizeDetail(detail: unknown): DetailValue | undefined {
    if (detail === undefined || detail === null) {
      return undefined;
    }

    if (Array.isArray(detail)) {
      const values = Array.from(
        new Set(
          detail
            .map((item) => this.detailItemToString(item))
            .filter((item): item is string => item !== undefined && item.length > 0),
        ),
      );

      if (!values.length) {
        return undefined;
      }

      return values.length === 1 ? values[0] : values;
    }

    if (typeof detail === "string") {
      const trimmed = detail.trim();
      return trimmed.length ? trimmed : undefined;
    }

    if (typeof detail === "number" || typeof detail === "boolean" || typeof detail === "bigint") {
      return String(detail);
    }

    if (typeof detail === "symbol") {
      return detail.toString();
    }

    if (detail instanceof Error) {
      return detail.message.trim() || detail.name;
    }

    if (this.isRecord(detail)) {
      return this.stringifyRecord(detail);
    }

    return undefined;
  }

  private detailItemToString(item: unknown): string | undefined {
    if (typeof item === "string") {
      const trimmed = item.trim();
      return trimmed.length ? trimmed : undefined;
    }

    if (typeof item === "number" || typeof item === "boolean" || typeof item === "bigint") {
      return String(item);
    }

    if (typeof item === "symbol") {
      return item.toString();
    }

    if (item instanceof Error) {
      return item.message.trim() || item.name;
    }

    if (this.isRecord(item)) {
      return this.stringifyRecord(item);
    }

    return undefined;
  }

  private stringifyRecord(value: Record<string, unknown>): string | undefined {
    try {
      const serialized = JSON.stringify(value);
      return serialized && serialized !== "{}" ? serialized : undefined;
    } catch {
      return "Invalid detail object";
    }
  }

  private extractDetailFromHttpBody(body: Record<string, unknown>): DetailValue | undefined {
    const message = body.message;

    if (Array.isArray(message)) {
      return this.normalizeDetail(message);
    }

    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }

    if (typeof body.error === "string" && body.error.trim().length > 0) {
      return body.error;
    }

    if (typeof body.detail === "string" || Array.isArray(body.detail)) {
      return this.normalizeDetail(body.detail);
    }

    return undefined;
  }

  private uniqueFields(exception: Prisma.PrismaClientKnownRequestError): string[] {
    const target = exception.meta?.target;
    if (Array.isArray(target)) return target.map(String);
    if (typeof target === "string") return [target];

    const fields = (exception.meta?.constraint as { fields?: unknown } | undefined)?.fields;
    if (Array.isArray(fields)) return fields.map(String);

    return [];
  }

  private extractRequestFieldValues(
    request: RequestWithId,
    fields: string[],
  ): Record<string, string> {
    if (!fields.length || !this.isRecord(request.body)) {
      return {};
    }

    const values: Record<string, string> = {};

    for (const field of fields) {
      const value = request.body[field];
      const normalizedValue = this.fieldValueToString(value);

      if (normalizedValue !== undefined) {
        values[field] = normalizedValue;
      }
    }

    return values;
  }

  private buildDuplicateMeta(
    fields: string[],
    values: Record<string, string>,
  ): Omit<NonNullable<ErrorResponseBody["data"]>, "detail"> | undefined {
    if (!fields.length) {
      return undefined;
    }

    if (fields.length === 1) {
      const [field] = fields;
      return {
        field,
        ...(values[field] !== undefined ? { value: values[field] } : {}),
      };
    }

    return {
      fields,
      ...(Object.keys(values).length > 0 ? { values } : {}),
    };
  }

  private fieldValueToString(value: unknown): string | undefined {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }

    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      return String(value);
    }

    return undefined;
  }

  private resolveHttpExceptionTitle(exception: HttpException, body: unknown): string {
    if (this.isRecord(body)) {
      const code = body.code;
      if (typeof code === "string" && code.trim().length > 0) {
        return this.normalizeCode(code);
      }

      const error = body.error;
      if (typeof error === "string" && error.trim().length > 0) {
        return this.normalizeCode(error);
      }
    }

    return this.normalizeCode(exception.name);
  }

  private normalizeCode(code: string): string {
    return code
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/\s+/g, "_")
      .toUpperCase()
      .replace(/_EXCEPTION$/, "");
  }

  private logException(
    exception: unknown,
    host: ArgumentsHost,
    request: RequestWithId,
    payload: ErrorResponseBody,
  ): void {
    const controller = this.resolveControllerName(host);
    const handler = this.resolveHandlerName(host);
    const validationIssues =
      exception instanceof BadRequestException
        ? (this.extractZodValidationMeta(exception)?.issues.map((issue) => ({
            field: this.pathToField(issue.path),
            message: issue.message,
          })) ?? this.extractHttpValidationIssues(exception))
        : undefined;
    const metadata = {
      module: this.resolveModuleName(controller),
      controller,
      service: this.resolveServiceName(controller),
      operation: handler,
      event: "HTTP_EXCEPTION",
      requestId: request.requestId ?? "n/a",
      method: request.method,
      url: request.originalUrl ?? request.url,
      exceptionType: this.resolveExceptionType(exception),
      errorCode: payload.message,
      httpStatus: payload.status,
      errorMessage: this.normalizeDetail(payload.data?.detail) ?? payload.message,
      rootCause: this.resolveRootCause(exception),
      validationIssues,
      stackTrace: exception instanceof Error ? exception.stack : undefined,
    };
    const message =
      payload.status === HttpStatus.BAD_REQUEST && validationIssues?.length
        ? `Validation failed for ${request.method} ${request.originalUrl ?? request.url}: ${validationIssues
            .map((issue) => `${issue.field} ${issue.message}`)
            .join("; ")}`
        : `Request failed in ${controller}.${handler}: ${payload.message}`;

    if (payload.status < 500 || isPrismaRecordNotFound(exception)) {
      this.logger.warn(message, metadata);
      return;
    }

    this.logger.error(message, metadata);
  }

  private resolveControllerName(host: ArgumentsHost): string {
    const context = host as ArgumentsHost & { getClass?: () => { name?: string } };
    return context.getClass?.()?.name ?? "UnknownController";
  }

  private resolveHandlerName(host: ArgumentsHost): string {
    const context = host as ArgumentsHost & { getHandler?: () => { name?: string } };
    return context.getHandler?.()?.name ?? "unknown";
  }

  private resolveModuleName(controller: string): string {
    return controller
      .replace(/Controller$/, "")
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase();
  }

  private resolveServiceName(controller: string): string {
    return controller.replace(/Controller$/, "Service");
  }

  private resolveExceptionType(exception: unknown): string {
    if (exception instanceof Error) {
      return exception.name;
    }

    return typeof exception;
  }

  private resolveRootCause(exception: unknown): string | undefined {
    if (!(exception instanceof Error)) {
      return undefined;
    }

    const cause = (exception as { cause?: unknown }).cause;
    if (cause instanceof Error) {
      return `${cause.name}: ${cause.message}`;
    }

    if (typeof cause === "string") {
      return cause;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return `Prisma ${exception.code}`;
    }

    return undefined;
  }

  private extractHttpValidationIssues(
    exception: BadRequestException,
  ): Array<{ field: string; message: string }> | undefined {
    const body = exception.getResponse();
    if (!this.isRecord(body) || !Array.isArray(body.message)) {
      return undefined;
    }

    const issues = body.message
      .map((message) => this.parseValidationMessage(message))
      .filter((issue): issue is { field: string; message: string } => issue !== undefined);

    return issues.length ? issues : undefined;
  }

  private parseValidationMessage(message: unknown): { field: string; message: string } | undefined {
    if (typeof message !== "string" || !message.trim()) {
      return undefined;
    }

    const [field] = message.trim().split(/\s+/, 1);
    return {
      field: field || "input",
      message,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private extractZodValidationMeta(
    exception: BadRequestException,
  ): ExtractedZodValidationMeta | undefined {
    const meta = (exception as { __zodValidation?: unknown }).__zodValidation;

    if (!this.isRecord(meta)) {
      return undefined;
    }

    const issues = meta.issues;
    if (!Array.isArray(issues)) {
      return undefined;
    }

    return {
      issues: issues as ValidationIssue[],
      payload: meta.payload,
    };
  }

  private toZodIssueDetails(issues: ValidationIssue[]): DetailValue {
    const details = issues.map((issue) => {
      const field = this.pathToField(issue.path);
      return `${field}: ${issue.message}`;
    });

    return this.normalizeDetail(details) ?? "Request validation failed";
  }

  private pathToField(path: ReadonlyArray<PropertyKey>): string {
    if (!path.length) {
      return "input";
    }

    return path
      .map((segment) => (typeof segment === "symbol" ? segment.toString() : String(segment)))
      .join(".");
  }
}
