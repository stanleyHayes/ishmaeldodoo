import { describe, expect, it } from "vitest";
import { markFrenchStale, type LocalizedText } from "./types";
import { transitionContent, type ContentVersion } from "./workflow";
import { validateForPublication } from "./publication-validation";

const localised = (english: string, french: string): LocalizedText => ({
  "en-GB": english,
  "fr-FR": french,
  status: { "en-GB": "current", "fr-FR": "current" },
  sourceUpdatedAt: new Date("2026-08-09T00:00:00Z"),
});

const version: ContentVersion = {
  documentType: "signal",
  documentId: "signal-1",
  version: 1,
  state: "in_review",
  authorId: "author-1",
  payload: {},
};

describe("editorial workflow", () => {
  it("requires a different reviewer for policy-sensitive content", () => {
    expect(() =>
      transitionContent(
        version,
        "approve",
        { id: "author-1", roles: ["reviewer"] },
        { policySensitive: true },
      ),
    ).toThrow(/different approver/i);

    const approved = transitionContent(
      version,
      "approve",
      { id: "reviewer-2", roles: ["reviewer"] },
      { policySensitive: true },
    );
    expect(approved.state).toBe("approved");
    expect(approved.reviewerId).toBe("reviewer-2");
  });

  it("derives policy sensitivity from signal tags and records its approver", () => {
    const tagged = {
      ...version,
      payload: { tags: ["finance"], approvedBy: "forged-author-value" },
    };
    expect(() =>
      transitionContent(tagged, "approve", {
        id: "author-1",
        roles: ["reviewer"],
      }),
    ).toThrow(/different approver/i);
    const approved = transitionContent(tagged, "approve", {
      id: "reviewer-2",
      roles: ["reviewer"],
    });
    expect(approved.payload).toEqual(
      expect.objectContaining({ approvedBy: "reviewer-2" }),
    );
  });

  it("rejects invalid transitions and scheduling without a date", () => {
    expect(() =>
      transitionContent(version, "publish", {
        id: "reviewer-2",
        roles: ["reviewer"],
      }),
    ).toThrow(/cannot publish/i);
    const approved = { ...version, state: "approved" as const };
    expect(() =>
      transitionContent(approved, "schedule", {
        id: "reviewer-2",
        roles: ["reviewer"],
      }),
    ).toThrow(/publication time/i);
  });
});

describe("localisation and publication validation", () => {
  it("marks French stale when approved English source copy changes", () => {
    const updated = markFrenchStale(
      localised("Original", "Original FR"),
      "Changed",
    );
    expect(updated.status["fr-FR"]).toBe("stale");
  });

  it("blocks unconsented scholars and missing French content", () => {
    const result = validateForPublication(
      "scholar",
      {
        name: "Example Scholar",
        country: "GH",
        institution: "Example University",
        field: localised("Economics", ""),
        cohortYear: 2026,
        status: "active",
        story: localised("Story", "Histoire"),
        consentStatus: "pending",
      },
      "fr-FR",
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.join(" ")).toMatch(/translation is missing/i);
      expect(result.errors.join(" ")).toMatch(/granted consent/i);
    }
  });

  it("blocks sourced figures without their evidence and value type", () => {
    const result = validateForPublication(
      "atlasNode",
      {
        slug: "example-node",
        label: localised("Example", "Exemple"),
        institution: localised("Institution", "Institution"),
        role: localised("Role", "Rôle"),
        country: "GH",
        region: "Greater Accra",
        startDate: new Date("2020-01-01"),
        endDate: null,
        era: "current",
        themes: [],
        portfolioValue: 10,
        outcomes: [],
        sourceRefs: [],
      },
      "en-GB",
    );

    expect(result.valid).toBe(false);
    if (!result.valid)
      expect(result.errors.join(" ")).toMatch(/value type.*source reference/i);
  });

  it("rejects a policy-tagged signal without its independently recorded approver", () => {
    const payload = {
      slug: "policy-call",
      body: localised("Policy call", "Avis politique"),
      tags: ["finance"],
      confidence: "watching",
      changeMyMind: localised("New evidence", "Nouvelles preuves"),
      sourceRefs: ["source-1"],
      approvedBy: "author-1",
    };
    const result = validateForPublication("signal", payload, "en-GB", {
      authorId: "author-1",
      reviewerId: "author-1",
    });
    expect(result.valid).toBe(false);
    if (!result.valid)
      expect(result.errors.join(" ")).toMatch(/different recorded approver/i);
  });

  it("rejects a Signal publication without source evidence", () => {
    const payload = {
      slug: "unsourced-signal",
      body: localised("Signal body", "Corps du signal"),
      publishedAt: new Date("2026-08-10T00:00:00Z"),
      tags: ["finance"],
      confidence: "watching",
      changeMyMind: localised("New evidence", "Nouvelles preuves"),
      sourceRefs: [],
      approvedBy: "reviewer-1",
    };
    const result = validateForPublication("signal", payload, "en-GB", {
      authorId: "author-1",
      reviewerId: "reviewer-1",
    });
    expect(result.valid).toBe(false);
    if (!result.valid)
      expect(result.errors.join(" ")).toMatch(/without source evidence/i);
  });
});
