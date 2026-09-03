import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsConsentControl } from "./analytics-consent";

describe("AnalyticsConsentControl", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("offers equal explicit choices and records a denial", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AnalyticsConsentControl locale="en-GB" initialConsent={null} />);
    expect(
      screen.getByRole("button", { name: "Allow measurement" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await screen.findByText("No analytics");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analytics/consent",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ granted: false }),
      }),
    );
  });

  it("dismisses and persists a choice even when the server is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<AnalyticsConsentControl locale="en-GB" initialConsent={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Allow measurement" }));
    expect(
      await screen.findByText("Anonymous analytics enabled"),
    ).toBeVisible();
    expect(document.cookie).toContain("amanor-analytics=granted");
  });

  it("emits one pageview per route session only after consent", async () => {
    window.sessionStorage.clear();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const first = render(
      <AnalyticsConsentControl locale="en-GB" initialConsent="granted" />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<AnalyticsConsentControl locale="en-GB" initialConsent="granted" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lets a visitor reopen their choice", () => {
    render(<AnalyticsConsentControl locale="fr-FR" initialConsent="denied" />);
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    expect(
      screen.getByRole("heading", {
        name: "Mesure respectueuse de la vie privée",
      }),
    ).toBeVisible();
  });
});
