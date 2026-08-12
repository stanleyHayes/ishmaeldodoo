import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicSpeaking } from "@amanor/contracts";
import { SpeakingThemes } from "./speaking-themes";

const speaking = {
  items: [
    {
      documentId: "public-value",
      slug: "public-value",
      title: "Public value",
      summary: "A practical theme",
      audiences: ["Programme directors", "Institutional leaders"],
      formats: ["keynote", "institutional_briefing"],
      sourceRefs: ["SRC-001"],
      relatedNodes: [],
      featured: true,
      publishedAt: new Date("2026-08-09"),
      history: [
        {
          slug: "forum-2026",
          title: "Regional forum",
          host: "Public Value Forum",
          date: new Date("2026-07-01"),
          city: "Accra",
          country: "Ghana",
          format: "keynote" as const,
          sourceRefs: ["SRC-003"],
        },
        {
          slug: "summit-2025",
          title: "Delivery summit",
          host: "Delivery Network",
          date: new Date("2025-11-01"),
          country: "Senegal",
          format: "keynote" as const,
          sourceRefs: ["SRC-004"],
        },
      ],
    },
    {
      documentId: "delivery",
      slug: "delivery",
      title: "Delivery",
      summary: "A workshop theme",
      audiences: ["Delivery teams"],
      formats: ["workshop"],
      sourceRefs: ["SRC-002"],
      relatedNodes: [],
      featured: false,
      publishedAt: new Date("2026-08-08"),
      history: [
        {
          slug: "workshop-one",
          title: "Delivery workshop",
          host: "Delivery Forum",
          date: new Date("2026-06-01"),
          country: "Ghana",
          format: "workshop" as const,
          sourceRefs: ["SRC-002"],
        },
        {
          slug: "workshop-two",
          title: "Implementation workshop",
          host: "Implementation Forum",
          date: new Date("2026-07-01"),
          country: "Senegal",
          format: "workshop" as const,
          sourceRefs: ["SRC-002"],
        },
      ],
    },
  ],
  translation: { stale: false },
} satisfies PublicSpeaking;

describe("SpeakingThemes", () => {
  it("renders audiences, formats, governed sources and the request path", () => {
    const { container } = render(
      <SpeakingThemes
        speaking={speaking}
        locale="en-GB"
        baseUrl="https://amanor.example"
      />,
    );
    expect(screen.getByText("2 published themes")).toBeInTheDocument();
    expect(screen.getByText("Institutional leaders")).toBeInTheDocument();
    expect(screen.getByText("Regional forum")).toBeInTheDocument();
    expect(
      screen.getByText("Public Value Forum · Accra, Ghana"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SRC-001" })).toHaveAttribute(
      "href",
      "/record/sources#SRC-001",
    );
    expect(
      screen.getByRole("link", { name: "Open the Protocol Desk" }),
    ).toHaveAttribute("href", "/speaking/request");
    const events = [
      ...container.querySelectorAll('script[type="application/ld+json"]'),
    ].map(
      (node) =>
        JSON.parse(node.textContent ?? "null") as Record<string, unknown>,
    );
    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({
      "@type": "Event",
      name: "Regional forum",
      startDate: "2026-07-01T00:00:00.000Z",
      eventStatus: "https://schema.org/EventCompleted",
      inLanguage: "en-GB",
      url: "https://amanor.example/speaking#public-value-forum-2026",
      organizer: { "@type": "Organization", name: "Public Value Forum" },
      location: {
        address: { addressLocality: "Accra", addressCountry: "Ghana" },
      },
      subjectOf: [
        {
          url: "https://amanor.example/record/sources#SRC-003",
        },
      ],
    });
  });

  it("filters by a valid format and ignores unsupported values", () => {
    const { rerender } = render(
      <SpeakingThemes
        speaking={speaking}
        locale="fr-FR"
        format="workshop"
        baseUrl="https://amanor.example"
      />,
    );
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(screen.queryByText("Public value")).not.toBeInTheDocument();
    expect(screen.getByText("1 thème publié")).toBeInTheDocument();

    rerender(
      <SpeakingThemes
        speaking={speaking}
        locale="en-GB"
        format="invalid"
        baseUrl="https://amanor.example"
      />,
    );
    expect(screen.getByText("2 published themes")).toBeInTheDocument();
  });

  it("discloses a dated stale-translation state only in French", () => {
    const stale = {
      ...speaking,
      translation: {
        stale: true,
        sourceUpdatedAt: new Date("2026-08-09T00:00:00.000Z"),
      },
    } satisfies PublicSpeaking;
    const { rerender } = render(
      <SpeakingThemes
        speaking={stale}
        locale="fr-FR"
        baseUrl="https://amanor.example"
      />,
    );
    expect(
      screen.getByText(/Traduction en cours de révision/),
    ).toHaveTextContent("09/08/2026");

    rerender(
      <SpeakingThemes
        speaking={stale}
        locale="en-GB"
        baseUrl="https://amanor.example"
      />,
    );
    expect(
      screen.queryByText(/Traduction en cours de révision/),
    ).not.toBeInTheDocument();
  });

  it("localizes canonical event and source URLs and fails closed on incomplete history", () => {
    const incomplete = {
      ...speaking,
      items: [
        {
          ...speaking.items[0]!,
          history: [
            speaking.items[0]!.history[0]!,
            { ...speaking.items[0]!.history[1]!, host: "" },
          ],
        },
      ],
    } as PublicSpeaking;
    const { container } = render(
      <SpeakingThemes
        speaking={incomplete}
        locale="fr-FR"
        baseUrl="https://amanor.example/"
      />,
    );
    const scripts = container.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0]?.textContent ?? "null")).toMatchObject({
      inLanguage: "fr-FR",
      url: "https://amanor.example/fr/speaking#public-value-forum-2026",
      subjectOf: [{ url: "https://amanor.example/fr/record/sources#SRC-003" }],
    });
  });

  it("keeps Lite media server-only and restores governed media explicitly", () => {
    const withMedia = {
      ...speaking,
      items: [
        {
          ...speaking.items[0]!,
          media: [
            {
              assetId: "9f9dc2f1-1f08-4df7-9672-099e79123609",
              kind: "image" as const,
              caption: "Field evidence",
              sourceRef: "SRC-001",
              relatedArchive: "regional-forum",
            },
          ],
        },
      ],
    } satisfies PublicSpeaking;
    const mediaById = {
      "9f9dc2f1-1f08-4df7-9672-099e79123609": {
        assetId: "9f9dc2f1-1f08-4df7-9672-099e79123609",
        secureUrl: "https://res.cloudinary.com/example/image/upload/field.jpg",
        resourceType: "image" as const,
        format: "jpg",
        width: 1200,
        height: 800,
        bytes: 42_000,
        version: 1,
        altText: "Field visit",
        credit: "Project AMANOR",
        licence: "Approved use",
        sourceRef: "SRC-001",
      },
    };
    const { rerender } = render(
      <SpeakingThemes
        speaking={withMedia}
        locale="en-GB"
        lite
        baseUrl="https://amanor.example"
        mediaById={mediaById}
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Load this media in standard mode" }),
    ).toHaveAttribute(
      "href",
      "/api/lite?enabled=0&return=%2Fspeaking%23public-value",
    );
    expect(
      screen.getByRole("link", { name: "Transcript and context" }),
    ).toHaveAttribute("href", "/archive#regional-forum");

    rerender(
      <SpeakingThemes
        speaking={withMedia}
        locale="en-GB"
        baseUrl="https://amanor.example"
        mediaById={mediaById}
      />,
    );
    expect(screen.getByRole("img", { name: "Field visit" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Transcript and context" }),
    ).toHaveAttribute("href", "/archive#regional-forum");
  });
});
