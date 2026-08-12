import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpeakingMedia } from "./speaking-media";

const item = {
  assetId: "00000000-0000-4000-8000-000000000001",
  kind: "video" as const,
  caption: "Regional forum excerpt",
  relatedArchive: "regional-forum",
  sourceRef: "SRC-001",
};

describe("SpeakingMedia", () => {
  it("renders governed matching media with Archive transcript context", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            assetId: item.assetId,
            secureUrl: "https://media.example.test/forum.mp4",
            resourceType: "video",
            format: "mp4",
            duration: 90,
            bytes: 1000,
            version: 1,
            altText: "Regional forum excerpt",
            credit: "Public Value Forum",
            licence: "Editorial use",
            sourceRef: "SRC-001",
          }),
        ),
      ),
    );
    const { container } = render(
      <SpeakingMedia item={item} locale="en-GB" lite={false} />,
    );
    await waitFor(() =>
      expect(container.querySelector("video")).toHaveAttribute(
        "src",
        "https://media.example.test/forum.mp4",
      ),
    );
    expect(
      screen.getByRole("link", { name: "Transcript and context" }),
    ).toHaveAttribute("href", "/archive#regional-forum");
    vi.unstubAllGlobals();
  });

  it("fails closed when the governed asset type does not match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            assetId: item.assetId,
            secureUrl: "https://media.example.test/forum.jpg",
            resourceType: "image",
            format: "jpg",
            width: 1200,
            height: 800,
            bytes: 1000,
            version: 1,
            altText: "Regional forum",
            credit: "Public Value Forum",
            licence: "Editorial use",
            sourceRef: "SRC-001",
          }),
        ),
      ),
    );
    const { container } = render(
      <SpeakingMedia item={item} locale="en-GB" lite={false} />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    vi.unstubAllGlobals();
  });

  it("defers video in Lite mode until the visitor explicitly opts in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            assetId: item.assetId,
            secureUrl: "https://media.example.test/forum.mp4",
            resourceType: "video",
            format: "mp4",
            duration: 90,
            bytes: 1000,
            version: 1,
            altText: "Regional forum excerpt",
            credit: "Public Value Forum",
            licence: "Editorial use",
            sourceRef: "SRC-001",
          }),
        ),
      ),
    );
    const { container } = render(
      <SpeakingMedia item={item} locale="en-GB" lite />,
    );

    const load = await screen.findByRole("button", { name: "Load video" });
    expect(container.querySelector("video")).toBeNull();
    expect(screen.getAllByText("Regional forum excerpt")).not.toHaveLength(0);

    fireEvent.click(load);
    expect(container.querySelector("video")).toHaveAttribute(
      "src",
      "https://media.example.test/forum.mp4",
    );
    vi.unstubAllGlobals();
  });
});
