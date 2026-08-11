import { describe, expect, it, vi } from "vitest";
import { MediaEnquiryService } from "./media-enquiry.service";
describe("MediaEnquiryService", () => {
  it("stores a minimal durable receipt with normalized email and finite retention", async () => {
    const insertOne = vi.fn().mockResolvedValue(undefined);
    const service = new MediaEnquiryService({
      db: { collection: vi.fn().mockReturnValue({ insertOne }) },
    } as never);
    const now = new Date("2026-08-09T12:00:00Z");
    const reference = await service.accept(
      {
        name: "Reporter",
        outlet: "Example News",
        email: "REPORTER@example.test",
        subject: "Interview request",
        message: "This is a sufficiently detailed media enquiry.",
        locale: "en-GB",
      },
      now,
    );
    expect(reference).toMatch(/^ME-2026-/u);
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        reference,
        email: "reporter@example.test",
        status: "pending",
        availableAt: now,
        expiresAt: new Date("2027-02-05T12:00:00.000Z"),
      }),
    );
  });
});
