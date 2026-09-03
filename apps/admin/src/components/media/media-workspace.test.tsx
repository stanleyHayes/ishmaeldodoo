import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaWorkspace } from "./media-workspace";

const api = vi.hoisted(() => ({
  listMediaAssets: vi.fn(),
  updateMediaAsset: vi.fn(),
  uploadMediaAsset: vi.fn(),
  deleteMediaAsset: vi.fn(),
  getMediaInventory: vi.fn(),
}));

vi.mock("../../lib/api/client", () => ({
  ApiClientError: class ApiClientError extends Error {},
  ...api,
}));

const asset = {
  assetId: "00000000-0000-4000-8000-000000000001",
  publicId: "amanor/portraits/portrait-1",
  resourceType: "image" as const,
  secureUrl: "https://res.cloudinary.com/demo/image/upload/portrait.jpg",
  format: "jpg",
  bytes: 1024,
  width: 1200,
  height: 800,
  version: 1,
  altText: {
    "en-GB": "Official portrait",
    "fr-FR": "Portrait officiel",
    status: { "en-GB": "current" as const, "fr-FR": "current" as const },
    sourceUpdatedAt: new Date("2026-08-10T00:00:00.000Z"),
  },
  credit: "A Photographer",
  sourceRef: "S01",
  consentReference: "CONSENT-1",
  licence: "Editorial use",
  transformationPolicy: "portrait" as const,
  retentionPolicy: "standard" as const,
  legalHold: false,
  focalPoint: { x: 0.5, y: 0.4 },
  status: "active" as const,
  createdBy: "editor-1",
  createdAt: new Date("2026-08-10T00:00:00.000Z"),
};

describe("MediaWorkspace", () => {
  beforeEach(() => {
    api.listMediaAssets.mockResolvedValue({ items: [asset] });
    api.updateMediaAsset.mockResolvedValue({
      ...asset,
      credit: "Updated credit",
    });
    api.uploadMediaAsset.mockResolvedValue(asset);
    api.deleteMediaAsset.mockResolvedValue(undefined);
    api.getMediaInventory.mockResolvedValue({
      generatedAt: new Date("2026-08-10T00:00:00Z"),
      totals: {
        assets: 1,
        active: 1,
        deleted: 0,
        quarantined: 0,
        published: 1,
        actionRequired: 0,
      },
      items: [],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("browses governed assets and edits focal-point metadata", async () => {
    render(<MediaWorkspace />);
    expect(await screen.findByText("Official portrait")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Edit metadata and crop" }),
    );
    const creditFields = screen.getAllByLabelText("Credit", {
      selector: "input",
    });
    fireEvent.change(creditFields.at(-1)!, {
      target: { value: "Updated credit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save metadata" }));
    await waitFor(() => expect(api.updateMediaAsset).toHaveBeenCalled());
    expect(api.updateMediaAsset).toHaveBeenCalledWith(
      asset.assetId,
      expect.objectContaining({
        credit: "Updated credit",
        transformationPolicy: "portrait",
        focalPoint: { x: 0.5, y: 0.4 },
      }),
    );
    expect(
      await screen.findByText("Governance and crop metadata saved."),
    ).toBeVisible();
  });

  it("requires explicit confirmation before retiring an asset", async () => {
    render(<MediaWorkspace />);
    expect(await screen.findByText("Official portrait")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retire asset" }));
    expect(api.deleteMediaAsset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm retirement" }));
    await waitFor(() =>
      expect(api.deleteMediaAsset).toHaveBeenCalledWith(asset.assetId),
    );
    expect(screen.queryByText("Official portrait")).not.toBeInTheDocument();
  });

  it("downloads the complete governed inventory and shows its summary", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:inventory");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(<MediaWorkspace />);
    await screen.findByText("Official portrait");
    fireEvent.click(
      screen.getByRole("button", { name: "Download asset inventory" }),
    );
    expect(
      await screen.findByText(/1 assets · 1 published · 0 require action/),
    ).toBeVisible();
    expect(api.getMediaInventory).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });

  it("shows a useful empty library state with the next action", async () => {
    api.listMediaAssets.mockResolvedValue({ items: [] });
    render(<MediaWorkspace />);

    expect(
      await screen.findByRole("heading", {
        name: "No media has been added yet",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add the first file" }));
    expect(
      screen.getByRole("heading", { name: "Register a governed asset" }),
    ).toBeVisible();
  });

  it("explains a library error and lets the operator dismiss it", async () => {
    api.listMediaAssets.mockRejectedValue(new Error("offline"));
    render(<MediaWorkspace />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't open the media library");
    expect(alert).toHaveTextContent("Try again");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
