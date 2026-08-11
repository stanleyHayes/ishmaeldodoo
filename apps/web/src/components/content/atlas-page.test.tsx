import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicAtlasResult } from "../../lib/content/public-atlas-client";
import { AtlasPage } from "./atlas-page";
import { AtlasTablePage } from "./atlas-table-page";

const staleResult: PublicAtlasResult = {
  status: "available",
  items: [],
  translation: {
    stale: true,
    sourceUpdatedAt: new Date("2026-08-09T00:00:00.000Z"),
  },
};

describe("Atlas translation disclosure", () => {
  it.each([
    [
      "map route",
      <AtlasPage
        key="map"
        result={staleResult}
        locale="fr-FR"
        filters={{}}
        tileUrl="https://tiles.example.test/{z}/{x}/{y}.png"
        attribution="Test tiles"
        tableOnly
      />,
    ],
    [
      "table route",
      <AtlasTablePage
        key="table"
        result={staleResult}
        locale="fr-FR"
        filters={{}}
      />,
    ],
  ])("announces a dated stale state on the %s", (_name, component) => {
    render(component);
    expect(screen.getByRole("status")).toHaveTextContent("09/08/2026");
  });

  it("does not show the French disclosure in English", () => {
    render(<AtlasTablePage result={staleResult} locale="en-GB" filters={{}} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
