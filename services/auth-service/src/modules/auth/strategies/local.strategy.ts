import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { AuthService } from "../auth.service";
import type { AuthenticatedUser } from "../interfaces/authenticated-user.interface";
import { loginCredentialsSchema } from "../schemas/auth.schema";

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
