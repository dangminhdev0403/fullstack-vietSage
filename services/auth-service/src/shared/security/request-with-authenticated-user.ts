import type { Request } from "express";
import type { AuthenticatedUser } from "./authenticated-user";

export interface RequestWithAuthenticatedUser extends Request {
  user?: AuthenticatedUser;
}

export interface RequestWithRequiredUser extends Request {
  user: AuthenticatedUser;
}
