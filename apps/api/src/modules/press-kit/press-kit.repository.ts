import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import type { Collection } from "mongodb";

export type PressKitRequest = Readonly<{
  requestId: string;
  requesterName: string;
  outlet: string;
  email: string;
  locale: "en-GB" | "fr-FR";
  format: "pdf" | "zip";
  generatedAt: Date;
  expiresAt: Date;
}>;

export type LivingDossierRequest = Readonly<{
  requestId: string;
  requesterName: string;
  organisation: string;
  email: string;
  purpose: string;
  locale: "en-GB" | "fr-FR";
  variant: "speaker" | "institutional" | "full";
  generatedAt: Date;
  expiresAt: Date;
}>;

@Injectable()
export class PressKitRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  private collection(): Collection<PressKitRequest> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    return this.connection.db.collection<PressKitRequest>("press_kit_requests");
  }

  async record(request: PressKitRequest): Promise<void> {
    await this.collection().insertOne(request);
  }

  async recordDossier(request: LivingDossierRequest): Promise<void> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    await this.connection.db
      .collection<LivingDossierRequest>("living_dossier_requests")
      .insertOne(request);
  }
}
