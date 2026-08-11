import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AtlasTable, filterAtlasNodes } from "./atlas-table";
const nodes = [
  {
    slug: "accra",
    label: "Accra",
    institution: "Institution A",
    role: "Role A",
    country: "Ghana",
    city: "Accra",
    coordinates: [-0.2, 5.6] as [number, number],
    startDate: new Date("2025-01-01"),
    endDate: null,
    era: "Current",
    themes: ["financing"],
    outcomes: ["Delivered outcome"],
    sourceRefs: ["source-1"],
  },
  {
    slug: "dakar",
    label: "Dakar",
    institution: "Institution B",
    role: "Role B",
    country: "Senegal",
    city: "Dakar",
    coordinates: [-17.4, 14.7] as [number, number],
    startDate: new Date("2019-01-01"),
    endDate: new Date("2020-01-01"),
    era: "Regional",
    themes: ["coordination"],
    outcomes: ["Regional outcome"],
    sourceRefs: ["source-2"],
  },
];
describe("AtlasTable", () => {
  it("filters the identical semantic dataset and preserves source links", () => {
    render(
      <AtlasTable
        items={nodes}
        locale="en-GB"
        filters={{ theme: "financing" }}
        basePath="/record/atlas/table"
      />,
    );
    expect(screen.getByText("1 items")).toBeInTheDocument();
    expect(screen.getByText("Role A")).toBeInTheDocument();
    expect(screen.queryByText("Role B")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "source-1" })).toHaveAttribute(
      "href",
      "/record/sources#source-1",
    );
    expect(screen.getByRole("search")).toHaveAttribute(
      "action",
      "/record/atlas/table",
    );
  });
  it("requires a currency before comparing portfolio magnitude", () => {
    const valued = nodes.map((node, index) => ({
      ...node,
      portfolioValue: index === 0 ? 500_000 : 150_000_000,
      currency: index === 0 ? "USD" : "GHS",
    }));
    expect(filterAtlasNodes(valued, { scale: "under-1m" })).toEqual([]);
    expect(
      filterAtlasNodes(valued, { scale: "under-1m", currency: "USD" }).map(
        (item) => item.slug,
      ),
    ).toEqual(["accra"]);
  });
});
