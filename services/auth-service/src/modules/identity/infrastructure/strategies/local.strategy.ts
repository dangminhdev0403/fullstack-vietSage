import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import { parseWithZod } from "../../../../common/validation/parse-with-zod";
import { AuthService } from "../../application/authentication.service";
import type { AuthenticatedUser } from "../../domain/authenticated-user";
import { loginCredentialsSchema } from "../../domain/schemas/auth.schema";

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, "local") {
  constructor(private readonly authService: AuthService) {
    super({
      usernameField: "email",
      passwordField: "password",
      session: false,
    });
  }

  async validate(email: string, password: string): Promise<AuthenticatedUser> {
    const credentials = parseWithZod(loginCredentialsSchema, { email, password });
    return this.authService.validateUser(credentials.email, credentials.password);
  }
}
