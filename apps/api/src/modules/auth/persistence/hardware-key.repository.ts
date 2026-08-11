import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection, Model } from "mongoose";
import { webAuthnChallengeSchema, webAuthnCredentialSchema } from "./models";

export type HardwareKeyCredential = Readonly<{
  credentialId: string;
  userId: string;
  webAuthnUserId: string;
  publicKey: Buffer;
  counter: number;
  transports: readonly string[];
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
  aaguid: string;
  label: string;
  createdAt: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
}>;

export type HardwareKeyCeremony = Readonly<{
  ceremonyId: string;
  userId: string;
  sessionId: string;
  purpose: "registration" | "authentication";
  challengeHash: string;
  expiresAt: Date;
  usedAt?: Date;
}>;

@Injectable()
export class HardwareKeyRepository {
  private readonly ceremonies: Model<HardwareKeyCeremony>;
  private readonly credentials: Model<HardwareKeyCredential>;

  constructor(@InjectConnection() connection: Connection) {
    this.ceremonies =
      (connection.models.WebAuthnChallenge as
        Model<HardwareKeyCeremony> | undefined) ??
      (connection.model(
        "WebAuthnChallenge",
        webAuthnChallengeSchema,
        "webauthn_challenges",
      ) as unknown as Model<HardwareKeyCeremony>);
    this.credentials =
      (connection.models.WebAuthnCredential as
        Model<HardwareKeyCredential> | undefined) ??
      (connection.model(
        "WebAuthnCredential",
        webAuthnCredentialSchema,
        "webauthn_credentials",
      ) as unknown as Model<HardwareKeyCredential>);
  }

  async createCeremony(input: HardwareKeyCeremony): Promise<void> {
    await this.ceremonies.updateMany(
      {
        userId: input.userId,
        sessionId: input.sessionId,
        purpose: input.purpose,
        usedAt: { $exists: false },
      },
      { $set: { usedAt: new Date() } },
    );
    await this.ceremonies.create(input);
  }

  async findCeremony(ceremonyId: string): Promise<HardwareKeyCeremony | null> {
    return this.ceremonies
      .findOne({ ceremonyId })
      .select("+challengeHash")
      .lean<HardwareKeyCeremony>()
      .exec();
  }

  async list(userId: string): Promise<readonly HardwareKeyCredential[]> {
    return this.credentials
      .find({ userId, revokedAt: { $exists: false } })
      .sort({ createdAt: 1 })
      .lean<HardwareKeyCredential[]>()
      .exec();
  }

  async find(
    userId: string,
    credentialId: string,
  ): Promise<HardwareKeyCredential | null> {
    const credential = await this.credentials
      .findOne({ userId, credentialId, revokedAt: { $exists: false } })
      .select("+publicKey")
      .exec();
    if (!credential) return null;
    const plain = credential.toObject() as HardwareKeyCredential;
    return { ...plain, publicKey: Buffer.from(credential.publicKey) };
  }

  async register(
    ceremony: HardwareKeyCeremony,
    credential: Omit<HardwareKeyCredential, "createdAt">,
    now: Date,
  ): Promise<boolean> {
    const session = await this.ceremonies.db.startSession();
    let committed = false;
    try {
      await session.withTransaction(async () => {
        const used = await this.ceremonies.updateOne(
          {
            ceremonyId: ceremony.ceremonyId,
            userId: ceremony.userId,
            sessionId: ceremony.sessionId,
            purpose: "registration",
            usedAt: { $exists: false },
            expiresAt: { $gt: now },
          },
          { $set: { usedAt: now } },
          { session },
        );
        if (used.modifiedCount !== 1) return;
        await this.credentials.create([credential], { session });
        committed = true;
      });
    } finally {
      await session.endSession();
    }
    return committed;
  }

  async authenticate(
    ceremony: HardwareKeyCeremony,
    credential: HardwareKeyCredential,
    nextCounter: number,
    now: Date,
  ): Promise<boolean> {
    const session = await this.ceremonies.db.startSession();
    let committed = false;
    try {
      await session.withTransaction(async () => {
        const used = await this.ceremonies.updateOne(
          {
            ceremonyId: ceremony.ceremonyId,
            userId: ceremony.userId,
            sessionId: ceremony.sessionId,
            purpose: "authentication",
            usedAt: { $exists: false },
            expiresAt: { $gt: now },
          },
          { $set: { usedAt: now } },
          { session },
        );
        if (used.modifiedCount !== 1) return;
        const updated = await this.credentials.updateOne(
          {
            credentialId: credential.credentialId,
            userId: credential.userId,
            counter: credential.counter,
            revokedAt: { $exists: false },
          },
          { $set: { counter: nextCounter, lastUsedAt: now } },
          { session },
        );
        if (updated.modifiedCount !== 1)
          throw new Error("Hardware-key counter changed concurrently");
        committed = true;
      });
    } finally {
      await session.endSession();
    }
    return committed;
  }

  async revoke(
    userId: string,
    credentialId: string,
    now: Date,
  ): Promise<boolean> {
    const result = await this.credentials.updateOne(
      { userId, credentialId, revokedAt: { $exists: false } },
      { $set: { revokedAt: now } },
    );
    return result.modifiedCount === 1;
  }
}
