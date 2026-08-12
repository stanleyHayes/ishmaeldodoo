import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { identityAssetIds, PressRoom } from "./press-room";

const portraitId = "123e4567-e89b-12d3-a456-426614174000";
const audioId = "123e4567-e89b-12d3-a456-426614174001";
const result = {
  status: "available" as const,
  content: {
    documentType: "identity",
    documentId: "canonical",
    locale: "en-GB" as const,
    version: 1,
    publishedAt: new Date(),
    translation: { stale: false },
    payload: {
      legalName: "Example Legal Name",
      honorific: "Dr.",
      displayName: "Example Display Name",
      givenName: "Example",
      additionalName: "Middle",
      familyName: "Name",
      shortName: "Example Name",
      familiarName: "Example",
      pronunciationGuide: "EX-am-pul",
      pronunciationAudio: audioId,
      nationality: "Ghanaian",
      languages: ["English", "French"],
      location: "Accra",
      titleHistory: [
        {
          title: "Former title",
          longFormTitle: "Former title at Former institution",
          organisation: "Former institution",
          from: "2020-01-01",
          to: "2024-12-31",
          sourceRef: "source-old",
        },
        {
          title: "Current title",
          longFormTitle: "Current title at Current institution",
          organisation: "Current institution",
          from: "2025-01-01",
          to: null,
          sourceRef: "source-current",
        },
      ],
      bio40: "Short approved biography.",
      bio120: "Medium approved biography.",
      bio300: "Long approved biography.",
      portraits: [portraitId],
      disambiguation:
        "A factual distinction from similarly named public figures.",
    },
  },
};
const assets = [
  {
    status: "available" as const,
    asset: {
      assetId: portraitId,
      secureUrl: "https://res.cloudinary.com/demo/image/upload/portrait.jpg",
      resourceType: "image" as const,
      format: "jpg",
      width: 1200,
      height: 1500,
      bytes: 1000,
      version: 1,
      altText: "Approved portrait",
      credit: "Photographer",
      licence: "Editorial use",
      sourceRef: "source-portrait",
    },
  },
  {
    status: "available" as const,
    asset: {
      assetId: audioId,
      secureUrl:
        "https://res.cloudinary.com/demo/video/upload/pronunciation.mp3",
      resourceType: "video" as const,
      format: "mp3",
      bytes: 100,
      version: 1,
      altText: "Name pronunciation",
      credit: "Studio",
      licence: "Editorial use",
      sourceRef: "source-audio",
    },
  },
];

describe("PressRoom", () => {
  it("renders the current title, approved biographies, portraits, audio and sources", () => {
    render(<PressRoom result={result} portraits={assets} locale="en-GB" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Example Display Name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Current title" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Approved portrait" }),
    ).toBeInTheDocument();
    expect(document.querySelector("audio")).toHaveAttribute(
      "src",
      assets[1]?.asset.secureUrl,
    );
    expect(
      screen.getByRole("link", { name: "source-current" }),
    ).toHaveAttribute("href", "/record/sources#source-current");
    expect(identityAssetIds(result)).toEqual([portraitId, audioId]);
    const pressKit = screen
      .getByRole("heading", { name: "Press kit" })
      .closest("section")!;
    expect(within(pressKit).getByLabelText("Your name")).toBeRequired();
    expect(within(pressKit).getByLabelText("Outlet")).toBeRequired();
    expect(within(pressKit).getByLabelText("Email address")).toHaveAttribute(
      "type",
      "email",
    );
    expect(
      within(pressKit).getByRole("button", { name: "Generate press kit" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The Living Dossier" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Not to be confused" }),
    ).toBeInTheDocument();
  });

  it("copies canonical fields without modifying their text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<PressRoom result={result} portraits={assets} locale="en-GB" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Copy" })[0]!);
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("Example Legal Name"),
    );
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
  });

  it("renders native downloads and text-first media without scripts in Lite", () => {
    const { container } = render(
      <PressRoom result={result} portraits={assets} locale="en-GB" lite />,
    );

    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("audio")).toBeNull();
    expect(screen.getByRole("link", { name: "Load image" })).toHaveAttribute(
      "href",
      assets[0]?.asset.secureUrl,
    );
    expect(screen.getByRole("link", { name: "Load audio" })).toHaveAttribute(
      "href",
      assets[1]?.asset.secureUrl,
    );
    const pressKit = screen
      .getByRole("button", { name: "Generate press kit" })
      .closest("form");
    expect(pressKit).toHaveAttribute("action", "/api/press-kit");
    expect(pressKit).toHaveAttribute("method", "post");
    const dossier = screen
      .getByRole("button", { name: "Generate dossier" })
      .closest("form");
    expect(dossier).toHaveAttribute("action", "/api/living-dossier");
    expect(dossier).toHaveAttribute("method", "post");
  });
});
