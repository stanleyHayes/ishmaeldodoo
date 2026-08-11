import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackAnalyticsEvent } from "../../lib/analytics-client";
import { PressKitForm } from "./press-kit-form";

vi.mock("../../lib/analytics-client", () => ({ trackAnalyticsEvent: vi.fn() }));

describe("PressKitForm analytics", () => {
  beforeEach(() => {
    vi.mocked(trackAnalyticsEvent).mockClear();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:kit"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );
  });

  it("records a successful request without requester fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("kit", { status: 200 })),
    );
    render(<PressKitForm locale="en-GB" />);
    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Ama Mensah" },
    });
    fireEvent.change(screen.getByLabelText("Outlet"), {
      target: { value: "The Daily" },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ama@example.org" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Generate press kit" })
        .closest("form")!,
    );
    await waitFor(() =>
      expect(trackAnalyticsEvent).toHaveBeenCalledWith({
        name: "press_kit_requested",
        route: "/press",
        locale: "en-GB",
      }),
    );
    expect(
      JSON.stringify(vi.mocked(trackAnalyticsEvent).mock.calls),
    ).not.toMatch(/Ama Mensah|The Daily|ama@example/u);
  });

  it("does not record a failed request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );
    render(<PressKitForm locale="fr-FR" />);
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Générer le dossier" })
        .closest("form")!,
    );
    await screen.findByRole("alert");
    expect(trackAnalyticsEvent).not.toHaveBeenCalled();
  });
});
