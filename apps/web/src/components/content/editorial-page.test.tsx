import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditorialPage, readPageMetadata } from "./editorial-page";

const result = {
  status: "available" as const,
  content: {
    documentType: "page",
    documentId: "record",
    locale: "en-GB" as const,
    version: 3,
    publishedAt: new Date("2026-08-09T20:00:00Z"),
    payload: {
      slug: "/record",
      title: "The verified record",
      summary: "A sourced account.",
      sections: [
        {
          key: "act-one",
          heading: "Act one",
          body: "First paragraph.\nSecond paragraph.",
          sourceRefs: ["source-1"],
        },
      ],
      seoTitle: "The record",
      seoDescription: "A sourced public record.",
      noIndex: false,
    },
    translation: { stale: false },
  },
};

describe("EditorialPage", () => {
  it("renders CMS sections, source links and breadcrumb structure", () => {
    const { container } = render(
      <EditorialPage result={result} path="/record" locale="en-GB" />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "The verified record" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "source-1" })).toHaveAttribute(
      "href",
      "/record/sources#source-1",
    );
    expect(
      container.querySelector('script[type="application/ld+json"]'),
    ).toHaveTextContent("BreadcrumbList");
    expect(readPageMetadata(result)).toEqual({
      title: "The record",
      description: "A sourced public record.",
      noIndex: false,
    });
  });

  it("fails closed when no approved locale is published", () => {
    render(
      <EditorialPage
        result={{ status: "not_found" }}
        path="/press"
        locale="en-GB"
      />,
    );
    expect(
      screen.getByRole("heading", { name: /awaiting approved content/i }),
    ).toBeInTheDocument();
  });

  it("discloses a dated stale-translation state in French", () => {
    render(
      <EditorialPage
        result={{
          ...result,
          content: {
            ...result.content,
            locale: "fr-FR",
            translation: {
              stale: true,
              sourceUpdatedAt: new Date("2026-08-09T00:00:00Z"),
            },
          },
        }}
        path="/record"
        locale="fr-FR"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /traduction en cours de révision/i,
    );
  });

  it("renders source-linked FAQs and emits matching FAQPage data", () => {
    const { container } = render(
      <EditorialPage
        result={{
          ...result,
          content: {
            ...result.content,
            payload: {
              ...result.content.payload,
              faqs: [
                {
                  question: "What is verified?",
                  answer:
                    "Every public claim is linked to a source. </script><script>alert(1)</script>",
                  sourceRefs: ["source-1"],
                },
              ],
            },
          },
        }}
        path="/record"
        locale="en-GB"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Frequently asked questions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("What is verified?")).toBeInTheDocument();
    const scripts = [
      ...container.querySelectorAll('script[type="application/ld+json"]'),
    ];
    expect(
      scripts.some((script) => script.textContent?.includes('"FAQPage"')),
    ).toBe(true);
    const faqScript = scripts.find((script) =>
      script.textContent?.includes('"FAQPage"'),
    );
    expect(faqScript?.textContent).not.toContain("</script>");
    expect(faqScript?.textContent).toContain("\\u003c/script>");
  });

  it("fails closed instead of emitting an unsourced FAQ", () => {
    const { container } = render(
      <EditorialPage
        result={{
          ...result,
          content: {
            ...result.content,
            payload: {
              ...result.content.payload,
              faqs: [
                {
                  question: "Unsourced question",
                  answer: "Unsourced answer",
                  sourceRefs: [],
                },
              ],
            },
          },
        }}
        path="/record"
        locale="en-GB"
      />,
    );
    expect(
      screen.getByRole("heading", { name: /awaiting approved content/i }),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain("Unsourced answer");
  });
});
