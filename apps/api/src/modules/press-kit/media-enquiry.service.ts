import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import type { MediaEnquiryDto } from "./media-enquiry.dto";

@Injectable()
export class MediaEnquiryService {
  constructor(@InjectConnection() private readonly connection: Connection) {}
  async accept(input: MediaEnquiryDto, now = new Date()): Promise<string> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    const reference = `ME-${now.getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    await this.connection.db.collection("media_enquiries").insertOne({
      reference,
      ...input,
      name: input.name.trim(),
      outlet: input.outlet.trim(),
      email: input.email.trim().toLowerCase(),
      subject: input.subject.trim(),
      message: input.message.trim(),
      deadline: input.deadline ? new Date(input.deadline) : undefined,
      status: "pending",
      attempts: 0,
      availableAt: now,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1_000),
    });
    return reference;
  }
}
