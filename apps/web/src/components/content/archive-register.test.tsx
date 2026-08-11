import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArchiveRegister } from "./archive-register";

const archive = {
  items: [
    {
      documentId: "article-1",
      slug: "article-one",
      title: "Finance & public value",
      type: "article" as const,
      date: new Date("2026-08-01T00:00:00.000Z"),
      publishedAt: new Date("2026-08-02T00:00:00.000Z"),
      language: "en" as const,
      city: "Accra",
      transcript: "Corrected article transcript.",
      transcriptStatus: "corrected" as const,
      transcriptSegments: [
        { startSeconds: 0, text: "Opening context." },
        { startSeconds: 90, text: "Accountable outcomes for public finance." },
      ],
      mediaUrl: "https://media.example.test/article.mp4",
      chapters: [
        { slug: "opening", label: "Opening", startSeconds: 0, endSeconds: 90 },
        { slug: "questions", label: "Questions", startSeconds: 90 },
      ],
      corrections: [
        {
          incorrectQuote: "An inaccurate public quotation.",
          correction: "The corrected public wording.",
          issuedAt: new Date("2026-08-03T00:00:00.000Z"),
          sourceRef: "source-correction-1",
        },
      ],
    },
    {
      documentId: "broadcast-1",
      slug: "broadcast-one",
      title: "Regional broadcast",
      type: "broadcast" as const,
      date: new Date("2026-07-01T00:00:00.000Z"),
      publishedAt: new Date("2026-07-02T00:00:00.000Z"),
      language: "en" as const,
      country: "Senegal",
      mediaUrl: "https://media.example.test/broadcast.mp4",
      transcriptStatus: "machine" as const,
    },
  ],
  translation: { stale: false },
};

describe("ArchiveRegister", () => {
  it("filters published entries and exposes corrected transcript state", () => {
    render(
      <ArchiveRegister
        archive={archive}
        locale="en-GB"
        query="Accra"
        baseUrl="https://amanor.example"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Finance & public value" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Regional broadcast")).not.toBeInTheDocument();
    expect(screen.getByText(/Read transcript · corrected/)).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", {
        name: "Chapters for Finance & public value",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Play from here" })[0],
    ).toHaveAttribute("href", "https://media.example.test/article.mp4#t=0");
    expect(screen.getByRole("status")).toHaveTextContent("1 published result");
  });

  it("emits Article and VideoObject structured data only for eligible entries", () => {
    const { container } = render(
      <ArchiveRegister
        archive={archive}
        locale="en-GB"
        baseUrl="https://amanor.example/"
      />,
    );
    const graphs = [
      ...container.querySelectorAll('script[type="application/ld+json"]'),
    ].map(
      (node) =>
        JSON.parse(node.textContent ?? "{}") as {
          "@type": string;
          url: string;
        },
    );
    expect(graphs).toEqual([
      expect.objectContaining({
        "@type": "Article",
        url: "https://amanor.example/archive#article-one",
      }),
      expect.objectContaining({
        "@type": "VideoObject",
        url: "https://amanor.example/archive#broadcast-one",
      }),
    ]);
  });

  it("neutralizes CMS-authored script termination in Archive JSON-LD", () => {
    const { container } = render(
      <ArchiveRegister
        archive={{
          ...archive,
          items: [
            {
              ...archive.items[0]!,
              title: "Evidence </script><script>alert(1)</script>",
            },
          ],
        }}
        locale="en-GB"
        baseUrl="https://amanor.example"
      />,
    );
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );
    expect(script?.textContent).not.toContain("</script>");
    expect(script?.textContent).toContain("\\u003c/script>");
  });

  it("discloses a dated stale-translation state only in French", () => {
    const staleArchive = {
      ...archive,
      translation: {
        stale: true,
        sourceUpdatedAt: new Date("2026-08-09T00:00:00.000Z"),
      },
    };
    const { rerender } = render(
      <ArchiveRegister
        archive={staleArchive}
        locale="fr-FR"
        baseUrl="https://amanor.example"
      />,
    );
    expect(
      screen.getByText(/Traduction en cours de révision/),
    ).toHaveTextContent("09/08/2026");

    rerender(
      <ArchiveRegister
        archive={staleArchive}
        locale="en-GB"
        baseUrl="https://amanor.example"
      />,
    );
    expect(
      screen.queryByText(/Traduction en cours de révision/),
    ).not.toBeInTheDocument();
  });

  it("searches transcript text, exposes timestamp context and renders sourced corrections", () => {
    render(
      <ArchiveRegister
        archive={archive}
        locale="en-GB"
        query="accountable outcomes"
        baseUrl="https://amanor.example"
        speakerName="Canonical Speaker"
      />,
    );
    expect(
      screen.getByText("Accountable outcomes for public finance."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play at 1:30" })).toHaveAttribute(
      "href",
      "https://media.example.test/article.mp4#t=90",
    );
    expect(
      screen.getByRole("heading", { name: "Correction log" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The corrected public wording."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Correction source" }),
    ).toHaveAttribute("href", "/record/sources#source-correction-1");
  });
});
