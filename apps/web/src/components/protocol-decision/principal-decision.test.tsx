import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrincipalDecision } from "./principal-decision";

const token = "a".repeat(43);

describe("Principal decision confirmation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("removes the capability fragment before explicit confirmation", async () => {
    window.history.replaceState(
      null,
      "",
      `/protocol-decision#token=${token}&action=accept`,
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ reference: "PD-2026-0042", state: "accepted" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<PrincipalDecision locale="en-GB" />);

    await screen.findByText("Accept");
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(token);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Decision note"), {
      target: { value: "Approved after final review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm decision" }));

    await screen.findByText("Decision recorded");
    expect(screen.getByText("PD-2026-0042")).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      token,
      action: "accept",
      reason: "Approved after final review",
    });
  });

  it("renders French decline controls and never submits an incomplete action", async () => {
    window.history.replaceState(
      null,
      "",
      `/fr/protocol-decision#token=${token}&action=decline`,
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PrincipalDecision locale="fr-FR" />);

    await screen.findByText("Refuser");
    expect(screen.getByLabelText("Motif du refus")).toHaveValue("capacity");
    expect(
      screen.getByRole("button", { name: "Confirmer la décision" }),
    ).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a safe recovery message for a malformed fragment", async () => {
    window.history.replaceState(
      null,
      "",
      "/protocol-decision#token=short&action=accept",
    );
    render(<PrincipalDecision locale="en-GB" />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This decision link is incomplete",
      ),
    );
    expect(window.location.hash).toBe("");
  });
});
