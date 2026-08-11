import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";

@Injectable()
export class RevalidationClaimRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async claim(idempotencyKey: string, now = new Date()): Promise<boolean> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    try {
      await this.connection.db.collection("revalidation_claims").insertOne({
        idempotencyKey,
        claimedAt: now,
        expiresAt: new Date(now.getTime() + 10 * 60 * 1_000),
      });
      return true;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      )
        return false;
      throw error;
    }
  }
}
