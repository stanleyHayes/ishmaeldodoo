// @vitest-environment node

import { describe, expect, it } from "vitest";
import { model, type HydratedDocument } from "mongoose";
import { sessionSchema } from "./models";

type SessionShape = Readonly<{
  sessionId: string;
  familyId: string;
  userId: string;
  roles: readonly string[];
  roleVersion: number;
  currentRefreshHash: string;
  csrfHash: string;
  authenticationMethods: readonly string[];
  expiresAt: Date;
}>;

const TestSessionModel = model<SessionShape>(
  "AuthenticationMethodTestSession",
  sessionSchema,
);

const session = (
  authenticationMethods: readonly string[],
): HydratedDocument<SessionShape> =>
  new TestSessionModel({
    sessionId: crypto.randomUUID(),
    familyId: crypto.randomUUID(),
    userId: "user-1",
    roles: ["editor"],
    roleVersion: 1,
    currentRefreshHash: "refresh-hash",
    csrfHash: "csrf-hash",
    authenticationMethods,
    expiresAt: new Date(Date.now() + 60_000),
  });

describe("authentication session persistence", () => {
  it("accepts the canonical methods and rejects unknown, duplicate or empty lists", async () => {
    await expect(session(["pwd", "totp"]).validate()).resolves.toBeUndefined();
    await expect(session(["pwd", "webauthn"]).validate()).rejects.toThrow();
    await expect(session(["pwd", "pwd"]).validate()).rejects.toThrow();
    await expect(session([]).validate()).rejects.toThrow();
  });
});
