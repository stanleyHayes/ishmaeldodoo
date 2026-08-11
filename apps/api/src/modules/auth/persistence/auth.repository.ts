import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection, Model } from "mongoose";
import type { Role } from "../domain/roles";
import type { Session } from "../domain/session";
import type { SessionRepository } from "../application/rotate-session";
import type { EncryptedMfaSecret } from "../domain/mfa";
import {
  authenticationMethodListIsValid,
  type AuthenticationMethod,
} from "../domain/authentication-method";
import { authEventSchema, sessionSchema, userSchema } from "./models";
import {
  assertSafeSecurityEvent,
  securityEventHash,
  type SecurityEvent,
} from "../application/security-event";

export type AuthUser = Readonly<{
  userId: string;
  emailCanonical: string;
  passwordHash: string;
  roles: readonly Role[];
  roleVersion: number;
  disabledAt?: Date;
  invitedAt?: Date;
  invitationAcceptedAt?: Date;
  invitationTokenHash?: string;
  invitationExpiresAt?: Date;
  mfa?: Readonly<{
    encryptedSecret: string;
    iv: string;
    authTag: string;
    recoveryCodeHashes?: readonly string[];
    enrolledAt?: Date;
  }>;
}>;

export type SessionSummary = Readonly<{
  sessionId: string;
  familyId: string;
  authenticationMethods: readonly AuthenticationMethod[];
  createdAt: Date;
  rotatedAt?: Date;
  expiresAt: Date;
  revokedAt?: Date;
}>;

export type AdministratorSummary = Readonly<{
  userId: string;
  emailCanonical: string;
  roles: readonly Role[];
  roleVersion: number;
  disabledAt?: Date;
  invitedAt?: Date;
  invitationAcceptedAt?: Date;
}>;

export type AuthenticationAuditItem = Readonly<{
  eventId: string;
  type: SecurityEvent["type"];
  actorId?: string;
  subjectId?: string;
  occurredAt: Date;
  outcome: SecurityEvent["outcome"];
  reason?: string;
}>;

export type AuthenticationAuditPage = Readonly<{
  items: readonly AuthenticationAuditItem[];
  nextCursor?: string;
}>;
export type AuthenticationAuditIntegrity = Readonly<{
  status: "valid" | "invalid" | "incomplete";
  checkedEvents: number;
  headHash?: string;
}>;

export type MfaCiphertextRecord = Readonly<{
  encryptedSecret: string;
  iv: string;
  authTag: string;
}>;

type SessionDocument = Session & { rotatedAt?: Date };

@Injectable()
export class AuthRepository implements SessionRepository {
  private readonly users: Model<AuthUser>;
  private readonly sessions: Model<SessionDocument>;
  private readonly events: Model<SecurityEvent>;

  constructor(@InjectConnection() private readonly connection: Connection) {
    this.users =
      (connection.models.User as Model<AuthUser> | undefined) ??
      connection.model<AuthUser>("User", userSchema, "users");
    this.sessions =
      (connection.models.Session as Model<SessionDocument> | undefined) ??
      connection.model<SessionDocument>("Session", sessionSchema, "sessions");
    this.events =
      (connection.models.AuthEvent as Model<SecurityEvent> | undefined) ??
      connection.model<SecurityEvent>(
        "AuthEvent",
        authEventSchema,
        "auth_events",
      );
  }

  async findUserByEmail(emailCanonical: string): Promise<AuthUser | null> {
    return this.users
      .findOne({ emailCanonical })
      .select(
        "+passwordHash +mfa.encryptedSecret +mfa.iv +mfa.authTag +mfa.recoveryCodeHashes",
      )
      .lean<AuthUser>()
      .exec();
  }

  async findUserById(userId: string): Promise<AuthUser | null> {
    return this.users.findOne({ userId }).lean<AuthUser>().exec();
  }

  async findUserMfaById(userId: string): Promise<AuthUser | null> {
    return this.users
      .findOne({ userId })
      .select("+mfa.encryptedSecret +mfa.iv +mfa.authTag")
      .lean<AuthUser>()
      .exec();
  }

  async listUsers(limit = 100): Promise<readonly AdministratorSummary[]> {
    return this.users
      .find({})
      .select(
        "userId emailCanonical roles roleVersion disabledAt invitedAt invitationAcceptedAt",
      )
      .sort({ emailCanonical: 1 })
      .limit(limit)
      .lean<AdministratorSummary[]>()
      .exec();
  }

  async listMfaCiphertexts(
    limit: number,
  ): Promise<readonly MfaCiphertextRecord[]> {
    const users = await this.users
      .find({ "mfa.encryptedSecret": { $exists: true } })
      .select("+mfa.encryptedSecret +mfa.iv +mfa.authTag")
      .sort({ userId: 1 })
      .limit(limit)
      .lean<Pick<AuthUser, "mfa">[]>()
      .exec();
    return users.flatMap((user) =>
      user.mfa?.encryptedSecret
        ? [
            {
              encryptedSecret: user.mfa.encryptedSecret,
              iv: user.mfa.iv,
              authTag: user.mfa.authTag,
            },
          ]
        : [],
    );
  }

  async createInvitedUser(input: {
    userId: string;
    emailCanonical: string;
    passwordHash: string;
    roles: readonly Role[];
    invitationTokenHash: string;
    invitationExpiresAt: Date;
    invitedAt: Date;
    invitedBy: string;
    mfa: { encryptedSecret: string; iv: string; authTag: string };
  }): Promise<AdministratorSummary> {
    const created = await this.users.create(input);
    return {
      userId: created.userId,
      emailCanonical: created.emailCanonical,
      roles: created.roles,
      roleVersion: created.roleVersion,
      invitedAt: input.invitedAt,
    };
  }

  async findInvitationByHash(tokenHash: string): Promise<AuthUser | null> {
    return this.users
      .findOne({ invitationTokenHash: tokenHash })
      .select("+invitationTokenHash +mfa.encryptedSecret +mfa.iv +mfa.authTag")
      .lean<AuthUser>()
      .exec();
  }

  async acceptInvitation(input: {
    userId: string;
    invitationTokenHash: string;
    passwordHash: string;
    matchedMfaStep: number;
    recoveryCodeHashes?: readonly string[];
    acceptedAt: Date;
  }): Promise<boolean> {
    const result = await this.users.updateOne(
      {
        userId: input.userId,
        invitationTokenHash: input.invitationTokenHash,
        invitationExpiresAt: { $gt: input.acceptedAt },
        invitationAcceptedAt: { $exists: false },
      },
      {
        $set: {
          passwordHash: input.passwordHash,
          passwordChangedAt: input.acceptedAt,
          invitationAcceptedAt: input.acceptedAt,
          "mfa.enrolledAt": input.acceptedAt,
          "mfa.lastUsedStep": input.matchedMfaStep,
          "mfa.recoveryCodeHashes": input.recoveryCodeHashes ?? [],
        },
        $unset: { invitationTokenHash: "", invitationExpiresAt: "" },
      },
    );
    return result.modifiedCount === 1;
  }

  async updateUserRoles(
    userId: string,
    expectedRoleVersion: number,
    roles: readonly Role[],
  ): Promise<boolean> {
    const result = await this.users.updateOne(
      { userId, roleVersion: expectedRoleVersion },
      { $set: { roles }, $inc: { roleVersion: 1 } },
    );
    return result.modifiedCount === 1;
  }

  async setUserDisabled(
    userId: string,
    expectedRoleVersion: number,
    disabled: boolean,
    now: Date,
  ): Promise<boolean> {
    const update = disabled
      ? { $set: { disabledAt: now }, $inc: { roleVersion: 1 } }
      : { $unset: { disabledAt: "" }, $inc: { roleVersion: 1 } };
    const result = await this.users.updateOne(
      { userId, roleVersion: expectedRoleVersion },
      update,
    );
    return result.modifiedCount === 1;
  }

  async revokeSessionsForUser(
    userId: string,
    reason: string,
    revokedAt: Date,
  ): Promise<void> {
    await this.sessions.updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt, revokeReason: reason } },
    );
  }

  async createSession(session: Session): Promise<void> {
    await this.sessions.create(session);
  }

  async consumeMfaStep(userId: string, step: number): Promise<boolean> {
    const result = await this.users.updateOne(
      {
        userId,
        $or: [
          { "mfa.lastUsedStep": { $exists: false } },
          { "mfa.lastUsedStep": { $lt: step } },
        ],
      },
      { $set: { "mfa.lastUsedStep": step } },
    );
    return result.modifiedCount === 1;
  }

  async consumeRecoveryCode(
    userId: string,
    candidateHashes: readonly string[],
  ): Promise<boolean> {
    const result = await this.users.updateOne(
      { userId, "mfa.recoveryCodeHashes": { $in: candidateHashes } },
      { $pull: { "mfa.recoveryCodeHashes": { $in: candidateHashes } } },
    );
    return result.modifiedCount === 1;
  }

  async recoverWithCode(input: {
    userId: string;
    candidateHashes: readonly string[];
    emailCanonical: string;
    notificationId: string;
    occurredAt: Date;
  }): Promise<boolean> {
    const database = this.connection.db;
    if (!database) throw new Error("MongoDB is not connected");
    const transaction = await this.connection.startSession();
    let recovered = false;
    try {
      await transaction.withTransaction(async () => {
        const consumed = await this.users.updateOne(
          {
            userId: input.userId,
            disabledAt: { $exists: false },
            "mfa.recoveryCodeHashes": { $in: input.candidateHashes },
          },
          {
            $pull: {
              "mfa.recoveryCodeHashes": { $in: input.candidateHashes },
            },
          },
          { session: transaction },
        );
        if (consumed.modifiedCount !== 1) return;
        await this.sessions.updateMany(
          { userId: input.userId, revokedAt: { $exists: false } },
          {
            $set: {
              revokedAt: input.occurredAt,
              revokeReason: "mfa_recovery",
            },
          },
          { session: transaction },
        );
        await database.collection("auth_notification_jobs").insertOne(
          {
            notificationId: input.notificationId,
            userId: input.userId,
            emailCanonical: input.emailCanonical,
            type: "account_recovered",
            occurredAt: input.occurredAt,
            status: "pending",
            attempts: 0,
            availableAt: input.occurredAt,
            createdAt: input.occurredAt,
          },
          { session: transaction },
        );
        recovered = true;
      });
    } finally {
      await transaction.endSession();
    }
    return recovered;
  }

  async replaceRecoveryCodes(
    userId: string,
    recoveryCodeHashes: readonly string[],
  ): Promise<boolean> {
    const result = await this.users.updateOne(
      {
        userId,
        disabledAt: { $exists: false },
        "mfa.enrolledAt": { $exists: true },
      },
      { $set: { "mfa.recoveryCodeHashes": recoveryCodeHashes } },
    );
    return result.matchedCount === 1;
  }

  async replaceRecoveryCodesAndNotify(input: {
    userId: string;
    emailCanonical: string;
    recoveryCodeHashes: readonly string[];
    notificationId: string;
    occurredAt: Date;
  }): Promise<boolean> {
    const database = this.connection.db;
    if (!database) throw new Error("MongoDB is not connected");
    const transaction = await this.connection.startSession();
    let replaced = false;
    try {
      await transaction.withTransaction(async () => {
        const result = await this.users.updateOne(
          {
            userId: input.userId,
            disabledAt: { $exists: false },
            "mfa.enrolledAt": { $exists: true },
          },
          { $set: { "mfa.recoveryCodeHashes": input.recoveryCodeHashes } },
          { session: transaction },
        );
        if (result.matchedCount !== 1) return;
        await database.collection("auth_notification_jobs").insertOne(
          {
            notificationId: input.notificationId,
            userId: input.userId,
            emailCanonical: input.emailCanonical,
            type: "recovery_codes_rotated",
            occurredAt: input.occurredAt,
            status: "pending",
            attempts: 0,
            availableAt: input.occurredAt,
            createdAt: input.occurredAt,
          },
          { session: transaction },
        );
        replaced = true;
      });
    } finally {
      await transaction.endSession();
    }
    return replaced;
  }

  async rotateMfaEncryption(input: {
    userId: string;
    expected: EncryptedMfaSecret;
    next: EncryptedMfaSecret;
  }): Promise<boolean> {
    const result = await this.users.updateOne(
      {
        userId: input.userId,
        "mfa.encryptedSecret": input.expected.encryptedSecret,
        "mfa.iv": input.expected.iv,
        "mfa.authTag": input.expected.authTag,
      },
      {
        $set: {
          "mfa.encryptedSecret": input.next.encryptedSecret,
          "mfa.iv": input.next.iv,
          "mfa.authTag": input.next.authTag,
        },
      },
    );
    return result.modifiedCount === 1;
  }

  async findBySessionId(sessionId: string): Promise<Session | null> {
    const session = await this.sessions
      .findOne({ sessionId })
      .select("+currentRefreshHash +csrfHash")
      .lean<Session>()
      .exec();
    if (
      session &&
      !authenticationMethodListIsValid(session.authenticationMethods)
    )
      throw new Error("Stored session authentication methods are invalid");
    return session;
  }

  async wasRefreshHashConsumed(
    sessionId: string,
    tokenHash: string,
  ): Promise<boolean> {
    const database = this.connection.db;
    if (!database) throw new Error("MongoDB is not connected");
    return Boolean(
      await database
        .collection("refresh_token_consumptions")
        .findOne({ sessionId, tokenHash }, { projection: { _id: 1 } }),
    );
  }

  async rotate(input: {
    sessionId: string;
    familyId: string;
    expectedCurrentHash: string;
    nextHash: string;
    consumedHash: string;
    rotatedAt: Date;
    expiresAt: Date;
  }): Promise<boolean> {
    const database = this.connection.db;
    if (!database) throw new Error("MongoDB is not connected");
    const transaction = await this.connection.startSession();
    let rotated = false;
    try {
      await transaction.withTransaction(async () => {
        const result = await this.sessions.updateOne(
          {
            sessionId: input.sessionId,
            familyId: input.familyId,
            currentRefreshHash: input.expectedCurrentHash,
            expiresAt: input.expiresAt,
            revokedAt: { $exists: false },
          },
          {
            $set: {
              currentRefreshHash: input.nextHash,
              rotatedAt: input.rotatedAt,
            },
          },
          { session: transaction },
        );
        if (result.modifiedCount !== 1) return;
        await database.collection("refresh_token_consumptions").insertOne(
          {
            sessionId: input.sessionId,
            familyId: input.familyId,
            tokenHash: input.consumedHash,
            consumedAt: input.rotatedAt,
            expiresAt: input.expiresAt,
          },
          { session: transaction },
        );
        rotated = true;
      });
    } finally {
      await transaction.endSession();
    }
    return rotated;
  }

  async revokeFamily(
    familyId: string,
    reason: string,
    revokedAt: Date,
  ): Promise<void> {
    await this.sessions.updateMany(
      { familyId, revokedAt: { $exists: false } },
      { $set: { revokedAt, revokeReason: reason } },
    );
  }

  async listSessionsForUser(
    userId: string,
  ): Promise<readonly SessionSummary[]> {
    const sessions = await this.sessions
      .find({ userId })
      .select(
        "sessionId familyId authenticationMethods createdAt rotatedAt expiresAt revokedAt",
      )
      .sort({ createdAt: -1 })
      .lean<SessionSummary[]>()
      .exec();
    if (
      sessions.some(
        (session) =>
          !authenticationMethodListIsValid(session.authenticationMethods),
      )
    )
      throw new Error("Stored session authentication methods are invalid");
    return sessions;
  }

  async revokeUserSession(
    userId: string,
    sessionId: string,
    reason: string,
    revokedAt: Date,
  ): Promise<boolean> {
    const session = await this.sessions
      .findOne({ userId, sessionId })
      .select("familyId")
      .lean<{ familyId: string }>()
      .exec();
    if (!session) return false;
    await this.revokeFamily(session.familyId, reason, revokedAt);
    return true;
  }

  async appendEvent(event: SecurityEvent): Promise<void> {
    assertSafeSecurityEvent(event);
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const head = await this.connection.db
          ?.collection<{
            _id: string;
            eventHash: string;
            sequence: number;
          }>("auth_event_chain")
          .findOne({ _id: "global" }, { session });
        const previousEventHash = head?.eventHash;
        const chainSequence = (head?.sequence ?? 0) + 1;
        const chainedEvent = { ...event, chainSequence };
        const eventHash = securityEventHash(chainedEvent, previousEventHash);
        await this.events.create(
          [
            {
              ...chainedEvent,
              ...(previousEventHash ? { previousEventHash } : {}),
              eventHash,
            },
          ],
          { session },
        );
        await this.connection.db
          ?.collection<{
            _id: string;
            eventHash: string;
            eventId: string;
            sequence: number;
          }>("auth_event_chain")
          .updateOne(
            { _id: "global" },
            {
              $set: {
                eventHash,
                eventId: event.eventId,
                sequence: chainSequence,
              },
            },
            { upsert: true, session },
          );
      });
    } finally {
      await session.endSession();
    }
  }

  async listEvents(
    limit: number,
    cursor?: string,
  ): Promise<AuthenticationAuditPage> {
    const boundary = cursor ? this.decodeAuditCursor(cursor) : undefined;
    const documents = await this.events
      .find(
        boundary
          ? {
              $or: [
                { occurredAt: { $lt: boundary.occurredAt } },
                {
                  occurredAt: boundary.occurredAt,
                  eventId: { $lt: boundary.eventId },
                },
              ],
            }
          : {},
      )
      .select("eventId type actorId subjectId occurredAt outcome reason")
      .sort({ occurredAt: -1, eventId: -1 })
      .limit(limit + 1)
      .lean<AuthenticationAuditItem[]>()
      .exec();
    const hasMore = documents.length > limit;
    const items = documents.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      ...(hasMore && last
        ? {
            nextCursor: Buffer.from(
              `${last.occurredAt.toISOString()}|${last.eventId}`,
            ).toString("base64url"),
          }
        : {}),
    };
  }

  private decodeAuditCursor(cursor: string): {
    occurredAt: Date;
    eventId: string;
  } {
    try {
      const [rawDate, eventId, ...extra] = Buffer.from(cursor, "base64url")
        .toString("utf8")
        .split("|");
      const occurredAt = new Date(rawDate ?? "");
      if (
        !rawDate ||
        !eventId ||
        extra.length > 0 ||
        Number.isNaN(occurredAt.getTime()) ||
        !/^[A-Za-z0-9-]{1,128}$/u.test(eventId)
      )
        throw new Error("invalid");
      return { occurredAt, eventId };
    } catch {
      throw new BadRequestException("Authentication audit cursor is invalid");
    }
  }

  async verifyEventChain(
    maxEvents = 10_000,
  ): Promise<AuthenticationAuditIntegrity> {
    const events = await this.events
      .find({})
      .select(
        "eventId type actorId subjectId sessionId occurredAt ipHash userAgentFamily outcome reason previousEventHash eventHash chainSequence",
      )
      .sort({ chainSequence: 1 })
      .limit(maxEvents + 1)
      .lean<SecurityEvent[]>()
      .exec();
    if (events.length > maxEvents)
      return { status: "incomplete", checkedEvents: maxEvents };
    let previousEventHash: string | undefined;
    for (const [index, event] of events.entries()) {
      const expected = securityEventHash(event, previousEventHash);
      if (
        event.previousEventHash !== previousEventHash ||
        event.eventHash !== expected
      )
        return {
          status: "invalid",
          checkedEvents: index,
          ...(previousEventHash ? { headHash: previousEventHash } : {}),
        };
      previousEventHash = event.eventHash;
    }
    return {
      status: "valid",
      checkedEvents: events.length,
      ...(previousEventHash ? { headHash: previousEventHash } : {}),
    };
  }
}
