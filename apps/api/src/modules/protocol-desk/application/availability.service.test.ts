import { describe, expect, it, vi } from "vitest";
import { AvailabilityService } from "./availability.service";

const startsAt = new Date("2026-12-01T09:00:00.000Z");
const endsAt = new Date("2026-12-01T12:00:00.000Z");

function service() {
  const collections = {
    protocol_requests: {
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            requestId: "11111111-1111-4111-8111-111111111111",
            reference: "PD-2026-0041",
            state: "accepted",
            engagement: {
              eventName: "Confirmed forum",
              startsAt: new Date("2026-12-01T10:00:00.000Z"),
            },
          },
        ]),
      }),
    },
    publications: {
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { documentType: "blackout", documentId: "travel-1", version: 1 },
          { documentType: "blackout", documentId: "travel-1", version: 1 },
        ]),
      }),
    },
    content_versions: {
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            documentType: "blackout",
            documentId: "travel-1",
            version: 1,
            state: "published",
            payload: {
              startsAt: new Date("2026-12-01T08:00:00.000Z"),
              endsAt: new Date("2026-12-01T09:30:00.000Z"),
              reason: "travel",
              visibility: "unavailable",
              notes: "Must never be projected",
            },
          },
        ]),
      }),
    },
  };
  return new AvailabilityService({
    db: { collection: (name: keyof typeof collections) => collections[name] },
  } as never);
}

describe("AvailabilityService", () => {
  it("combines published blackouts and confirmed engagements without private notes", async () => {
    const result = await service().check(
      { startsAt, endsAt, excludeRequestId: crypto.randomUUID() },
      ["desk_officer"],
      new Date("2026-08-10T00:00:00.000Z"),
    );
    expect(result).toMatchObject({
      available: false,
      conflicts: [
        expect.objectContaining({ type: "blackout", reference: "travel-1" }),
        expect.objectContaining({
          type: "engagement",
          reference: "PD-2026-0041",
        }),
      ],
    });
    expect(JSON.stringify(result)).not.toContain("Must never be projected");
  });

  it("denies users without Desk permission", async () => {
    await expect(
      service().check({ startsAt, endsAt }, ["editor"]),
    ).rejects.toThrow(/operator role/u);
  });
});
