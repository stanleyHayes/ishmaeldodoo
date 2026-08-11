import { describe, expect, it, vi } from "vitest";
import { ContactEnquiryService } from "./contact-enquiry.service";

describe("ContactEnquiryService", () => {
  it("stores a normalized, purpose-limited record with finite retention", async () => {
    const insertOne = vi.fn().mockResolvedValue(undefined);
    const service = new ContactEnquiryService({
      db: { collection: vi.fn().mockReturnValue({ insertOne }) },
    } as never);
    const now = new Date("2026-08-10T12:00:00Z");
    const reference = await service.accept(
      {
        name: "  Ama Mensah  ",
        email: "AMA@example.test ",
        organisation: "  Public Value Lab ",
        category: "correction",
        subject: "  Correction request ",
        message: "  This is a sufficiently detailed correction request.  ",
        locale: "en-GB",
        privacyConsent: true,
      },
      now,
    );
    expect(reference).toMatch(/^GC-2026-/u);
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        reference,
        name: "Ama Mensah",
        email: "ama@example.test",
        organisation: "Public Value Lab",
        subject: "Correction request",
        privacyConsent: true,
        status: "pending",
        availableAt: now,
        expiresAt: new Date("2027-02-06T12:00:00.000Z"),
      }),
    );
  });
});
