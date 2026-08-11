import { ObjectId } from "mongodb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarSyncWorker } from "./calendar-sync.worker";
import { createRequest } from "../domain/engagement-request";

const configuration = {
  CALENDAR_API_URL: "https://adapter.example.test/events",
  CALENDAR_API_TOKEN: "calendar-token-with-at-least-thirty-two-bytes",
  CALENDAR_ID: "principal-calendar",
} as const;

function acceptedRequest() {
  const created = createRequest(
    {
      locale: "en-GB",
      capacity: "personal",
      organisation: { name: "Convenor", type: "academic", country: "GH" },
      requester: {
        name: "Ada Example",
        role: "Director",
        email: "ada@example.test",
      },
      engagement: {
        type: "keynote",
        eventName: "Sahel Futures Forum",
        startsAt: "2026-09-01T10:00:00.000Z",
        city: "Accra",
        country: "GH",
        format: "virtual",
        language: "english",
        audienceSize: 200,
        audienceDescription: "Regional policy and delivery leaders",
      },
      ask: {
        proposedTheme: "Institutional delivery",
        objective: "Share practical lessons across public institutions",
        recording: false,
      },
      logistics: {
        travel: "not_covered",
        invitationLetter: false,
        visaLetter: false,
        governmentProtocol: false,
        otherPrincipals: false,
        contactName: "Ada Example",
        contactPhone: "+233200000000",
      },
      consent: {
        dataProcessing: true,
        authorityToInvite: true,
        version: "2026-08",
      },
    },
    1,
  ).request;
  return { ...created, state: "accepted" as const };
}

function fixture(response: Response) {
  const job = {
    _id: new ObjectId(),
    syncId: "sync-1",
    requestId: "request-1",
    operation: "upsert" as const,
    status: "processing" as const,
    attempts: 1,
    availableAt: new Date(),
    createdAt: new Date(),
  };
  const findOneAndUpdate = vi
    .fn()
    .mockResolvedValueOnce(job)
    .mockResolvedValueOnce(null);
  const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
  const findOne = vi
    .fn()
    .mockResolvedValue({ ...acceptedRequest(), requestId: "request-1" });
  const database = {
    collection: vi.fn((name: string) =>
      name === "calendar_sync_jobs"
        ? { findOneAndUpdate, updateOne }
        : { findOne },
    ),
  };
  const config = {
    get: vi.fn((key: keyof typeof configuration) => configuration[key]),
    getOrThrow: vi.fn((key: keyof typeof configuration) => configuration[key]),
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  return {
    worker: new CalendarSyncWorker({ db: database } as never, config as never),
    updateOne,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("CalendarSyncWorker", () => {
  it("delivers an idempotent privacy-minimised event and records reconciliation evidence", async () => {
    const { worker, updateOne } = fixture(
      new Response(JSON.stringify({ eventId: "provider-event-1" }), {
        status: 200,
      }),
    );
    await worker.drain();
    expect(fetch).toHaveBeenCalledWith(
      configuration.CALENDAR_API_URL,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${configuration.CALENDAR_API_TOKEN}`,
          "Idempotency-Key": "protocol-desk:request-1",
        }),
      }),
    );
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(typeof request?.body).toBe("string");
    if (typeof request?.body !== "string")
      throw new Error("Expected serialized calendar event body");
    expect(request.body).not.toContain("ada@example.test");
    expect(updateOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "completed",
          providerEventId: "provider-event-1",
          payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        }),
      }),
    );
  });

  it("retains a bounded safe failure and schedules retry", async () => {
    const { worker, updateOne } = fixture(new Response(null, { status: 503 }));
    await worker.drain();
    expect(updateOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "failed",
          lastError: "Calendar adapter returned HTTP 503",
          availableAt: expect.any(Date),
        }),
        $unset: { lockedAt: "" },
      }),
    );
  });
});
