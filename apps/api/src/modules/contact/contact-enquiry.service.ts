import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import type { ContactEnquiryDto } from "./contact-enquiry.dto";

const retentionMilliseconds = 180 * 24 * 60 * 60 * 1_000;

@Injectable()
export class ContactEnquiryService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async accept(input: ContactEnquiryDto, now = new Date()): Promise<string> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    const reference = `GC-${now.getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    await this.connection.db.collection("contact_enquiries").insertOne({
      reference,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      ...(input.organisation?.trim()
        ? { organisation: input.organisation.trim() }
        : {}),
      category: input.category,
      subject: input.subject.trim(),
      message: input.message.trim(),
      locale: input.locale,
      privacyConsent: true,
      status: "pending",
      attempts: 0,
      availableAt: now,
      createdAt: now,
      expiresAt: new Date(now.getTime() + retentionMilliseconds),
    });
    return reference;
  }
}
