import { describe, expect, it, vi } from "vitest";
import { LivingDossierService } from "./living-dossier.service";

const identity = {
  displayName: "Example Display Name",
  pronunciationGuide: "EX-am-pul",
  bio120: "Approved medium biography.",
  bio300: "Approved complete biography.",
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
const atlas = [
  {
    label: "Accra",
    role: "Programme lead",
    institution: "Institution",
    country: "Ghana",
    startDate: new Date("2025-01-01"),
    endDate: null,
    outcomes: ["Delivered result"],
    portfolioValue: 20,
    currency: "GHS",
    valueYear: 2025,
    sourceRefs: ["source-atlas"],
  },
];
const pages = {
  record: {
    title: "The Record",
    summary: "Record summary",
    sections: [
      {
        heading: "Act one",
        body: "Verified narrative",
        sourceRefs: ["source-record"],
      },
    ],
  },
  speaking: {
    title: "Speaking",
    summary: "Speaking summary",
    sections: [
      {
        heading: "Theme",
        body: "Speaking content",
        sourceRefs: ["source-speaking"],
      },
    ],
  },
};

describe("LivingDossierService", () => {
  it.each([
    [
      "speaker",
      ["Speaking content"],
      ["Verified narrative", "Delivered result"],
    ],
    [
      "institutional",
      ["Delivered result"],
      ["Verified narrative", "Speaking content"],
    ],
    [
      "full",
      ["Verified narrative", "Speaking content", "Delivered result"],
      [],
    ],
  ] as const)(
    "assembles and logs the %s live-CMS variant",
    async (variant, included, excluded) => {
      const render = vi.fn().mockResolvedValue(Buffer.from("%PDF-browser"));
      const recordDossier = vi.fn().mockResolvedValue(undefined);
      const publicProjection = vi.fn((type: string, id: string) => {
        if (type === "identity") return { payload: identity };
        return { payload: pages[id as keyof typeof pages] };
      });
      const listPublicAtlas = vi
        .fn()
        .mockResolvedValue({ items: atlas, translation: { stale: false } });
      const service = new LivingDossierService(
        {
          publicProjection,
          listPublicAtlas,
        } as never,
        { render },
        { recordDossier } as never,
      );
      const result = await service.generate(
        {
          requesterName: "Requester",
          organisation: "<Partner & Co>",
          email: "PERSON@example.test",
          purpose: "Internal decision briefing",
          variant,
          locale: "en-GB",
        },
        new Date("2026-08-09T12:00:00Z"),
      );
      expect(result.body.toString()).toBe("%PDF-browser");
      expect(result.filename).toBe(`amanor-${variant}-dossier-2026-08-09.pdf`);
      const html = String(render.mock.calls[0]![0]);
      expect(html).toContain("@page{size:A4");
      expect(html).toContain("&lt;Partner &amp; Co&gt;");
      for (const expected of included) expect(html).toContain(expected);
      for (const unexpected of excluded) expect(html).not.toContain(unexpected);
      expect(recordDossier).toHaveBeenCalledWith(
        expect.objectContaining({
          organisation: "<Partner & Co>",
          email: "person@example.test",
          variant,
          requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
      );
      expect(html).toContain('class="watermark"');
      expect(html).toMatch(/[0-9a-f-]{36}/);
      expect(listPublicAtlas).toHaveBeenCalledTimes(
        variant === "speaker" ? 0 : 1,
      );
    },
  );

  it("fails closed when the Full Record cannot include every required live projection", async () => {
    const render = vi.fn();
    const service = new LivingDossierService(
      {
        publicProjection: vi.fn((type: string, id: string) => {
          if (type === "identity") return { payload: identity };
          if (id === "record") return { payload: pages.record };
          return null;
        }),
        listPublicAtlas: vi
          .fn()
          .mockResolvedValue({ items: atlas, translation: { stale: false } }),
      } as never,
      { render },
      { recordDossier: vi.fn() } as never,
    );

    await expect(
      service.generate({
        requesterName: "Requester",
        organisation: "Partner",
        email: "person@example.test",
        purpose: "Complete institutional briefing",
        variant: "full",
        locale: "en-GB",
      }),
    ).rejects.toThrow("The approved living dossier is not available");
    expect(render).not.toHaveBeenCalled();
  });
});
