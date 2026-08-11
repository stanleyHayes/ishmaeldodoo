import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { blackoutSchema } from "../../content/domain/schemas";
import type {
  ContentVersion,
  Publication,
} from "../../content/domain/workflow";
import { hasPermission, type Role } from "../../auth/domain/roles";
import type {
  ProtocolDeskAvailability,
  ProtocolDeskAvailabilityQuery,
} from "@amanor/contracts";
import type { EngagementRequest } from "../domain/engagement-request";

const confirmedStates = ["accepted", "contracted", "delivered"] as const;
const defaultEngagementDurationMs = 2 * 60 * 60 * 1_000;

@Injectable()
export class AvailabilityService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async check(
    query: ProtocolDeskAvailabilityQuery,
    roles: readonly Role[],
    now = new Date(),
  ): Promise<ProtocolDeskAvailability> {
    if (!hasPermission(roles, "desk:operate"))
      throw new Error("Protocol Desk operator role is required");
    const conflicts = await this.conflicts(query);
    return { available: conflicts.length === 0, checkedAt: now, conflicts };
  }

  async conflicts(
    query: ProtocolDeskAvailabilityQuery,
    session?: import("mongodb").ClientSession,
  ): Promise<ProtocolDeskAvailability["conflicts"]> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    const requestFilter: Record<string, unknown> = {
      state: { $in: confirmedStates },
      "engagement.startsAt": { $lt: query.endsAt },
      $expr: {
        $gt: [
          {
            $ifNull: [
              "$engagement.endsAt",
              {
                $dateAdd: {
                  startDate: "$engagement.startsAt",
                  unit: "hour",
                  amount: 2,
                },
              },
            ],
          },
          query.startsAt,
        ],
      },
      ...(query.excludeRequestId
        ? { requestId: { $ne: query.excludeRequestId } }
        : {}),
    };
    const [requests, publications] = await Promise.all([
      this.connection.db
        .collection<EngagementRequest>("protocol_requests")
        .find(requestFilter, session ? { session } : {})
        .toArray(),
      this.connection.db
        .collection<Publication>("publications")
        .find({ documentType: "blackout" }, session ? { session } : {})
        .toArray(),
    ]);
    const publicationPairs = publications.map((item) => ({
      documentId: item.documentId,
      version: item.version,
    }));
    const blackoutVersions = publicationPairs.length
      ? await this.connection.db
          .collection<ContentVersion>("content_versions")
          .find(
            {
              documentType: "blackout",
              state: "published",
              $or: publicationPairs,
            },
            session ? { session } : {},
          )
          .toArray()
      : [];
    const uniqueBlackouts = new Map<string, ContentVersion>();
    for (const item of blackoutVersions)
      uniqueBlackouts.set(`${item.documentId}:${item.version}`, item);
    const blackouts = [...uniqueBlackouts.values()]
      .map((item) => ({ item, parsed: blackoutSchema.safeParse(item.payload) }))
      .filter(
        (
          entry,
        ): entry is typeof entry & {
          parsed: {
            success: true;
            data: import("zod").output<typeof blackoutSchema>;
          };
        } =>
          entry.parsed.success &&
          entry.parsed.data.startsAt < query.endsAt &&
          entry.parsed.data.endsAt > query.startsAt,
      )
      .map(({ item, parsed }) => ({
        type: "blackout" as const,
        reference: item.documentId,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        reason: parsed.data.reason,
      }));
    return [
      ...blackouts,
      ...requests.map((request) => ({
        type: "engagement" as const,
        reference: request.reference,
        startsAt: request.engagement.startsAt,
        endsAt:
          request.engagement.endsAt ??
          new Date(
            request.engagement.startsAt.getTime() + defaultEngagementDurationMs,
          ),
        reason: request.engagement.eventName,
      })),
    ].sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  }
}
