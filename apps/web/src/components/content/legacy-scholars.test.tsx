import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegacyScholars } from "./legacy-scholars";

describe("LegacyScholars", () => {
  it("labels the register as consent-cleared without claiming financial impact", () => {
    render(
      <LegacyScholars
        locale="en-GB"
        legacy={{
          scholars: [
            {
              documentId: "s1",
              name: "Ama",
              country: "GH",
              institution: "University",
              field: "Economics",
              cohortYear: 2024,
              status: "Active",
              story: "A governed story.",
              publishedAt: new Date("2026-08-12"),
            },
          ],
          translation: { stale: false },
        }}
      />,
    );
    expect(screen.getByText("Ama")).toBeInTheDocument();
    expect(
      screen.getByText(/not a financial impact report/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/consent version/i)).not.toBeInTheDocument();
  });
});
