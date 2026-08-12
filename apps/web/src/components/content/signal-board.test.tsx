import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignalBoard } from "./signal-board";

describe("SignalBoard", () => {
  it("separates watching Signals from Foresight Ledger entries and renders sources", () => {
    render(
      <SignalBoard
        locale="en-GB"
        signals={{
          translation: { stale: false },
          items: [
            {
              documentId: "watch",
              slug: "watch",
              body: "Watching body",
              publishedAt: new Date("2026-08-12"),
              tags: ["watch"],
              confidence: "watching",
              changeMyMind: "Evidence",
              sourceRefs: ["source-watch"],
            },
            {
              documentId: "call",
              slug: "call",
              body: "Calling body",
              publishedAt: new Date("2026-08-11"),
              tags: ["call"],
              confidence: "callingIt",
              changeMyMind: "Evidence",
              sourceRefs: ["source-call"],
              reviewDue: new Date("2026-09-11"),
              resolution: "heldUp",
              resolutionNote: "Verified outcome",
              resolvedAt: new Date("2026-09-12"),
            },
          ],
        }}
      />,
    );
    expect(screen.getByText(/1 in the Foresight Ledger/)).toBeInTheDocument();
    expect(screen.getByText("Watching")).toBeInTheDocument();
    expect(screen.getByText("Held up")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "source-call" })).toHaveAttribute(
      "href",
      "/record/sources#source-call",
    );
  });
});
