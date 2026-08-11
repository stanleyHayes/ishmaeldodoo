import type { Request } from "express";
import type { AccessTokenClaims } from "../domain/access-token";

export type AuthenticatedRequest = Request & { auth: AccessTokenClaims };
