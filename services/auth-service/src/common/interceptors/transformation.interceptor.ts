import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { map, Observable } from "rxjs";
import { Request } from "express";
import { I18nService } from "../i18n/i18n.service";
import { SUCCESS_MESSAGE_KEY } from "../../shared/decorators/success-message.decorator";

export class ResponseData<T> {
  status: number;
  error: T | null;
  message: string;
  data: T;

  constructor(status: number, error: T | null, message: string, data: T) {
    this.status = status;
    this.error = error == null ? null : error;
    this.message = message;
    this.data = data;
  }
}

export interface Response<T> {
  data: T;
}

@Injectable()
export class TransformationInterceptor<T> implements NestInterceptor<T, ResponseData<T>> {
  private readonly i18n = new I18nService();

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<ResponseData<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<{ statusCode: number }>();
    const status = response.statusCode;
    const locale = this.i18n.resolveLocale(request);
    const successMessage =
      this.reflector.get<string>(SUCCESS_MESSAGE_KEY, context.getHandler()) || "common.success";
    const translatedMessage = this.i18n.t(successMessage, locale);

    return next.handle().pipe(
      map((data: T) => {
        return new ResponseData<T>(status, null, translatedMessage, data);
      }),
    );
  }
}
