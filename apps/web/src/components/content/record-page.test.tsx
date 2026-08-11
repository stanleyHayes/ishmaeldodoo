import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicContentResult } from "../../lib/content/public-content-client";
import { RecordPage } from "./record-page";

const acts = ["forest", "system", "sahel", "return"] as const;
const result: PublicContentResult = {
  status: "available",
  content: {
    documentType: "page",
    documentId: "record",
    locale: "en-GB",
    version: 1,
    publishedAt: new Date("2026-08-10"),
    translation: { stale: false },
    payload: {
      title: "A record in four acts",
      summary: "A sourced long-form profile.",
      sections: acts.map((recordAct, index) => ({
        key: `act-${recordAct}`,
        heading: `Act ${index + 1}`,
        body: `Opening ${index + 1}`,
        sourceRefs: [`source-${index + 1}`],
        recordAct,
        dateline: `Place · ${2000 + index}`,
        fieldImage: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        imageCaption: `Field image ${index + 1}`,
        claims: [
          {
            body: `Verified claim ${index + 1}`,
            sourceRefs: [`source-${index + 1}`],
          },
        ],
        marginalia: [
          {
            label: "Portfolio",
            value: `Figure ${index + 1}`,
            sourceRefs: [`source-${index + 1}`],
          },
        ],
        ...(index === 0
          ? {
              pullQuote: {
                quote: "A verified public statement",
                venue: "Public forum",
                date: "2026-01-01T00:00:00.000Z",
                sourceRef: "source-quote",
              },
            }
          : {}),
      })),
    },
  },
};

describe("RecordPage", () => {
  it("renders the four acts, sticky progress semantics and claim-level sources", () => {
    render(
      <RecordPage
        result={result}
        atlas={[]}
        locale="en-GB"
        ledger="diplomatic"
        lite
      />,
    );
    expect(
      screen.getByRole("navigation", { name: "Story progress" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(
      screen.getByRole("link", { name: "Current position" }),
    ).toHaveAttribute("href", "#current-position");
    expect(
      screen.getAllByRole("link", { name: "Source source-1" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("“A verified public statement”"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Load field images" }),
    ).toHaveLength(4);
  });

  it("fails closed when the complete ordered act set is unavailable", () => {
    const payload = result.status === "available" ? result.content.payload : {};
    render(
      <RecordPage
        result={
          {
            ...result,
            content: {
              ...(result.status === "available" ? result.content : {}),
              payload: {
                ...(payload as Record<string, unknown>),
                sections: (payload as { sections: unknown[] }).sections.slice(
                  0,
                  3,
                ),
              },
            },
          } as PublicContentResult
        }
        atlas={[]}
        locale="en-GB"
        ledger="diplomatic"
        lite
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "The Record is awaiting its approved narrative.",
      }),
    ).toBeInTheDocument();
  });
});
