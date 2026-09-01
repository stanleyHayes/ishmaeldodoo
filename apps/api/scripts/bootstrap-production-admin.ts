/**
 * One-shot production administrator bootstrap.
 *
 * This exists only to establish the first governed operator account. It fails
 * closed when any user already exists, never grants Principal or Room access,
 * hashes the generated password with the application policy, and appends the
 * creation to the authentication integrity chain in the same transaction.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { appendFile, chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { MongoClient } from "mongodb";
import { hashPassword } from "../src/modules/auth/domain/password";
import {
  assertSafeSecurityEvent,
  securityEventHash,
  type SecurityEvent,
} from "../src/modules/auth/application/security-event";
import type { Role } from "../src/modules/auth/domain/roles";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(scriptDirectory, "../.env.production") });

const bootstrapEmail = "admin@theamanorproject.org";
const confirmation = process.env.AMANOR_BOOTSTRAP_CONFIRM;
const mongoUri = process.env.MONGODB_URI;
const credentialOutput = process.env.AMANOR_CREDENTIAL_OUTPUT;

if (process.env.NODE_ENV !== "production")
  throw new Error("NODE_ENV=production is required");
if (confirmation !== bootstrapEmail)
  throw new Error(`AMANOR_BOOTSTRAP_CONFIRM must equal ${bootstrapEmail}`);
if (!mongoUri) throw new Error("MONGODB_URI is required");

const bootstrapRoles: readonly Role[] = [
  "desk_officer",
  "editor",
  "translator",
  "reviewer",
  "press_officer",
  "trust_admin",
  "security_admin",
];

async function bootstrapProductionAdministrator(): Promise<void> {
  const password =
    process.env.AMANOR_BOOTSTRAP_PASSWORD ??
    `${randomBytes(24).toString("base64url")}!7aA`;
  const userId = randomUUID();
  const now = new Date();
  const passwordHash = await hashPassword(password);
  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 10_000,
  });

  await client.connect();
  try {
    const database = client.db();
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const existingUsers = await database
          .collection("users")
          .countDocuments({}, { limit: 1, session });
        if (existingUsers !== 0)
          throw new Error(
            "Bootstrap refused because an administrator account already exists",
          );

        await database.collection("users").insertOne(
          {
            userId,
            emailCanonical: bootstrapEmail,
            passwordHash,
            roles: bootstrapRoles,
            roleVersion: 1,
            invitationAcceptedAt: now,
            passwordChangedAt: now,
            createdAt: now,
            updatedAt: now,
            __v: 0,
          },
          { session },
        );

        const head = await database
          .collection<{ _id: string; eventHash: string; sequence: number }>(
            "auth_event_chain",
          )
          .findOne({ _id: "global" }, { session });
        const previousEventHash = head?.eventHash;
        const chainSequence = (head?.sequence ?? 0) + 1;
        const event: SecurityEvent = {
          eventId: randomUUID(),
          type: "invitation_accepted",
          subjectId: userId,
          occurredAt: now,
          outcome: "success",
          reason: "initial_operator_bootstrap",
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

    if (credentialOutput) {
      const outputPath = resolve(credentialOutput);
      await appendFile(
        outputPath,
        `\nAMANOR production administrator\nEmail: ${bootstrapEmail}\nPassword: ${password}\nCreated: ${now.toISOString()}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      await chmod(outputPath, 0o600);
    }

    process.stdout.write(
      JSON.stringify({
        created: true,
        email: bootstrapEmail,
        roles: bootstrapRoles,
        credentialWritten: Boolean(credentialOutput),
      }) + "\n",
    );
  } finally {
    await client.close();
  }
}

void bootstrapProductionAdministrator().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Production administrator bootstrap failed"}\n`,
  );
  process.exitCode = 1;
});
