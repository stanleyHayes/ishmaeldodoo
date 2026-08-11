import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GovernedMediaPicker } from "./governed-media-picker";

const listMediaAssets = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api/client", () => ({ listMediaAssets }));

const selectedAssetId = "00000000-0000-4000-8000-000000000002";

afterEach(() => {
  cleanup();
  listMediaAssets.mockReset();
});

describe("GovernedMediaPicker", () => {
  it("loads a selected active asset that is outside the first library page", async () => {
    listMediaAssets
      .mockResolvedValueOnce({
        items: [
          {
            assetId: "00000000-0000-4000-8000-000000000001",
            publicId: "amanor/archive/recent",
            resourceType: "image",
            altText: { "en-GB": "Recent asset" },
          },
        ],
        nextCursor: "older",
      })
      .mockResolvedValueOnce({
        items: [
          {
            assetId: selectedAssetId,
            publicId: "amanor/archive/selected-older",
            resourceType: "image",
            altText: { "en-GB": "Selected older asset" },
          },
        ],
      });

    render(
      <GovernedMediaPicker
        id="field-image"
        label="Field image"
        value={selectedAssetId}
        readOnly={false}
        resourceType="image"
        onChange={vi.fn()}
      />,
    );

    const picker = screen.getByLabelText("Field image");
    await within(picker).findByRole("option", {
      name: /Selected older asset/iu,
    });
    expect(picker).toHaveValue(selectedAssetId);
    expect(listMediaAssets).toHaveBeenNthCalledWith(2, {
      limit: 1,
      assetId: selectedAssetId,
      resourceType: "image",
    });
  });

  it("discloses a selected asset that is inactive or incompatible", async () => {
    listMediaAssets
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] });

    render(
      <GovernedMediaPicker
        id="speaking-video"
        label="Speaking video"
        value={selectedAssetId}
        readOnly={false}
        resourceType="video"
        onChange={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/no longer active or does not match/iu),
      ).toBeInTheDocument(),
    );
  });
});
