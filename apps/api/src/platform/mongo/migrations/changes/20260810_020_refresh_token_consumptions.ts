import type { MongoMigration } from "../types";

type LegacySession = Readonly<{
  sessionId: string;
  familyId: string;
  consumedRefreshHashes?: readonly string[];
  expiresAt: Date;
  rotatedAt?: Date;
  createdAt?: Date;
}>;

export const refreshTokenConsumptionsMigration: MongoMigration = {
  id: "20260810_020_refresh_token_consumptions",
  description:
    "Move bounded session refresh history into a complete TTL-backed replay ledger",
  async up(db) {
    const sessions = await db
      .collection<LegacySession>("sessions")
      .find(
        { "consumedRefreshHashes.0": { $exists: true } },
        {
          projection: {
            _id: 0,
            sessionId: 1,
            familyId: 1,
            consumedRefreshHashes: 1,
            expiresAt: 1,
            rotatedAt: 1,
            createdAt: 1,
          },
        },
      )
      .toArray();
    const consumptions = db.collection("refresh_token_consumptions");
    const operations = sessions.flatMap((session) =>
      (session.consumedRefreshHashes ?? []).map((tokenHash) => ({
        updateOne: {
          filter: { sessionId: session.sessionId, tokenHash },
          update: {
            $setOnInsert: {
              sessionId: session.sessionId,
              familyId: session.familyId,
              tokenHash,
              consumedAt: session.rotatedAt ?? session.createdAt ?? new Date(0),
              expiresAt: session.expiresAt,
            },
          },
          upsert: true,
        },
      })),
    );
    if (operations.length) await consumptions.bulkWrite(operations);
    await consumptions.createIndex(
      { sessionId: 1, tokenHash: 1 },
      { unique: true },
    );
    await consumptions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await consumptions.createIndex({ familyId: 1, consumedAt: -1 });
    await db
      .collection("sessions")
      .updateMany(
        { consumedRefreshHashes: { $exists: true } },
        { $unset: { consumedRefreshHashes: "" } },
      );
  },
};
