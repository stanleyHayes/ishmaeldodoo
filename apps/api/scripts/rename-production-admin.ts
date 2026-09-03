/**
 * One-shot production administrator email change.
 *
 * The update is conditional on the expected current address, rejects a target
 * collision, and appends an integrity-chained authentication event in the same
 * transaction. Existing credentials, roles, MFA and sessions are unchanged.
 */
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { MongoClient } from "mongodb";
import {
  assertSafeSecurityEvent,
  securityEventHash,
  type SecurityEvent,
} from "../src/modules/auth/application/security-event";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(scriptDirectory, "../.env.production") });

const currentEmail = "admin@theamanorproject.org";
const replacementEmail = "admin@ishmaelniidodoo.com";
const confirmation = process.env.AMANOR_ADMIN_EMAIL_CHANGE_CONFIRM;
const mongoUri = process.env.MONGODB_URI;

if (process.env.NODE_ENV !== "production")
  throw new Error("NODE_ENV=production is required");
if (confirmation !== `${currentEmail}->${replacementEmail}`)
  throw new Error(
    `AMANOR_ADMIN_EMAIL_CHANGE_CONFIRM must equal ${currentEmail}->${replacementEmail}`,
  );
if (!mongoUri) throw new Error("MONGODB_URI is required");

async function renameProductionAdministrator(): Promise<void> {
  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 10_000,
  });
  await client.connect();

  try {
    const database = client.db();
    const session = client.startSession();
    let userId = "";

    try {
      await session.withTransaction(async () => {
        const target = await database
          .collection("users")
          .findOne({ emailCanonical: replacementEmail }, { session });
        if (target)
          throw new Error("Replacement administrator email already exists");

        const result = await database.collection("users").findOneAndUpdate(
          { emailCanonical: currentEmail },
          {
            $set: { emailCanonical: replacementEmail, updatedAt: new Date() },
          },
          { returnDocument: "after", session },
        );
        if (!result)
          throw new Error("Expected production administrator was not found");
        userId = String(result.userId);

        const now = new Date();
        const head = await database
          .collection<{ _id: string; eventHash: string; sequence: number }>(
            "auth_event_chain",
          )
          .findOne({ _id: "global" }, { session });
        const previousEventHash = head?.eventHash;
        const chainSequence = (head?.sequence ?? 0) + 1;
        const event: SecurityEvent = {
          eventId: randomUUID(),
          type: "user_email_changed",
          subjectId: userId,
          occurredAt: now,
          outcome: "success",
          reason: "owner_requested_identity_update",
          chainSequence,
        };
        assertSafeSecurityEvent(event);
        const eventHash = securityEventHash(event, previousEventHash);
        await database.collection("auth_events").insertOne(
          {
            ...event,
            ...(previousEventHash ? { previousEventHash } : {}),
            eventHash,
          },
          { session },
        );
        await database.collection("auth_event_chain").updateOne(
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

    process.stdout.write(
      JSON.stringify({ updated: true, email: replacementEmail, userId }) + "\n",
    );
  } finally {
    await client.close();
  }
}

void renameProductionAdministrator().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Administrator email change failed"}\n`,
  );
  process.exitCode = 1;
});
