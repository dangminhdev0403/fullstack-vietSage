import { ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "@nestjs/passport";
import { parseWithZod } from "../../../../common/validation/parse-with-zod";
import { loginCredentialsSchema } from "../../domain/schemas/auth.schema";

@Injectable()
export class LocalAuthGuard extends AuthGuard("local") {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    request.body = parseWithZod(loginCredentialsSchema, request.body);
    return super.canActivate(context);
  }
}
