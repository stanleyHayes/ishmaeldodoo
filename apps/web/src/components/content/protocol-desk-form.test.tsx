import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackAnalyticsEvent } from "../../lib/analytics-client";
import { ProtocolDeskForm } from "./protocol-desk-form";
vi.mock("../../lib/analytics-client", () => ({ trackAnalyticsEvent: vi.fn() }));

const change = (label: string | RegExp, value: string) => {
  const control = screen
    .getAllByLabelText(label)
    .find(
      (element) =>
        !(element.closest("fieldset") as HTMLFieldSetElement | null)?.hidden,
    );
  if (!control) throw new Error(`Visible control not found: ${String(label)}`);
  fireEvent.change(control, { target: { value } });
};
const continueFlow = () =>
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

describe("ProtocolDeskForm", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(trackAnalyticsEvent).mockClear();
    vi.unstubAllGlobals();
  });

  it("completes all six steps, submits the domain payload and shows the reference", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ reference: "PD-2026-0042", state: "received" }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<ProtocolDeskForm locale="en-GB" />);
    fireEvent.click(screen.getByLabelText(/personal capacity/));
    continueFlow();
    change("Organisation name", "African Finance Forum");
    change("Organisation type", "multilateral");
    change("Country (2-letter code)", "GH");
    change("Your name", "Ama Mensah");
    change("Your role", "Director");
    change("Work email", "ama@example.org");
    continueFlow();
    change("Type", "keynote");
    change("Event name", "Finance Forum");
    change("Start date", "2026-12-01");
    change("City", "Accra");
    change("Country (2-letter code)", "GH");
    change("Format", "in_person");
    change("Language", "english");
    change("Expected audience size", "200");
    change(
      /Who will be in the room/,
      "Senior public and private finance leaders",
    );
    continueFlow();
    change("Proposed theme or title", "Financing transformation");
    change(
      /What should the audience leave with/,
      "Understand practical routes from ambition to investment.",
    );
    continueFlow();
    change("Travel and accommodation", "host_covered");
    change("Honorarium", "discuss");
    change("On-the-ground contact", "Kojo Annan");
    change("Contact phone", "+233200000000");
    continueFlow();
    fireEvent.click(screen.getByLabelText(/consent to this data/));
    fireEvent.click(screen.getByLabelText(/authorised to invite/));
    fireEvent.click(screen.getByRole("button", { name: "Submit invitation" }));
    await screen.findByText("PD-2026-0042");
    const submitted = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(submitted).toMatchObject({
      locale: "en-GB",
      capacity: "personal",
      engagement: { type: "keynote", audienceSize: 200 },
      logistics: { honorarium: "discuss" },
      consent: { dataProcessing: true, authorityToInvite: true },
    });
    expect(localStorage.getItem("amanor:protocol-desk:en-GB:v1")).toBeNull();
    expect(trackAnalyticsEvent).toHaveBeenNthCalledWith(1, {
      name: "protocol_desk_started",
      route: "/speaking/request",
      locale: "en-GB",
    });
    expect(trackAnalyticsEvent).toHaveBeenNthCalledWith(2, {
      name: "protocol_desk_completed",
      route: "/speaking/request",
      locale: "en-GB",
    });
    expect(
      JSON.stringify(vi.mocked(trackAnalyticsEvent).mock.calls),
    ).not.toMatch(/PD-2026-0042|Ama Mensah|ama@example/u);
  });

  it("restores both saved values and the saved step", async () => {
    localStorage.setItem(
      "amanor:protocol-desk:fr-FR:v1",
      JSON.stringify({ capacity: "personal", eventName: "Forum régional" }),
    );
    localStorage.setItem("amanor:protocol-desk:fr-FR:v1:step", "2");
    render(<ProtocolDeskForm locale="fr-FR" />);
    expect(
      await screen.findByText("Progression enregistrée restaurée."),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "L’intervention" })).toBeVisible();
    expect(screen.getByLabelText("Nom de l’événement")).toHaveValue(
      "Forum régional",
    );
  });

  it("suppresses honorarium controls immediately for official capacity", () => {
    render(<ProtocolDeskForm locale="en-GB" />);
    fireEvent.click(screen.getByLabelText(/official role/));
    expect(screen.getByRole("note")).toHaveTextContent(/No honorarium/);
    expect(screen.queryByLabelText("Honorarium")).not.toBeInTheDocument();
  });

  it("explains conservative human review when the requester is unsure", () => {
    render(<ProtocolDeskForm locale="fr-FR" />);
    fireEvent.click(screen.getByLabelText("Je ne suis pas certain(e)"));
    expect(screen.getByRole("note")).toHaveTextContent(
      /classera la demande de façon prudente/,
    );
    expect(screen.getByLabelText(/Quel rôle ou programme/)).toBeRequired();
    expect(screen.getByLabelText(/Qui finance/)).toBeRequired();
  });

  it("retains the current step and announces an error when submission fails", async () => {
    localStorage.setItem(
      "amanor:protocol-desk:en-GB:v1",
      JSON.stringify({
        eventDate: "2026-12-01",
        eventTime: "09:00",
        dataProcessing: true,
        authorityToInvite: true,
      }),
    );
    localStorage.setItem("amanor:protocol-desk:en-GB:v1:step", "5");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
    );
    render(<ProtocolDeskForm locale="en-GB" />);
    await waitFor(() =>
      expect(
        screen.getByRole("group", { name: "Review and confirm" }),
      ).toBeVisible(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not be submitted/,
    );
    expect(localStorage.getItem("amanor:protocol-desk:en-GB:v1:step")).toBe(
      "5",
    );
    expect(trackAnalyticsEvent).not.toHaveBeenCalled();
  });
});
