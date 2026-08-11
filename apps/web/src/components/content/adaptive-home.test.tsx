import type { PublicAtlasNode, PublicSignal } from "@amanor/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Identity } from "../../lib/content/identity-payload";
import { AdaptiveHome } from "./adaptive-home";

const acts = ["forest", "system", "bridge", "architecture"] as const;
const atlas: PublicAtlasNode[] = Array.from({ length: 9 }, (_, index) => ({
  slug: `node-${index + 1}`,
  label: `Node ${index + 1}`,
  institution: `Institution ${index + 1}`,
  role: `Role ${index + 1}`,
  country: "GH",
  region: "West Africa",
  startDate: new Date(`20${String(index + 10)}-01-01`),
  endDate: index === 8 ? null : new Date(`20${String(index + 10)}-12-31`),
  era: `Era ${Math.min(index + 1, 4)}`,
  themes: [index === 0 ? "financing" : "environment"],
  outcomes: ["Outcome one", "Outcome two", "Outcome three"],
  sourceRefs: [`source-${index + 1}`],
  homepageProof: {
    order: index + 1,
    label: `Proof ${index + 1}`,
    emphasisFor: index === 8 ? ["investor"] : [],
  },
  ...(index < 4
    ? {
        homepageAct: {
          act: acts[index]!,
          label: `Act ${index + 1}`,
          dateRange: `200${index}-200${index + 1}`,
          place: `Place ${index + 1}`,
          figure: `Figure ${index + 1}`,
          sentence: `Evidence sentence ${index + 1}.`,
        },
      }
    : {}),
}));
const identity: Identity = {
  legalName: "Example Person",
  honorific: "Dr",
  displayName: "Dr Example Person",
  givenName: "Example",
  familyName: "Person",
  shortName: "Example Person",
  familiarName: "Example",
  pronunciationGuide: "Example",
  nationality: "Ghanaian",
  languages: ["English", "French"],
  location: "Accra",
  titleHistory: [
    {
      title: "Current title",
      longFormTitle: "Current title at Institution",
      organisation: "Institution",
      from: "2026-01-01",
      to: null,
      sourceRef: "source-title",
    },
  ],
  bio40: "A concise approved positioning statement.",
  bio120: "Approved biography.",
  bio300: "Approved long biography.",
  portraits: [],
};
const signal: PublicSignal = {
  documentId: "signal-1",
  slug: "signal-1",
  body: "The latest governed signal.",
  publishedAt: new Date("2026-08-10T00:00:00Z"),
  tags: ["finance"],
  confidence: "watching",
  changeMyMind: "Contrary evidence.",
  sourceRefs: ["source-signal"],
  translation: { stale: false },
};

describe("AdaptiveHome", () => {
  it("renders the complete evidence-led P01 sequence", () => {
    render(
      <AdaptiveHome
        locale="en-GB"
        audience={null}
        atlas={atlas}
        identity={identity}
        signal={signal}
      />,
    );
    expect(screen.getByLabelText("Nine proof points")).toBeInTheDocument();
    expect(screen.getAllByText(/^Proof \d$/u)).toHaveLength(9);
    expect(
      screen.getByRole("heading", { name: "The record in four acts" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^Act \d$/u)).toHaveLength(4);
    expect(screen.getByText("The latest governed signal.")).toBeInTheDocument();
    expect(screen.getAllByText("Figure 4")).toHaveLength(2);
  });

  it("collapses incomplete proof, act and Signal blocks", () => {
    render(
      <AdaptiveHome
        locale="en-GB"
        audience={null}
        atlas={atlas.slice(0, 3)}
        identity={identity}
        signal={null}
      />,
    );
    expect(
      screen.queryByLabelText("Nine proof points"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "The record in four acts" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Latest signal")).not.toBeInTheDocument();
  });

  it("uses CMS audience emphasis rather than themes without hiding proof", () => {
    render(
      <AdaptiveHome
        locale="en-GB"
        audience="investor"
        atlas={atlas}
        identity={identity}
        signal={signal}
      />,
    );
    const strip = screen.getByLabelText("Nine proof points");
    const links = within(strip).getAllByRole("link");
    expect(links).toHaveLength(9);
    expect(links[0]).toHaveTextContent("Proof 9");
  });

  it("bounds the latest Signal excerpt to 200 words", () => {
    const words = Array.from({ length: 205 }, (_, index) => `word${index + 1}`);
    render(
      <AdaptiveHome
        locale="en-GB"
        audience={null}
        atlas={atlas}
        identity={identity}
        signal={{ ...signal, body: words.join(" ") }}
      />,
    );
    expect(screen.getByText(/word1 word2/u)).toHaveTextContent("word200…");
    expect(screen.queryByText(/word201/u)).not.toBeInTheDocument();
  });

  it("discloses a dated stale French Signal without warning in English", () => {
    const staleSignal: PublicSignal = {
      ...signal,
      translation: {
        stale: true,
        sourceUpdatedAt: new Date("2026-08-10T00:00:00Z"),
      },
    };
    const { rerender } = render(
      <AdaptiveHome
        locale="fr-FR"
        audience={null}
        atlas={atlas}
        identity={identity}
        signal={staleSignal}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /Traduction en cours de révision.*10\/08\/2026/u,
    );
    rerender(
      <AdaptiveHome
        locale="en-GB"
        audience={null}
        atlas={atlas}
        identity={identity}
        signal={staleSignal}
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
