import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicSearch } from "./public-search";

describe("PublicSearch", () => {
  it("offers guided public search and specialist routes before a query", () => {
    render(<PublicSearch locale="en-GB" query={undefined} />);

    expect(
      screen.getByRole("heading", { name: "What are you looking for?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Start with an idea")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open the Archive/ }),
    ).toHaveAttribute("href", "/archive");
    expect(
      screen.getByRole("link", { name: /Open the Source Register/ }),
    ).toHaveAttribute("href", "/record/sources");
  });

  it("renders readable result and empty states", () => {
    const { rerender } = render(<PublicSearch locale="en-GB" query="press" />);
    expect(screen.getByText("1 result")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Press Room" })).toHaveAttribute(
      "href",
      "/press",
    );

    rerender(<PublicSearch locale="en-GB" query="not in the record" />);
    expect(screen.getByText("No public result found")).toBeInTheDocument();
  });

  it("keeps French routes and copy at parity", () => {
    render(<PublicSearch locale="fr-FR" query="presse" />);
    expect(
      screen.getByRole("heading", { name: "“presse”" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Espace presse" })).toHaveAttribute(
      "href",
      "/fr/press",
    );
    expect(
      screen.getByRole("link", { name: /Ouvrir les archives/ }),
    ).toHaveAttribute("href", "/fr/archive?q=presse");
  });
});
