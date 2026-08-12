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

  it("renders only governed image media and omits portraits in Sahel mode", () => {
    const photo = "00000000-0000-4000-8000-000000000201";
    const legacy: PublicLegacy = {
      scholars: [
        {
          documentId: "s1",
          name: "Ama",
          country: "GH",
          institution: "University",
          field: "Economics",
          cohortYear: 2024,
          status: "Active",
          photo,
          story: "A governed story.",
          publishedAt: new Date("2026-08-12"),
        },
      ],
      translation: { stale: false },
    };
    const media: Record<string, PublicMedia> = {
      [photo]: {
        assetId: photo,
        resourceType: "image" as const,
        secureUrl: "https://media.example.test/ama.jpg",
        altText: "Ama at the university library",
        credit: "Project AMANOR",
        licence: "Consent-cleared editorial use",
        width: 800,
        height: 800,
        format: "jpg",
        bytes: 128_000,
        version: 1,
        sourceRef: "consent-cleared-scholar-portrait",
      },
    };
    const { rerender } = render(
      <LegacyScholars locale="en-GB" legacy={legacy} media={media} />,
    );
    expect(screen.getByRole("img", { name: /Ama at/i })).toHaveAttribute(
      "src",
      expect.stringContaining("ama.jpg"),
    );
    expect(screen.getByText(/Project AMANOR/)).toBeInTheDocument();

    rerender(
      <LegacyScholars locale="en-GB" legacy={legacy} media={media} lite />,
    );
    expect(
      screen.queryByRole("img", { name: /Ama at/i }),
    ).not.toBeInTheDocument();
  });
});
import type { PublicLegacy, PublicMedia } from "@amanor/contracts";
