import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { loadAppConfig } from "../../../../common/config/env.config";
import { AuthService } from "../../application/authentication.service";

interface AccessTokenPayload {
  jti: string;
  sid: string;
  sub: string;
  email: string;
  roleId: string;
  type: "access";
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(private readonly authService: AuthService) {
    const config = loadAppConfig();
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.auth.jwtAccessSecret,
      issuer: config.auth.jwtIssuer,
      audience: config.auth.jwtAudience,
    });
  }

  async validate(payload: AccessTokenPayload) {
    return this.authService.validateJwtPayload(payload);
  }
}
