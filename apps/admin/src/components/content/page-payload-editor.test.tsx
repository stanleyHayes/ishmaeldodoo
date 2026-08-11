import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PagePayloadEditor } from "./page-payload-editor";

vi.mock("../../lib/api/client", () => ({
  listMediaAssets: vi.fn().mockResolvedValue({
    items: [
      {
        assetId: "00000000-0000-4000-8000-000000000001",
        publicId: "amanor/archive/field-image",
        resourceType: "image",
        altText: { "en-GB": "Governed field image" },
      },
    ],
  }),
}));

const localized = (value: string) => ({
  "en-GB": value,
  "fr-FR": `FR ${value}`,
  status: { "en-GB": "current", "fr-FR": "current" },
  sourceUpdatedAt: "2026-08-10T00:00:00.000Z",
});

afterEach(cleanup);

describe("PagePayloadEditor Record fields", () => {
  it("edits act metadata and creates governed claim, marginalia and quote fields", async () => {
    const onChange = vi.fn();
    render(
      <PagePayloadEditor
        rawValue={JSON.stringify({
          slug: "/record",
          title: localized("The Record"),
          summary: localized("Summary"),
          sections: [
            {
              key: "act-forest",
              heading: localized("The Forest"),
              body: localized("Opening"),
              sourceRefs: ["source-1"],
              recordAct: "forest",
              dateline: localized("Ghana · 1998"),
              fieldImage: "00000000-0000-4000-8000-000000000001",
              imageCaption: localized("Forest communities"),
              claims: [],
              marginalia: [],
            },
          ],
          seoTitle: localized("The Record"),
          seoDescription: localized("Description"),
          faqs: [],
          noIndex: false,
        })}
        readOnly={false}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Record act")).toHaveValue("forest");
    const fieldImage = screen.getByLabelText("Field image");
    expect(fieldImage.tagName).toBe("SELECT");
    await screen.findAllByRole("option", { name: /Governed field image/iu });
    expect(fieldImage).toHaveValue("00000000-0000-4000-8000-000000000001");
    fireEvent.click(screen.getByRole("button", { name: "Add claim" }));
    fireEvent.click(screen.getByRole("button", { name: "Add marginal note" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add verified pull quote" }),
    );
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(screen.queryByLabelText("Marginal note 1 image")).toBeNull();
  }, 15_000);

  it("uses governed selectors for page, section and marginalia images", async () => {
    render(
      <PagePayloadEditor
        rawValue={JSON.stringify({
          slug: "/record",
          title: localized("The Record"),
          summary: localized("Summary"),
          sections: [
            {
              key: "act-forest",
              body: localized("Opening"),
              sourceRefs: [],
              marginalia: [
                {
                  label: localized("Note"),
                  value: localized("Value"),
                  image: "00000000-0000-4000-8000-000000000001",
                  sourceRefs: [],
                },
              ],
            },
          ],
          seoTitle: localized("The Record"),
          seoDescription: localized("Description"),
          ogImage: "00000000-0000-4000-8000-000000000001",
          faqs: [],
          noIndex: false,
        })}
        readOnly={false}
        onChange={vi.fn()}
      />,
    );

    await screen.findAllByRole("option", { name: /Governed field image/iu });
    for (const label of ["Open Graph image", "Marginal note 1 image"]) {
      const picker = screen.getByLabelText(label);
      expect(picker.tagName).toBe("SELECT");
      expect(picker).toHaveValue("00000000-0000-4000-8000-000000000001");
    }
  }, 15_000);

  it("creates a governed bilingual FAQ entry", () => {
    const onChange = vi.fn();
    const view = render(
      <PagePayloadEditor
        rawValue={JSON.stringify({
          slug: "/privacy",
          title: localized("Privacy"),
          summary: localized("Summary"),
          sections: [
            { key: "opening", body: localized("Body"), sourceRefs: [] },
          ],
          seoTitle: localized("Privacy"),
          seoDescription: localized("Description"),
          noIndex: false,
          faqs: [],
        })}
        readOnly={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(view.getByRole("button", { name: "Add FAQ" }));
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('"faqs"'));
  });
});
