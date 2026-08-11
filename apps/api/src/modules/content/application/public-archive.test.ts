import { describe, expect, it, vi } from "vitest";
import { CmsService } from "./cms.service";

const localized = (en: string, fr: string) => ({
  "en-GB": en,
  "fr-FR": fr,
  status: { "en-GB": "current", "fr-FR": "current" },
  sourceUpdatedAt: new Date("2026-08-01"),
});

describe("public Archive projection", () => {
  it("projects only the requested locale and preserves publication identity", async () => {
    const repository = {
      listPublicArchive: vi.fn().mockResolvedValue([
        {
          documentId: "speech-1",
          publishedAt: new Date("2026-08-09"),
          payload: {
            slug: "a-public-speech",
            title: localized("A public speech", "Un discours public"),
            type: "speech",
            date: new Date("2026-08-08"),
            transcriptStatus: "corrected",
          },
        },
      ]),
    };

    const result = await new CmsService(repository as never).listPublicArchive(
      "fr-FR",
      "discours",
      "speech",
    );
    expect(repository.listPublicArchive).toHaveBeenCalledWith(
      "fr-FR",
      "discours",
      "speech",
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        documentId: "speech-1",
        title: "Un discours public",
        publishedAt: new Date("2026-08-09"),
      }),
    ]);
    expect(result.translation).toEqual({
      stale: false,
      sourceUpdatedAt: new Date("2026-08-01"),
    });
  });
});
