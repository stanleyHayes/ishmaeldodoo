import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuotableTranscript } from "./quotable-transcript";

describe("QuotableTranscript", () => {
  it("copies a selected passage with canonical speaker, venue, date and URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <QuotableTranscript
        transcript="The exact corrected passage travels accurately."
        transcriptStatus="corrected"
        speakerName="Dr Canonical Name"
        title="Public value address"
        type="speech"
        venue="Civic Forum"
        city="Accra"
        date={new Date("2026-08-01T00:00:00.000Z")}
        url="https://amanor.example/archive#address"
        locale="en-GB"
      />,
    );
    const transcript = screen.getByText(
      "The exact corrected passage travels accurately.",
    );
    vi.spyOn(window, "getSelection").mockReturnValue({
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => ({ commonAncestorContainer: transcript.firstChild! }),
      toString: () => "exact corrected passage",
    } as unknown as Selection);
    fireEvent.mouseUp(transcript);
    fireEvent.click(screen.getByRole("button", { name: "Plain" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0]?.[0]).toContain(
      "“exact corrected passage” — Dr Canonical Name, Public value address, Civic Forum, Accra, 1 August 2026. https://amanor.example/archive#address",
    );
    expect(screen.getByText("Citation copied.")).toBeInTheDocument();
  });

  it("warns before quoting an uncorrected machine transcript", () => {
    render(
      <QuotableTranscript
        transcript="Machine output"
        transcriptStatus="machine"
        title="Broadcast"
        type="broadcast"
        date={new Date("2026-08-01T00:00:00.000Z")}
        url="https://amanor.example/archive#broadcast"
        locale="en-GB"
      />,
    );
    expect(screen.getByText(/Uncorrected machine transcript/)).toBeVisible();
  });
});
