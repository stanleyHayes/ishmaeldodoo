import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PersonStructuredData } from "./person-structured-data";

const result = {
  status: "available" as const,
  content: {
    documentType: "identity",
    documentId: "canonical",
    locale: "en-GB" as const,
    version: 1,
    publishedAt: new Date(),
    translation: { stale: false },
    payload: {
      legalName: "Example Legal Name",
      honorific: "Dr.",
      displayName: "Example Display Name",
      givenName: "Example",
      additionalName: "Middle",
      familyName: "Name",
      shortName: "Example Name",
      familiarName: "Example",
      pronunciationGuide: "EX-am-pul",
      nationality: "Ghanaian",
      languages: ["English", "French"],
      location: "Accra",
      titleHistory: [
        {
          title: "Current role",
          longFormTitle: "Current role at Current institution",
          organisation: "Current institution",
          from: "2025-01-01",
          to: null,
          sourceRef: "source-current",
        },
      ],
      bio40: "Short approved biography.",
      bio120: "Medium approved biography.",
      bio300: "Long approved biography.",
      portraits: [],
      sameAs: ["https://example.test/profile"],
      alumniOf: ["Example University"],
      knowsAbout: ["Development finance"],
    },
  },
};

describe("PersonStructuredData", () => {
  it("renders one CMS-derived Person graph with the computed current title", () => {
    const { container } = render(
      <PersonStructuredData result={result} baseUrl="https://example.test" />,
    );
    const graph = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')
        ?.textContent ?? "",
    ) as { "@graph": Array<Record<string, unknown>> };
    expect(graph["@graph"][0]).toEqual(
      expect.objectContaining({
        "@type": "Person",
        name: "Example Display Name",
        jobTitle: "Current role",
        sameAs: ["https://example.test/profile"],
        worksFor: { "@id": "https://example.test/#current-organisation" },
      }),
    );
    expect(graph["@graph"][1]).toEqual({
      "@type": "Organization",
      "@id": "https://example.test/#current-organisation",
      name: "Current institution",
    });
    expect(graph["@graph"][1]).not.toHaveProperty("url");
    expect(graph["@graph"][1]).not.toHaveProperty("sameAs");
    expect(graph["@graph"][2]).toEqual(
      expect.objectContaining({ "@type": "ProfilePage" }),
    );
  });

  it("fails closed when structured names are not approved", () => {
    const incomplete = {
      ...result,
      content: {
        ...result.content,
        payload: { ...result.content.payload, givenName: undefined },
      },
    };
    const { container } = render(
      <PersonStructuredData
        result={incomplete}
        baseUrl="https://example.test"
      />,
    );
    expect(container.querySelector("script")).toBeNull();
  });
});
