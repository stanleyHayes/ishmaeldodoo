import { afterEach, describe, expect, it, vi } from "vitest";
import { pressKitHtml, PressKitService } from "./press-kit.service";

const identity = {
  legalName: "Example Legal Name",
  honorific: "Dr.",
  displayName: "Example Display Name",
  pronunciationGuide: "EX-am-pul",
  bio40: "Short approved biography.",
  bio120: "Medium approved biography.",
  bio300: "Long approved biography.",
  portraits: [],
  titleHistory: [
    {
      title: "Current role",
      longFormTitle: "Current role at Current institution",
      organisation: "Current institution",
      from: new Date("2025-01-01"),
      to: null,
      sourceRef: "source-current",
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("PressKitService", () => {
  it.each(["pdf", "zip"] as const)(
    "generates and logs an immediate %s download",
    async (format) => {
      const record = vi.fn().mockResolvedValue(undefined);
      const service = new PressKitService(
        {
          publicProjection: vi.fn().mockResolvedValue({ payload: identity }),
        } as never,
        { publicAsset: vi.fn() } as never,
        { record } as never,
        { render: vi.fn().mockResolvedValue(Buffer.from("%PDF-browser")) },
      );
      const result = await service.generate(
        {
          requesterName: "Reporter",
          outlet: "Example News",
          email: "REPORTER@example.test",
          locale: "en-GB",
          format,
        },
        new Date("2026-08-09T12:00:00Z"),
      );
      expect(result.contentType).toBe(
        format === "pdf" ? "application/pdf" : "application/zip",
      );
      expect(result.body.subarray(0, 2).toString()).toBe(
        format === "pdf" ? "%P" : "PK",
      );
      expect(result.filename).toBe(`amanor-press-kit-2026-08-09.${format}`);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          outlet: "Example News",
          email: "reporter@example.test",
          format,
        }),
      );
    },
  );

  it("never fetches a lookalike Cloudinary host for a ZIP portrait", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new PressKitService(
      {
        publicProjection: vi.fn().mockResolvedValue({
          payload: {
            ...identity,
            portraits: ["11111111-1111-4111-8111-111111111111"],
          },
        }),
      } as never,
      {
        publicAsset: vi.fn().mockResolvedValue({
          resourceType: "image",
          secureUrl: "https://evilcloudinary.com/private/portrait.jpg",
          format: "jpg",
        }),
      } as never,
      { record: vi.fn().mockResolvedValue(undefined) } as never,
      { render: vi.fn().mockResolvedValue(Buffer.from("%PDF-browser")) },
    );

    const result = await service.generate({
      requesterName: "Reporter",
      outlet: "Example News",
      email: "reporter@example.test",
      locale: "en-GB",
      format: "zip",
    });

    expect(result.contentType).toBe("application/zip");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches an exact Cloudinary portrait without following redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
    });
    vi.stubGlobal("fetch", fetchMock);
    const secureUrl =
      "https://res.cloudinary.com/demo/image/upload/v1/portrait.jpg";
    const service = new PressKitService(
      {
        publicProjection: vi.fn().mockResolvedValue({
          payload: {
            ...identity,
            portraits: ["11111111-1111-4111-8111-111111111111"],
          },
        }),
      } as never,
      {
        publicAsset: vi.fn().mockResolvedValue({
          resourceType: "image",
          secureUrl,
          format: "jpg",
        }),
      } as never,
      { record: vi.fn().mockResolvedValue(undefined) } as never,
      { render: vi.fn().mockResolvedValue(Buffer.from("%PDF-browser")) },
    );

    await service.generate({
      requesterName: "Reporter",
      outlet: "Example News",
      email: "reporter@example.test",
      locale: "en-GB",
      format: "zip",
    });

    expect(fetchMock).toHaveBeenCalledWith(new URL(secureUrl), {
      redirect: "error",
      signal: expect.any(AbortSignal),
    });
  });

  it("builds escaped dedicated print HTML with its trace reference", () => {
    const html = pressKitHtml(
      identity,
      identity.titleHistory[0]!,
      "<News & Co>",
      "en-GB",
      new Date("2026-08-09"),
      "reference-1",
    );
    expect(html).toContain("@page{size:A4");
    expect(html).toContain("&lt;News &amp; Co&gt;");
    expect(html).toContain("reference-1");
  });
});
