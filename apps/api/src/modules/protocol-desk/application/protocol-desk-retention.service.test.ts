import { describe, expect, it, vi } from "vitest";
import {
  protocolDeskRetentionCutoff,
  ProtocolDeskRetentionService,
} from "./protocol-desk-retention.service";

describe("Protocol Desk retention", () => {
  it("uses the same UTC instant three calendar years earlier", () => {
    expect(
      protocolDeskRetentionCutoff(new Date("2026-08-10T10:15:30.250Z")),
    ).toEqual(new Date("2023-08-10T10:15:30.250Z"));
  });

  it("fails closed without the separately privileged retention database", async () => {
    await expect(
      new ProtocolDeskRetentionService({ db: undefined } as never).run(),
    ).rejects.toThrow(/retention database is unavailable/iu);
  });

  it("completes an empty bounded batch without opening a transaction", async () => {
    const findOneAndUpdate = vi.fn().mockResolvedValue(null);
    const connection = {
      db: { collection: vi.fn(() => ({ findOneAndUpdate })) },
      startSession: vi.fn(),
    };
    await expect(
      new ProtocolDeskRetentionService(connection as never).run(
        new Date("2026-08-10T10:00:00.000Z"),
      ),
    ).resolves.toEqual({ pseudonymised: 0, failed: 0 });
    expect(findOneAndUpdate).toHaveBeenCalledOnce();
    expect(connection.startSession).not.toHaveBeenCalled();
  });

  it("records a bounded delayed retry when transactional processing fails", async () => {
    const claimed = {
      _id: "expired-request",
      requestId: "PD-expired",
      flags: [],
    };
    const findOneAndUpdate = vi
      .fn()
      .mockResolvedValueOnce(claimed)
      .mockResolvedValueOnce(null);
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const connection = {
      db: {
        collection: vi.fn(() => ({ findOneAndUpdate, updateOne })),
      },
      startSession: vi.fn().mockRejectedValue(new Error("transaction failed")),
    };
    const now = new Date("2026-08-10T10:00:00.000Z");
    await expect(
      new ProtocolDeskRetentionService(connection as never).run(now),
    ).resolves.toEqual({ pseudonymised: 0, failed: 1 });
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "expired-request" }),
      expect.objectContaining({
        $set: expect.objectContaining({
          "retention.status": "failed",
          "retention.retryAt": new Date("2026-08-10T11:00:00.000Z"),
          "retention.lastError": "transaction failed",
        }),
      }),
    );
  });
});
