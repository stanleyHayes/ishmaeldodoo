import { describe, expect, it, vi } from "vitest";
import { ProtocolNoteService, protocolNoteHtml } from "./protocol-note.service";
import type { EngagementRequest } from "../domain/engagement-request";

function view(
  capacity: "official" | "personal",
  locale: "en-GB" | "fr-FR" = "en-GB",
): Parameters<typeof protocolNoteHtml>[0] {
  const request = {
    reference: "PD-2026-0417",
    locale,
    state: "accepted",
    capacity,
    engagement: {
      type: "keynote",
      eventName: "Finance <Forum>",
      startsAt: new Date("2026-12-01T09:00:00Z"),
    },
    ask: {
      recording: true,
      transcriptRights: false,
      republicationRights: true,
    },
    logistics: {
      travel: "host_covered",
      honorarium: "offered",
      invitationLetter: true,
      visaLetter: false,
      governmentProtocol: true,
      contactName: "Host <script>",
      contactPhone: "+233200000000",
    },
  } as unknown as EngagementRequest;
  return {
    request,
    input: {
      speakerContactName: "Amanor Desk",
      speakerContactEmail: "desk@example.test",
      technicalRequirements: ["HDMI <adapter>"],
      logistics: [],
      accessibilityRequirements: [],
      lecternRequired: false,
    },
    identity: {
      legalName: "Ishmael Nii Amanor Dodoo",
      honorific: "Dr.",
      shortName: "Dr. Dodoo",
      bio120: "Approved biography.",
      portraits: ["11111111-1111-4111-8111-111111111111"],
      titleHistory: [],
    },
    currentTitle: {
      title: "Current title",
      organisation: "Current organisation",
      from: new Date("2025-01-01T00:00:00Z"),
      to: null,
    },
    rider: {
      key: "keynote-default",
      name: "Keynote rider",
      engagementType: "keynote",
      logistics: ["Business travel"],
      technicalRequirements: ["Lapel microphone"],
      timing: ["Arrive 45 minutes before the engagement"],
      travelAndAccommodation: ["Flexible ticket required"],
      recordingAndRepublication: ["Written permission required"],
      honorariumTerms: ["Personal-capacity terms apply"],
      protocolRequirements: ["Invitation letter required"],
      contactRequirements: ["Named contacts on both sides"],
      accessibilityRequirements: [],
      versionLabel: "v1",
    },
    portrait: {
      imageDataUri: "data:image/png;base64,AA==",
      credit: "Approved photographer",
      licence: "Editorial use",
    },
    generatedAt: new Date("2026-08-10T00:00:00Z"),
  };
}

describe("Protocol Note PDF view", () => {
  it("denies non-operators and pre-acceptance requests before content access", async () => {
    const findRequest = vi.fn().mockResolvedValue({ state: "screened" });
    const cms = { publicProjection: vi.fn() };
    const service = new ProtocolNoteService(
      { findRequest } as never,
      cms as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const input = {
      speakerContactName: "Amanor Desk",
      speakerContactEmail: "desk@example.test",
      technicalRequirements: [],
      logistics: [],
      accessibilityRequirements: [],
    };
    await expect(
      service.generate("request-1", input, ["editor"]),
    ).rejects.toThrow(/operator role/u);
    await expect(
      service.generate("request-1", input, ["desk_officer"]),
    ).rejects.toThrow(/only after configuration/u);
    expect(cms.publicProjection).not.toHaveBeenCalled();
  });

  it("requires the persisted acceptance configuration for stored generation", async () => {
    const findRequest = vi.fn().mockResolvedValue({
      state: "accepted",
      protocolNoteConfiguration: undefined,
    });
    const service = new ProtocolNoteService(
      { findRequest } as never,
      { publicProjection: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.generateStored("request-1", ["editor"]),
    ).rejects.toThrow(/operator role/u);
    await expect(
      service.generateStored("request-1", ["desk_officer"]),
    ).rejects.toThrow(/configuration is unavailable/u);
    expect(findRequest).toHaveBeenCalledTimes(1);
  });

  it("suppresses honorarium under every official-capacity render path", () => {
    const html = protocolNoteHtml(view("official"));
    expect(html).not.toContain("Honorarium");
    expect(html).not.toContain("offered");
  });

  it("renders personal-capacity honorarium and escapes all request overrides", () => {
    const html = protocolNoteHtml(view("personal"));
    expect(html).toContain("Honorarium");
    expect(html).toContain("Offered");
    expect(html).toContain("Host covered");
    expect(html).toContain("Finance &lt;Forum&gt;");
    expect(html).toContain("HDMI &lt;adapter&gt;");
    expect(html).not.toContain("<script>");
  });

  it("renders the French document labels from the same governed data", () => {
    const frenchView = view("official", "fr-FR");
    const html = protocolNoteHtml(frenchView);
    expect(html).toContain("NOTE DE PROTOCOLE");
    expect(html).toContain("Biographie approuvée");
    expect(html).toContain("Exigences techniques");
    expect(html).toContain("Pris en charge par l’hôte");
    expect(html).not.toContain("host covered");
  });
});
