import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import { AuthService } from "../../application/authentication.service";
import type { AuthenticatedUser } from "../../domain/authenticated-user";

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
    return this.authService.validateUser(email, password);
  }
}
