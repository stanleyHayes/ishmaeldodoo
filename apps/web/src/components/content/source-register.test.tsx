import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceRegister } from "./source-register";

describe("SourceRegister", () => {
  it("renders searchable public-only source evidence and pagination", () => {
    render(
      <SourceRegister
        locale="en-GB"
        query="official"
        result={{
          status: "available",
          page: {
            items: [
              {
                ref: "source-1",
                title: "Official record",
                publisher: "Institution",
                accessedAt: new Date("2026-08-09"),
                type: "official",
                url: "https://example.test/source",
              },
            ],
            nextCursor: "source-1",
          },
        }}
      />,
    );
    expect(screen.getByRole("search")).toHaveAttribute(
      "action",
      "/record/sources",
    );
    expect(
      screen.getByRole("heading", { name: "Official record" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open source" })).toHaveAttribute(
      "href",
      "https://example.test/source",
    );
    expect(screen.getByRole("link", { name: "Next sources" })).toHaveAttribute(
      "href",
      "/record/sources?q=official&cursor=source-1",
    );
    expect(
      screen.queryByText(/confidential editorial/i),
    ).not.toBeInTheDocument();
  });

  it("renders a French empty-search result without inventing evidence", () => {
    render(
      <SourceRegister
        locale="fr-FR"
        query="absent"
        result={{ status: "available", page: { items: [] } }}
      />,
    );
    expect(
      screen.getByText(/aucune source ne correspond/i),
    ).toBeInTheDocument();
  });
});
