import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SchemaPayloadEditor } from "./schema-payload-editor";

const listMediaAssets = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    items: [
      {
        assetId: "00000000-0000-4000-8000-000000000001",
        publicId: "amanor/portraits/approved-profile",
        resourceType: "image",
        altText: { "en-GB": "Approved local portrait" },
      },
    ],
  }),
);

vi.mock("../../lib/api/client", () => ({
  listMediaAssets,
}));

const localized = (value: string) => ({
  "en-GB": value,
  "fr-FR": `FR ${value}`,
  status: { "en-GB": "current", "fr-FR": "current" },
  sourceUpdatedAt: "2026-08-10T00:00:00.000Z",
});

afterEach(() => {
  cleanup();
  listMediaAssets.mockClear();
});

describe("SchemaPayloadEditor Atlas proof emphasis", () => {
  it("lets editors select the audiences that should emphasise a proof", () => {
    const onChange = vi.fn();
    render(
      <SchemaPayloadEditor
        kind="atlasNode"
        rawValue={JSON.stringify({
          slug: "accra",
          label: localized("Accra"),
          homepageProof: {
            order: 1,
            label: localized("Evidence point"),
            emphasisFor: ["government"],
          },
        })}
        readOnly={false}
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText("government")).toBeChecked();
    fireEvent.click(screen.getByLabelText("investor"));

    const updated = JSON.parse(onChange.mock.lastCall?.[0] as string) as {
      homepageProof: { emphasisFor: string[] };
    };
    expect(updated.homepageProof.emphasisFor).toEqual([
      "government",
      "investor",
    ]);
  });

  it("selects profile portraits from the governed uploaded library without a URL field", async () => {
    const onChange = vi.fn();
    render(
      <SchemaPayloadEditor
        kind="identity"
        rawValue={JSON.stringify({ portraits: [] })}
        readOnly={false}
        onChange={onChange}
      />,
    );

    const picker = await screen.findByLabelText("Approved profile portraits");
    const option = (await within(picker).findByRole("option", {
      name: /Approved local portrait/iu,
    })) as HTMLOptionElement;
    expect(
      screen.queryByLabelText(/profile image url/iu),
    ).not.toBeInTheDocument();
    option.selected = true;
    fireEvent.change(picker);

    expect(JSON.parse(onChange.mock.lastCall?.[0] as string)).toEqual({
      portraits: ["00000000-0000-4000-8000-000000000001"],
    });
    expect(
      screen.getAllByText(/local file and uploaded through Media/iu).length,
    ).toBeGreaterThan(0);
  }, 15_000);

  it("filters Speaking media by kind and clears an incompatible selection", async () => {
    const onChange = vi.fn();
    render(
      <SchemaPayloadEditor
        kind="speakingTheme"
        rawValue={JSON.stringify({
          media: [
            {
              assetId: "00000000-0000-4000-8000-000000000001",
              kind: "image",
            },
          ],
        })}
        readOnly={false}
        onChange={onChange}
      />,
    );

    await waitFor(() =>
      expect(listMediaAssets).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: "image" }),
      ),
    );
    fireEvent.change(screen.getByLabelText("Media kind"), {
      target: { value: "video" },
    });

    const updated = JSON.parse(onChange.mock.lastCall?.[0] as string) as {
      media: Array<{ assetId?: string; kind: string }>;
    };
    expect(updated.media[0]).toEqual({ kind: "video" });
  });
});
